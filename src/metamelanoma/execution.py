"""The single parallel dispatcher for R2/R3, with explicit metered retries."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import random
import re
import time
from queue import SimpleQueue

from .accounting import BudgetBlocked, canonical, now, owned, quote
from .transport import NativeTransport

LOCAL_CEILING = 128
MAX_ATTEMPTS = 3


def duration(value):
    if not isinstance(value, str):
        return None
    try:
        number = float(value)
        return max(0.0, number) if number < float('inf') else None
    except ValueError:
        pass
    parts = re.findall(r'(\d+(?:\.\d+)?)(ms|s|m|h)', value)
    if parts and ''.join(n + unit for n, unit in parts) == value:
        return sum(float(n) * {'ms': .001, 's': 1, 'm': 60, 'h': 3600}[unit] for n, unit in parts)
    return None


def retry_delay(headers, ordinal, *, clock=time.time, jitter=random.uniform):
    """Never retry earlier than Retry-After; add bounded randomized backoff."""
    delay = duration(headers.get('retry-after-ms', ''))
    delay = delay / 1000 if delay is not None else None
    after = headers.get('retry-after')
    if after is not None:
        seconds = duration(after)
        if seconds is None:
            try:
                seconds = max(0, parsedate_to_datetime(after).timestamp() - clock())
            except (ValueError, TypeError, OverflowError):
                pass
        if seconds is not None:
            delay = max(delay or 0, seconds)
    exponential = min(60, 2 ** max(0, ordinal - 1))
    return max(delay or 0, exponential) + jitter(0, min(1, exponential / 4))


class RateLimits:
    """Model-specific observed request/token windows under one local ceiling."""
    def __init__(self, ceiling=32, *, clock=time.time):
        if type(ceiling) is not int or not 1 <= ceiling <= LOCAL_CEILING:
            raise ValueError('Local concurrency must be between 1 and 128')
        self.ceiling, self.clock, self.models = ceiling, clock, {}

    def _model(self, model):
        return self.models.setdefault(model, {'limit': self.ceiling, 'requests': None, 'tokens': None,
                                              'request_reset': 0, 'token_reset': 0, 'blocked_until': 0})

    def can_send(self, task, active):
        item = self._model(task['model'])
        current = self.clock()
        for name in ('request', 'token'):
            key = 'requests' if name == 'request' else 'tokens'
            if current >= item[name + '_reset'] and item[name + '_reset']:
                item[key] = None
                item[name + '_reset'] = 0
        token_bound = quote(task)['input_token_upper_bound'] + task['body']['max_output_tokens']
        return (current >= item['blocked_until'] and active < item['limit']
                and (item['requests'] is None or item['requests'] > 0)
                and (item['tokens'] is None or item['tokens'] >= token_bound))

    def sent(self, task):
        item = self._model(task['model'])
        if item['requests'] is not None:
            item['requests'] -= 1
        if item['tokens'] is not None:
            item['tokens'] -= quote(task)['input_token_upper_bound'] + task['body']['max_output_tokens']

    def observe(self, model, result):
        item = self._model(model)
        headers = result.get('headers') or {}
        current = self.clock()
        for name, plural in (('request', 'requests'), ('token', 'tokens')):
            remaining = headers.get('x-ratelimit-remaining-' + plural)
            reset = duration(headers.get('x-ratelimit-reset-' + plural, ''))
            try:
                remaining = int(remaining) if remaining is not None else None
            except (ValueError, TypeError):
                remaining = None
            if remaining is not None and remaining >= 0:
                # Outstanding calls may not yet be represented in this header;
                # never increase a known remainder inside the same window.
                item[plural] = min(item[plural], remaining) if item[plural] is not None else remaining
                item[name + '_reset'] = max(item[name + '_reset'], current + (reset if reset is not None else 60))
        if result.get('http_status') in {429, 503}:
            item['limit'] = max(1, item['limit'] // 2)
            item['blocked_until'] = max(item['blocked_until'], current + retry_delay(headers, 1))
        return item


def _deadline(value):
    if value is None:
        return None
    if isinstance(value, str):
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if result.tzinfo is None:
            raise ValueError('Deadline must include a timezone')
        return result.timestamp()
    return float(value)


def execute(tasks, *, journal, on_result, progress=None, transport=None, gate=None,
            max_workers=32, max_attempts=3, deadline=None, max_retry_seconds=900,
            rate_limits=None, clock=time.time, sleep=time.sleep):
    """Run reviewed immutable tasks; callbacks and journal writes stay serial.

    Only transient transport/provider failures receive bounded new attempts.
    Scientific failures, incomplete output, missing artifacts, and unsettled
    sends remain held. A restart never blindly resends an interrupted attempt.
    The caller owns a finite scientific plan and passes a pre-send gate(task).
    """
    if type(max_attempts) is not int or not 1 <= max_attempts <= MAX_ATTEMPTS:
        raise ValueError('One to three explicit attempts required')
    if not callable(on_result):
        raise ValueError('A serial result/registry callback is required')
    if not 0 < max_retry_seconds <= 3600:
        raise ValueError('Retry time must be bounded by one hour')
    deadline = _deadline(deadline)
    if type(max_workers) is not int or not 1 <= max_workers <= LOCAL_CEILING:
        raise ValueError('Local worker count must be between 1 and 128')
    if rate_limits is not None and not isinstance(rate_limits, RateLimits):
        raise ValueError('Shared rate_limits must be a canonical RateLimits instance')
    limiter = rate_limits or RateLimits(max_workers, clock=clock)
    transport = transport or NativeTransport(root=journal.root)
    tasks = list(tasks)
    ids = [task['task_id'] for task in tasks]
    if len(set(ids)) != len(ids):
        raise ValueError('Finite task IDs must be unique')
    queue, futures, stop_reason = [], {}, None
    started = clock()
    last_emit = started
    sent_events = SimpleQueue()
    sent_task_ids = set()
    journal.recover_interrupted()
    for task in tasks:
        journal.register(task)
        state = journal.task(task['task_id'])
        if state['state'] in {'received', 'callback_error'} or (state['state'] == 'provider_hold' and state['callback'] is None and state['result'] is not None):
            try:
                journal.callback(task['task_id'], on_result(task, state['result']))
            except Exception as exc:
                journal.callback(task['task_id'], {'status': 'callback_error', 'exception_type': type(exc).__name__}, error=True)
        elif state['state'] in {'pending', 'retry_wait'}:
            history = journal.attempts_for(task['task_id'])
            first_at = datetime.fromisoformat(history[0]['record']['reserved_at']).timestamp() if history else None
            repair_window = getattr(journal, 'approved_retry_window', lambda _task_id: None)(task['task_id'])
            if repair_window is not None:
                first_at = repair_window['started_at']
            next_cap = (state['result'] or {}).get('retry_request_max_output_tokens', task['body']['max_output_tokens'])
            queue.append((task, state['next_retry'] or 0, first_at, next_cap))
        # running/reserved without a committed result is an explicit hold. It
        # remains counted in status and is never turned into a fresh HTTP call.

    def emit(phase):
        nonlocal last_emit
        last_emit = clock()
        events = []
        while not sent_events.empty():
            event = sent_events.get()
            sent_task_ids.add(event['task_id'])
            events.append(event)
        if progress is not None:
            progress({'phase': phase, 'as_of': now(), 'selected_tasks': len(tasks), 'pending': len(queue),
                      'active': len(futures), 'stop_reason': stop_reason, 'budget': journal.status(),
                      'configured_concurrency': max_workers, 'observed_native_http_overlap': None,
                      'events': events, 'sent_task_ids': sorted(sent_task_ids)})

    def callback(task, result):
        try:
            value = on_result(task, result)
            canonical(value)
            journal.callback(task['task_id'], value)
        except Exception as exc:
            journal.callback(task['task_id'], {'status': 'callback_error', 'exception_type': type(exc).__name__}, error=True)

    emit('running')
    interrupted = False
    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix='openai-http') as executor:
        try:
            while queue or futures:
                if deadline is not None and clock() >= deadline:
                    stop_reason = 'authorization_deadline'
                if journal.status()['frozen_reason']:
                    stop_reason = journal.status()['frozen_reason']
                hold = journal.root / 'data/current/HOLD'
                if stop_reason is None and (hold.exists() or hold.is_symlink()):
                    stop_reason = 'administrative_hold'
                made_progress = False
                capacity_blocked = False
                if stop_reason is None:
                    for item in list(queue):
                        if len(futures) >= max_workers:
                            break
                        task, due, retry_started, request_cap = item
                        actual_task = {**task, 'body': {**task['body'], 'max_output_tokens': request_cap}}
                        if due > clock():
                            continue
                        active_model = sum(t['model'] == task['model'] for t, _, _ in futures.values())
                        if not limiter.can_send(actual_task, active_model):
                            continue
                        try:
                            if gate is not None and gate(task) is False:
                                raise BudgetBlocked('Administrative/source gate holds dispatch')
                            attempt = journal.reserve(task, max_attempts=max_attempts, request_body=actual_task['body'])
                        except BudgetBlocked as exc:
                            if exc.code == 'reservation_capacity':
                                capacity_blocked = True
                                continue
                            stop_reason = str(exc)
                            break
                        except Exception as exc:
                            stop_reason = 'preflight_' + type(exc).__name__
                            break
                        queue.remove(item)
                        if retry_started is None:
                            retry_started = datetime.fromisoformat(attempt['reserved_at']).timestamp()
                        journal.started(attempt['attempt_id'])
                        directory = owned(journal.root, journal.path.parent / 'calls' / attempt['attempt_id'])
                        future = executor.submit(transport.send, actual_task, attempt['attempt_id'], directory,
                                                 gate=gate, on_sent=sent_events.put)
                        futures[future] = (task, attempt, retry_started)
                        limiter.sent(actual_task)
                        made_progress = True
                    if capacity_blocked and not futures:
                        stop_reason = 'No queued full attempt fits the remaining authorized liability'
                if futures:
                    done, _ = wait(futures, timeout=.25, return_when=FIRST_COMPLETED)
                    for future in done:
                        task, attempt, retry_started = futures.pop(future)
                        try:
                            result = future.result()
                        except Exception as exc:
                            # A worker might fail after the provider accepted a
                            # request; the full reservation must survive.
                            result = {'status': 'provider_problem', 'sent': True, 'usage': None,
                                      'error': {'type': 'worker_exception', 'exception_type': type(exc).__name__},
                                      'retryable': False, 'artifacts': {}}
                        limiter.observe(task['model'], result)
                        provider_error = (result.get('response') or {}).get('error') or {}
                        provider_code = str(provider_error.get('code') or provider_error.get('type') or '') if isinstance(provider_error, dict) else ''
                        if result.get('http_status') in {401, 403} or any(word in provider_code.lower() for word in ('quota', 'billing', 'payment', 'account_deactivated')):
                            stop_reason = 'provider_account_action_required'
                        retry_at = None
                        current_cap = attempt['max_output_tokens']
                        ceiling = task.get('metadata', {}).get('max_output_tokens_ceiling')
                        incomplete = ((result.get('error') or {}).get('type') == 'incomplete_output'
                                      and ((result.get('error') or {}).get('details') or {}).get('reason') == 'max_output_tokens'
                                      and type(ceiling) is int and current_cap < ceiling)
                        next_cap = min(ceiling, current_cap * 2) if incomplete else current_cap
                        administrative_hold = (stop_reason in {'preflight_PermissionError', 'administrative_hold'}
                            and ((journal.root / 'data/current/HOLD').exists()
                                 or (journal.root / 'data/current/HOLD').is_symlink())
                            and not journal.status()['frozen_reason'])
                        if ((stop_reason is None or administrative_hold and incomplete)
                                and (result.get('retryable') is True or incomplete)
                                and attempt['ordinal'] < max_attempts):
                            retry_at = clock() + retry_delay(result.get('headers') or {}, attempt['ordinal'], clock=clock)
                            if retry_at > retry_started + max_retry_seconds or (deadline is not None and retry_at >= deadline):
                                retry_at = None
                            if retry_at is not None:
                                result = {**result, 'retry_request_max_output_tokens': next_cap,
                                          'retry_kind': 'increased_output_cap' if incomplete else 'transient_provider'}
                        journal.finish(attempt['attempt_id'], result, retry_at=retry_at)
                        if journal.task(task['task_id'])['state'] != 'retry_wait':
                            retry_at = None
                        if (result.get('error') or {}).get('type') in {'duplicate_provider_identity', 'missing_provider_identity'}:
                            retry_at = None
                        if retry_at is not None:
                            queue.append((task, retry_at, retry_started, next_cap))
                        else:
                            callback(task, result)
                        made_progress = True
                elif stop_reason is not None:
                    break
                elif queue and not made_progress:
                    sleep(.25)
                if made_progress or clock() - last_emit >= 5:
                    emit('draining' if stop_reason else 'running' if futures else 'waiting')
        except KeyboardInterrupt:
            interrupted = True
            stop_reason = 'interrupted_draining'
            # Do not cancel a request that may already be accepted. The executor
            # drains every worker before the coordinator settles its reservation.
        finally:
            for future in list(futures):
                task, attempt, _ = futures.pop(future)
                try:
                    result = future.result()
                except BaseException as exc:
                    result = {'status': 'provider_problem', 'sent': True, 'usage': None,
                              'error': {'type': 'drain_exception', 'exception_type': type(exc).__name__}, 'retryable': False}
                journal.finish(attempt['attempt_id'], result)
                callback(task, result)
            emit('held' if stop_reason else 'finished')
    proof = journal.verify()
    return {'phase': 'held' if stop_reason else 'finished', 'stop_reason': stop_reason,
            'selected_tasks': len(tasks), 'pending': len(queue), 'interrupted': interrupted,
            'sent_task_ids': sorted(sent_task_ids),
            'elapsed_seconds': clock() - started, 'budget': journal.status(), 'accounting_verification': proof}

