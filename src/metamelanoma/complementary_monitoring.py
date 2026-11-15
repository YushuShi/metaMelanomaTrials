"""Read-only complementary-review monitoring; never dispatches model requests.

The only writes made by save_report are local monitoring artifacts. The SQLite
connection is read-only and query-only, and no runner/journal constructor is used.
"""
from __future__ import annotations

from collections import Counter
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import re
import sqlite3

from .io import atomic_bytes, atomic_json, canonical, digest, now, owned, reference, verified_json

JOURNAL = 'data/current/gateway_accounting.sqlite3'
RUN_ID = 'melanoma-opus-complementary-20261114'


def _json(value, default=None):
    return json.loads(value) if value else default


def _reason(value):
    value = _json(value)
    if isinstance(value, dict):
        return str(value.get('code') or value.get('type') or 'source_hold'), str(value.get('reason') or value.get('message') or value)
    return str(value or 'unspecified'), str(value or 'No reason recorded')


def _positive(value):
    try:
        amount = Decimal(str(value))
        return amount if amount.is_finite() and amount > 0 else None
    except InvalidOperation:
        return None


def _artifact_state(root, record):
    """Local dispatch state, not an assertion about a remote provider's process."""
    directory = record.get('artifact_dir')
    if not directory:
        return 'unresolved_journal_entry'
    for name in ('receipt.json', 'result.json', 'response.body'):
        if owned(root, Path(directory) / name).is_file():
            return 'returned_awaiting_accounting'
    if owned(root, Path(directory) / 'sent.json').is_file():
        return 'sent_awaiting_response'
    return 'reserved_not_sent'


def _brief_finding(pmid, row, kind):
    finding = row.get('finding', row)
    issue = row.get('issue') or {}
    target = finding.get('target') or issue.get('target') or {}
    return {'pmid': pmid, 'kind': kind,
            'finding_id': finding.get('id') or issue.get('finding_id'),
            'code': issue.get('code') or kind,
            'reason': issue.get('code') or finding.get('reason') or kind,
            'stage': target.get('stage'), 'field_path': target.get('field_path'),
            'domain': finding.get('domain')}


def snapshot(root, run_id=RUN_ID):
    """Return counts, explicit PMID holds, dispatch state, and accounting context."""
    root = Path(root).resolve()
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', run_id):
        raise ValueError('Safe run identifier required')
    path = owned(root, JOURNAL)
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute('PRAGMA query_only=ON')
        connection.execute('BEGIN')
        stored_run = connection.execute('SELECT * FROM complementary_runs WHERE run_id=?', (run_id,)).fetchone()
        if stored_run is None:
            raise ValueError('Unknown complementary run')
        run = dict(stored_run)
        policy = _json(run['policy'], {})
        articles = [dict(row) for row in connection.execute('SELECT * FROM complementary_articles WHERE run_id=? ORDER BY ordinal', (run_id,))]
        attempts = [dict(row) for row in connection.execute('SELECT * FROM complementary_attempts WHERE run_id=? ORDER BY pmid,ordinal', (run_id,))]
        parallelism = {'current': None, 'maximum': policy.get('maximum_parallelism', 128),
                       'initial': policy.get('initial_parallelism', 32), 'last_change_at': None,
                       'event_seq': None}
        activity = {'created_at': run['created_at'], 'first_dispatch_at': None,
                    'first_completion_at': None, 'last_completion_at': None,
                    'last_event_at': None, 'last_event_kind': None, 'oldest_sent_at': None}
        for row in connection.execute('SELECT seq,payload FROM complementary_events ORDER BY seq'):
            event = json.loads(row['payload'])
            if event.get('run_id') != run_id:
                continue
            activity['last_event_at'], activity['last_event_kind'] = event.get('at'), event.get('kind')
            if event.get('kind') == 'complementary_attempt_reserved':
                activity['first_dispatch_at'] = activity['first_dispatch_at'] or event.get('at')
            if event.get('kind') == 'complementary_attempt_finished':
                activity['first_completion_at'] = activity['first_completion_at'] or event.get('at')
                activity['last_completion_at'] = event.get('at')
            if event.get('kind') == 'complementary_runner_started':
                parallelism.update(current=event.get('parallelism'), maximum=event.get('maximum_parallelism'),
                                   last_change_at=event.get('at'), event_seq=row['seq'])
            elif event.get('kind') == 'complementary_parallelism_changed':
                parallelism.update(current=event.get('current'), last_change_at=event.get('at'), event_seq=row['seq'])
    finally:
        connection.close()

    counts = Counter(article['state'] for article in articles)
    dispatch = Counter()
    active = []
    known, known_count = Decimal(0), 0
    unknown = Counter()
    recent_attempt = {}
    for attempt in attempts:
        pmid = attempt['pmid']
        record = _json(attempt['record'], {})
        recent_attempt[pmid] = (attempt, record)
        cost = _positive(attempt.get('cost_usd'))
        if cost is not None:
            known += cost
            known_count += 1
        running = attempt['state'] == 'running'
        if running:
            state = _artifact_state(root, record)
            dispatch[state] += 1
            entry = {'pmid': pmid, 'attempt_id': attempt['attempt_id'], 'attempt': attempt['ordinal'],
                     'local_state': state, 'reserved_at': record.get('reserved_at')}
            if state == 'sent_awaiting_response':
                try:
                    sent = json.loads(owned(root, Path(record['artifact_dir']) / 'sent.json').read_bytes())
                    entry['sent_at'] = sent.get('started_at')
                except (OSError, ValueError):
                    entry['sent_at'] = None
                if entry.get('sent_at') and (not activity['oldest_sent_at'] or entry['sent_at'] < activity['oldest_sent_at']):
                    activity['oldest_sent_at'] = entry['sent_at']
            active.append(entry)
        if attempt.get('cost_status') == 'unknown':
            unknown['active_or_pending_accounting' if running else 'settled'] += 1
            if running:
                unknown[state] += 1
        elif attempt.get('cost_status') == 'not_sent':
            unknown['not_sent'] += 1

    issues = {'source_holds': [], 'technical_holds': [], 'uncertain_sends': [],
              'retry_waits': [], 'field_holds': [], 'unresolved_findings': [], 'monitoring_artifact_issues': []}
    for article in articles:
        pmid, state = article['pmid'], article['state']
        destination = {'source_hold': 'source_holds', 'technical_hold': 'technical_holds',
                       'held_uncertain_send': 'uncertain_sends', 'retry_wait': 'retry_waits'}.get(state)
        review = None
        if article.get('result_ref'):
            try:
                review = verified_json(root, json.loads(article['result_ref']))
            except (OSError, ValueError, KeyError) as exc:
                issues['monitoring_artifact_issues'].append({'pmid': pmid, 'code': 'review_artifact_unavailable',
                    'reason': 'Saved review could not be verified: ' + type(exc).__name__})
        if destination:
            code, reason = _reason(article.get('reason'))
            entry = {'pmid': pmid, 'state': state, 'code': code, 'reason': reason,
                     'attempts': article.get('attempts', 0)}
            if state == 'retry_wait':
                entry['next_retry_epoch'] = article.get('next_retry')
            if review:
                try:
                    transport = verified_json(root, review['transport_result_ref'])
                    choices = (transport.get('response') or {}).get('choices') or []
                    # Deliberately exclude provider reasoning/signatures/content.
                    entry['http_status'] = transport.get('http_status')
                    entry['finish_reasons'] = [choice.get('finish_reason') for choice in choices if isinstance(choice, dict)]
                    if entry['finish_reasons']:
                        entry['reason'] += '; finish_reason=' + ','.join(str(value) for value in entry['finish_reasons'])
                except (OSError, ValueError, KeyError) as exc:
                    issues['monitoring_artifact_issues'].append({'pmid': pmid, 'code': 'transport_artifact_unavailable',
                        'reason': 'Transport receipt could not be verified: ' + type(exc).__name__})
            issues[destination].append(entry)
        if review:
            validation = review.get('validation') or {}
            for finding in validation.get('held_findings', []):
                issues['field_holds'].append(_brief_finding(pmid, finding, 'field_validation_hold'))
            for finding in validation.get('accepted_findings', []):
                if finding.get('action') == 'unresolved':
                    issues['unresolved_findings'].append(_brief_finding(pmid, finding, 'source_unclear'))

    issue_counts = {name: len(rows) for name, rows in issues.items()}
    issue_codes = {name: dict(Counter(row['code'] for row in rows)) for name, rows in issues.items()}
    completed = counts['completed'] + counts['completed_with_holds']
    return {'schema': 'melanoma_complementary_monitor_v1', 'as_of': now(), 'run_id': run_id,
            'run_state': run['state'], 'fatal': run['fatal'],
            'phase': 'final' if run['state'] == 'finished' else 'interim',
            'totals': {'articles': len(articles), 'completed': completed, 'completed_clean': counts['completed'],
                       'completed_with_field_holds': counts['completed_with_holds'],
                       'ready': counts['ready'], 'retry_wait': counts['retry_wait'],
                       'journal_running': counts['running'], 'source_hold': counts['source_hold'],
                       'technical_hold': counts['technical_hold'], 'uncertain_send': counts['held_uncertain_send'],
                       'operator_hold': counts['operator_hold'], 'recorded_attempts': len(attempts)},
            'article_counts': dict(counts), 'parallelism': parallelism,
            'dispatch': {'counts': dict(dispatch), 'articles': active,
                         'definition': 'Sent awaiting response is local send evidence without a returned-response artifact; it is not remote provider attestation.'},
            'costs': {'gateway_reported_usd': str(known), 'known_cost_attempts': known_count,
                      'unknown_active_or_pending_accounting': unknown['active_or_pending_accounting'],
                      'unknown_settled_attempts': unknown['settled'],
                      'unknown_sent_awaiting_response': unknown['sent_awaiting_response'],
                      'unknown_returned_awaiting_accounting': unknown['returned_awaiting_accounting'],
                      'unknown_reserved_not_sent': unknown['reserved_not_sent'], 'not_sent_attempts': unknown['not_sent'],
                      'cost_is_invoice': False, 'OpenAI_price_estimates_used': False},
            'activity': activity, 'issue_counts': issue_counts, 'issue_codes': issue_codes, 'issues': issues,
            'requires_review': bool(run['fatal'] or any(issue_counts[name] for name in
                ('technical_holds', 'uncertain_sends', 'field_holds', 'unresolved_findings', 'monitoring_artifact_issues'))),
            'model_requests_made_by_monitor': 0, 'database_writes': 0}


def _cell(value):
    return str(value if value is not None else '—').replace('|', '\\|').replace('\n', ' ')


def render_report(value):
    totals, dispatch, costs = value['totals'], value['dispatch']['counts'], value['costs']
    lines = ['# Complementary review progress', '', f"Updated: {value['as_of']} · {value['phase']} · {value['run_state']}", '',
             '| Status | Articles |', '| --- | ---: |']
    for label, count in [('Completed cleanly', totals['completed_clean']), ('Completed with field holds', totals['completed_with_field_holds']),
                         ('Sent, awaiting response', dispatch.get('sent_awaiting_response', 0)),
                         ('Reserved, not yet sent', dispatch.get('reserved_not_sent', 0)),
                         ('Returned, awaiting accounting', dispatch.get('returned_awaiting_accounting', 0)),
                         ('Ready', totals['ready']), ('Waiting to retry', totals['retry_wait']),
                         ('Source unavailable', totals['source_hold']), ('Technical hold', totals['technical_hold']),
                         ('Uncertain send', totals['uncertain_send'])]:
        lines.append(f'| {label} | {count} |')
    lines += ['', f"Configured concurrency: {value['parallelism']['current']} (maximum {value['parallelism']['maximum']}).",
              f"Gateway-reported cost: ${costs['gateway_reported_usd']}. Unknown cost: {costs['unknown_settled_attempts']} settled attempts and {costs['unknown_active_or_pending_accounting']} active/pending-accounting attempts. These are gateway estimates, not invoices.", '']
    if value['fatal']:
        lines += [f"Run-level hold: {_cell(value['fatal'])}", '']
    for group, title in [('technical_holds', 'Technical holds'), ('uncertain_sends', 'Uncertain sends'),
                         ('retry_waits', 'Scheduled retries'), ('field_holds', 'Fields held for review'),
                         ('unresolved_findings', 'Unresolved source findings'), ('source_holds', 'Source dispositions'),
                         ('monitoring_artifact_issues', 'Monitoring artifact issues')]:
        rows = value['issues'][group]
        if not rows:
            continue
        lines += ['## ' + title, '', '| PMID | Field / finding | Reason |', '| --- | --- | --- |']
        for row in rows:
            field = ' · '.join(str(row[key]) for key in ('stage', 'field_path', 'finding_id') if row.get(key))
            lines.append(f"| {_cell(row['pmid'])} | {_cell(field or '—')} | {_cell(row['reason'])} |")
        lines.append('')
    return '\n'.join(lines).rstrip() + '\n'


def save_report(root, run_id=RUN_ID):
    """Save timestamped audit snapshots plus latest pointers, all inside this run."""
    root = Path(root).resolve()
    value = snapshot(root, run_id)
    directory = owned(root, f'data/current/complementary/{run_id}/monitoring')
    raw = canonical(value)
    stamp = re.sub(r'[^0-9]', '', value['as_of'])
    stem = stamp + '-' + digest(raw)[:12]
    saved_json = directory / 'snapshots' / (stem + '.json')
    saved_md = directory / 'snapshots' / (stem + '.md')
    atomic_bytes(saved_json, raw)
    atomic_bytes(saved_md, render_report(value).encode())
    atomic_json(directory / 'latest.json', value)
    atomic_bytes(directory / 'latest.md', render_report(value).encode())
    return {'run_id': run_id, 'as_of': value['as_of'], 'totals': value['totals'],
            'dispatch': value['dispatch']['counts'], 'parallelism': value['parallelism'],
            'costs': value['costs'], 'issue_counts': value['issue_counts'], 'fatal': value['fatal'],
            'snapshot_ref': reference(root, saved_json), 'report_ref': reference(root, saved_md),
            'latest_report_path': str((directory / 'latest.md').relative_to(root)),
            'model_requests_made': 0, 'database_writes': 0}
