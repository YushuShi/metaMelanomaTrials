"""Read-only companion watcher: local progress and CSV exports, never inference."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time

from . import complementary_monitoring as monitoring
from .io import atomic_bytes, atomic_json, digest, now, owned, reference, verified_json

DEFAULT_NODE = '/Users/yushushi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
DEFAULT_WORKSPACE = '/tmp/melanoma-opus-csv'
TERMINAL_STATES = {'finished', 'technical_hold', 'operator_hold'}


def runner_alive(pid):
    if not isinstance(pid, int) or pid < 2:
        raise ValueError('An explicit positive runner PID is required')
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        # Lack of permission is not proof that the process disappeared.
        return True


def terminal_reason(value, alive):
    state = value.get('run_state')
    running = value.get('totals', {}).get('journal_running', 0)
    if state in TERMINAL_STATES and not running:
        return state
    if not alive:
        return 'runner_lost_problem'
    return None


def export_snapshot(root, run_id, *, node, script, artifact_workspace, timeout_seconds=240):
    """Save immutable-in-practice table/CSV snapshots using the existing exporter."""
    from .complementary_reporting import export_review
    root = Path(root).resolve()
    table = export_review(root, run_id)
    # Copy the referenced snapshot before calling Node; later exports may update
    # review_tables.json while the CSV workbook is being constructed.
    source = table['tables_ref']
    raw = owned(root, source['path']).read_bytes()
    if digest(raw) != source['sha256'] or len(raw) != source['bytes']:
        raise ValueError('Review table snapshot changed before CSV export')
    stamp = re.sub(r'[^0-9]', '', now())
    directory = owned(root, f'data/current/complementary/{run_id}/monitoring/exports/{stamp}-{digest(raw)[:12]}')
    input_path = directory / 'review_tables.json'
    atomic_bytes(input_path, raw)
    csv_directory = directory / 'csv'
    log_path = directory / 'csv_export.log'
    command = [str(node), str(script), str(input_path), str(csv_directory),
               '--artifact-workspace', str(artifact_workspace)]
    with log_path.open('xb') as output:
        completed = subprocess.run(command, cwd=root, stdin=subprocess.DEVNULL,
                                   stdout=output, stderr=subprocess.STDOUT, timeout=timeout_seconds,
                                   check=False, close_fds=True)
    if completed.returncode:
        raise RuntimeError(f'CSV export exited {completed.returncode}; log={log_path.relative_to(root)}')
    manifest_path = csv_directory / 'csv_manifest.json'
    manifest = json.loads(manifest_path.read_bytes())
    if manifest.get('source_sha256') != source['sha256'] or manifest.get('run_id') != run_id:
        raise ValueError('CSV manifest differs from frozen table snapshot')
    refs = []
    for row in manifest['outputs']:
        if Path(row['file']).name != row['file']:
            raise ValueError('CSV output must remain in its snapshot directory')
        ref = reference(root, csv_directory / row['file'])
        if ref['sha256'] != row['sha256']:
            raise ValueError('CSV checksum verification failed')
        refs.append(ref)
    result = {'run_id': run_id, 'as_of': manifest['as_of'], 'table_ref': reference(root, input_path),
              'csv_manifest_ref': reference(root, manifest_path), 'csv_refs': refs,
              'log_ref': reference(root, log_path), 'findings_for_review': table['findings_for_review'],
              'article_rows': table['article_rows'], 'model_requests_made': 0, 'database_writes': 0}
    atomic_json(owned(root, f'data/current/complementary/{run_id}/monitoring/latest_export.json'), result)
    return result


def watch(root, *, runner_pid, run_id=monitoring.RUN_ID, monitor_interval=60, export_interval=300,
          export_retry_delay=60, max_export_attempts=3, node=DEFAULT_NODE,
          script='scripts/export_complementary_csv.mjs', artifact_workspace=DEFAULT_WORKSPACE,
          export_timeout=240, clock=time.monotonic, sleep=time.sleep,
          monitor_fn=monitoring.snapshot, save_monitor_fn=monitoring.save_report,
          export_fn=export_snapshot, pid_probe=runner_alive,
          executor_factory=ThreadPoolExecutor, emit=None):
    """Watch one already-running finite job. Never start/restart that job."""
    root = Path(root).resolve()
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', run_id):
        raise ValueError('Safe run identifier required')
    if (not isinstance(runner_pid, int) or runner_pid < 2 or monitor_interval <= 0
            or export_interval <= 0 or export_retry_delay <= 0 or not 1 <= max_export_attempts <= 3):
        raise ValueError('Positive intervals/PID and at most three export retries required')
    directory = owned(root, f'data/current/complementary/{run_id}/monitoring')
    directory.mkdir(parents=True, exist_ok=True)
    lease = os.open(directory / 'watch.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(lease)
        raise RuntimeError('A watcher already owns this run') from None
    log_path, state_path = directory / 'watch_events.jsonl', directory / 'watch_status.json'
    sequence = 0
    state = {'run_id': run_id, 'runner_pid': runner_pid, 'watch_pid': os.getpid(),
             'started_at': now(), 'watch_state': 'watching', 'run_state': None,
             'last_monitor_at': None, 'last_export_at': None, 'last_export_error': None,
             'model_requests_made': 0, 'database_writes': 0}

    def log(kind, **fields):
        nonlocal sequence
        sequence += 1
        event = {'at': now(), 'sequence_in_process': sequence, 'watch_pid': os.getpid(),
                 'run_id': run_id, 'kind': kind, **fields}
        raw = (json.dumps(event, sort_keys=True, ensure_ascii=False) + '\n').encode()
        descriptor = os.open(log_path, os.O_CREAT | os.O_APPEND | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'ab') as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        if emit is not None:
            emit(event)
        else:
            print(raw.decode().rstrip(), flush=True)

    def save_state():
        state['updated_at'] = now()
        atomic_json(state_path, state)

    pending = None
    pending_final = False
    terminal = None
    last_snapshot = None
    next_monitor = next_export = clock()
    failures = 0
    reported_issues = set()
    try:
        log('watch_started', runner_pid=runner_pid, monitor_interval=monitor_interval,
            export_interval=export_interval, exports_use_existing_local_node_script=True)
        save_state()
        with executor_factory(max_workers=1, thread_name_prefix='complementary-export') as executor:
            while True:
                current = clock()
                alive = pid_probe(runner_pid)
                # A disappeared runner gets a fresh final read immediately.
                if not alive and terminal is None:
                    next_monitor = min(next_monitor, current)
                if terminal is None and current >= next_monitor:
                    try:
                        value = monitor_fn(root, run_id)
                        monitor_saved = save_monitor_fn(root, run_id)
                        last_snapshot = value
                        state.update(last_monitor_at=value['as_of'], run_state=value['run_state'],
                                     totals=value['totals'], dispatch=value['dispatch']['counts'],
                                     costs=value['costs'], fatal=value.get('fatal'),
                                     last_monitor_ref=monitor_saved.get('snapshot_ref'),
                                     last_monitor_error=None)
                        log('progress', run_state=value['run_state'], totals=value['totals'],
                            dispatch=value['dispatch']['counts'], concurrency=value.get('parallelism'),
                            costs=value['costs'], fatal=value.get('fatal'))
                        for category, rows in value.get('issues', {}).items():
                            for row in rows:
                                key = (category, row.get('pmid'), row.get('finding_id'), row.get('field_path'), row.get('code'))
                                if key not in reported_issues:
                                    details = dict(row)
                                    if 'kind' in details:
                                        details['issue_kind'] = details.pop('kind')
                                    log('article_problem', category=category, **details)
                                    reported_issues.add(key)
                        terminal = terminal_reason(value, alive)
                    except Exception as exc:
                        state['last_monitor_error'] = type(exc).__name__ + ': ' + str(exc)
                        log('monitor_failed', reason=state['last_monitor_error'], next_retry_seconds=monitor_interval)
                        if not alive:
                            terminal = 'runner_lost_problem'
                    next_monitor = clock() + monitor_interval
                    if terminal:
                        state['watch_state'] = terminal
                        log('watch_terminal_observed', reason=terminal, run_state=state['run_state'],
                            runner_alive=alive, active_pmids=[row['pmid'] for row in
                                (last_snapshot or {}).get('dispatch', {}).get('articles', [])])
                        if terminal == 'runner_lost_problem':
                            problem = {'at': now(), 'run_id': run_id, 'runner_pid': runner_pid,
                                       'problem': terminal, 'run_state': state['run_state'],
                                       'last_snapshot': last_snapshot,
                                       'action': 'No restart or retry dispatched; reconcile saved receipts before resuming.'}
                            atomic_json(directory / 'runner_lost_problem.json', problem)
                        next_export = clock()
                    save_state()

                if pending is not None and pending.done():
                    try:
                        result = pending.result()
                        failures = 0
                        state.update(last_export_at=result.get('as_of', now()),
                                     last_export=result, last_export_error=None)
                        log('export_completed', final=pending_final, result=result)
                        next_export = clock() + export_interval
                        if pending_final:
                            state['watch_state'] = terminal
                            save_state()
                            break
                    except Exception as exc:
                        failures += 1
                        state['last_export_error'] = type(exc).__name__ + ': ' + str(exc)
                        log('export_failed', final=pending_final, attempt_in_window=failures,
                            reason=state['last_export_error'], last_success_at=state['last_export_at'])
                        if failures >= max_export_attempts:
                            if terminal:
                                state['watch_state'] = terminal + '_final_export_problem'
                                save_state()
                                break
                            log('export_retry_window_exhausted', failures=failures,
                                next_scheduled_export_seconds=export_interval)
                            failures = 0
                            next_export = clock() + export_interval
                        else:
                            next_export = clock() + export_retry_delay * failures
                    finally:
                        pending = None
                    save_state()
                    if terminal and state['last_export_error'] is None:
                        # An export that began before terminal status is not the
                        # final snapshot. Schedule one fresh terminal export.
                        next_export = clock()

                if pending is None and clock() >= next_export:
                    pending_final = terminal is not None
                    pending = executor.submit(export_fn, root, run_id, node=Path(node),
                        script=(root / script).resolve(), artifact_workspace=Path(artifact_workspace),
                        timeout_seconds=export_timeout)
                    log('export_started', final=pending_final, attempt_in_window=failures + 1)
                sleep(min(1, max(0.01, next_monitor - clock())) if terminal is None else 1)
        log('watch_stopped', state=state['watch_state'], run_state=state['run_state'],
            last_export_error=state['last_export_error'])
        save_state()
        return state
    finally:
        fcntl.flock(lease, fcntl.LOCK_UN)
        os.close(lease)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--run-id', default=monitoring.RUN_ID)
    parser.add_argument('--runner-pid', required=True, type=int)
    parser.add_argument('--monitor-interval', type=float, default=60)
    parser.add_argument('--export-interval', type=float, default=300)
    parser.add_argument('--export-retry-delay', type=float, default=60)
    parser.add_argument('--max-export-attempts', type=int, default=3)
    parser.add_argument('--export-timeout', type=float, default=240)
    parser.add_argument('--node', default=DEFAULT_NODE)
    parser.add_argument('--script', default='scripts/export_complementary_csv.mjs')
    parser.add_argument('--artifact-workspace', default=DEFAULT_WORKSPACE)
    args = parser.parse_args(argv)
    watch(args.root, runner_pid=args.runner_pid, run_id=args.run_id,
          monitor_interval=args.monitor_interval, export_interval=args.export_interval,
          export_retry_delay=args.export_retry_delay, max_export_attempts=args.max_export_attempts,
          export_timeout=args.export_timeout, node=args.node, script=args.script,
          artifact_workspace=args.artifact_workspace)


if __name__ == '__main__':
    main()
