"""Source-bound review and usage tables for the complementary Opus run."""
from collections import Counter, defaultdict
from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import re

from . import complementary_runtime as runtime, complementary_amendments as amendments, complementary_contract as contract
from .io import atomic_json, canonical, digest, now, owned, reference, verified_json


def _sha(value):
    return digest(canonical(value))


def _review_key(ref):
    return ref.get('path'), ref.get('sha256')


def load_dispositions(root):
    """Read immutable explicit decisions; malformed ledgers cannot close reviews."""
    indexed = defaultdict(list)
    issues = []
    for path in sorted(owned(root, amendments.DIRECTORY).joinpath('dispositions').glob('*.json')):
        ledger = None
        try:
            ref = reference(root, path)
            ledger = verified_json(root, ref)
            if (path.stem != _sha(ledger) or ledger.get('schema') != amendments.SCHEMA
                    or not str(ledger.get('reviewer') or '').strip()
                    or not str(ledger.get('review_note') or '').strip()
                    or not isinstance(ledger.get('decisions'), list)):
                raise ValueError('Disposition ledger content or identity is invalid')
            review = verified_json(root, ledger['review_ref'])
            packet = verified_json(root, ledger['packet_ref'])
            if (ledger['packet_ref'] != review.get('packet_ref')
                    or ledger.get('packet_sha256') != packet.get('packet_sha256')):
                raise ValueError('Disposition packet differs from its saved review')
            for decision in ledger['decisions']:
                if decision.get('source_review_ref'):
                    verified_json(root, decision['source_review_ref'])
            indexed[_review_key(ledger['review_ref'])].append({'ledger': ledger, 'ref': ref})
        except (ValueError, KeyError, TypeError, OSError) as exc:
            issue = {'path': str(path.relative_to(root)), 'reason': str(exc)}
            issues.append(issue)
            key = _review_key(ledger.get('review_ref', {})) if isinstance(ledger, dict) else (None, None)
            indexed[key].append({'issue': issue})
    return indexed, issues


def explicit_dispositions(packet, validation, review_ref, indexed):
    """Bind decisions to this exact review; conflicting decisions stay unresolved."""
    choices = defaultdict(list)
    errors = []
    findings = {f['id']: f for f in validation.get('accepted_findings', [])}
    findings.update((h['finding']['id'], h['finding']) for h in validation.get('held_findings', []))
    targets = {t['record_id']: t for t in packet.get('targets', [])}
    for item in [*indexed.get(_review_key(review_ref), []), *indexed.get((None, None), [])]:
        if 'issue' in item:
            errors.append(item['issue'])
            continue
        ledger = item['ledger']
        try:
            if (_review_key(ledger['review_ref']) != _review_key(review_ref)
                    or ledger['packet_sha256'] != packet['packet_sha256']
                    or str(ledger['pmid']) != str(packet['source']['pmid'])):
                raise ValueError('Disposition belongs to a different saved review packet')
            seen = set()
            for decision in ledger['decisions']:
                ident = decision['finding_id']
                finding = findings.get(ident)
                if (not finding or ident in seen or decision.get('disposition') not in amendments.DISPOSITIONS
                        or not str(decision.get('rationale') or '').strip()
                        or decision.get('finding_sha256') != _sha(finding)
                        or decision.get('target') != finding['target']
                        or decision.get('target_record_sha256') != _sha(targets[finding['target']['record_id']]['record'])):
                    raise ValueError('Disposition finding or original record is stale, duplicate or foreign')
                seen.add(ident)
            if seen != set(findings):
                raise ValueError('Disposition ledger omits original findings')
            for decision in ledger['decisions']:
                implicit = (decision.get('explicit_decision') is False or
                    ('explicit_decision' not in decision and decision['disposition'] == 'unresolved'
                     and decision['rationale'] == 'No explicit apply or reject disposition has been recorded.'))
                if not implicit:
                    choices[decision['finding_id']].append({
                        'disposition': decision['disposition'], 'rationale': decision['rationale'],
                        'reviewer': ledger['reviewer'], 'reviewed_at': ledger['reviewed_at'],
                        'disposition_ref': item['ref'], 'decision': decision})
        except (ValueError, KeyError, TypeError) as exc:
            errors.append({'path': item['ref']['path'], 'reason': str(exc)})
    if errors:
        return {ident: {'conflict': True, 'issues': errors, 'decisions': choices.get(ident, [])}
                for ident in findings}, errors
    selected = {}
    for ident, decisions in choices.items():
        conflicting = len({d['disposition'] for d in decisions}) != 1
        selected[ident] = {'conflict': conflicting, 'decisions': decisions}
        if not conflicting:
            selected[ident]['disposition'] = decisions[0]['disposition']
    return selected, []


def whitespace_confirmations(packet, validation):
    """Resolve only unchanged confirmations that replay after exact quote repair."""
    if not validation.get('valid') or not isinstance(validation.get('record'), dict):
        return {}
    targets = {t['record_id']: t for t in packet.get('targets', [])}
    spans = {s['span_id']: s for s in packet.get('source_catalog', {}).get('spans', [])}
    repaired = {}
    for hold in validation.get('held_findings', []):
        finding = hold['finding']
        if finding.get('action') != 'confirmed' or hold['issue'].get('code') != 'foreign_or_nonliteral_source_quote':
            continue
        target = targets.get(finding['target'].get('record_id'), {})
        try:
            expected, proposed = json.loads(finding['expected_value_json']), json.loads(finding['value_json'])
            if expected != proposed or proposed != _value(target.get('record', {}), _parts(finding['target']['field_path'])):
                continue
            proofs = []
            for proof in finding['evidence']:
                span = spans[proof['span_id']]
                if proof['span_id'] not in target.get('source_span_ids', []):
                    raise ValueError('Confirmation evidence is not in the exact target source')
                quote = proof['quote']
                if quote not in span['text']:
                    pattern = ''.join(r'\s+' if part.isspace() else re.escape(part)
                                      for part in re.split(r'(\s+)', quote) if part)
                    match = re.search(pattern, span['text']) if quote.strip() else None
                    if not match:
                        raise ValueError('Quote differs beyond Unicode whitespace')
                    quote = match.group(0)
                proofs.append({**proof, 'quote': quote})
            if proofs != finding['evidence']:
                repaired[finding['id']] = {**deepcopy(finding), 'evidence': proofs}
        except (ValueError, KeyError, TypeError):
            continue
    if not repaired:
        return {}
    derived = deepcopy(validation['record'])
    derived['findings'] = [repaired.get(f['id'], f) for f in derived['findings']]
    replay = contract.validate(derived, packet)
    if not replay.get('valid') or replay.get('global_errors'):
        return {}
    accepted = {f['id']: f for f in replay.get('accepted_findings', [])}
    resolved = {}
    originals = {h['finding']['id']: h['finding'] for h in validation['held_findings']}
    for ident, corrected in repaired.items():
        validated = accepted.get(ident, {})
        if validated.get('action') != 'confirmed' or validated.get('expected_value') != validated.get('value'):
            continue
        resolved[ident] = {'disposition': 'confirmed', 'conflict': False, 'decisions': [{
            'rationale': 'Exact original-source quote restored using Unicode whitespace only; unchanged confirmation passed the frozen validator.',
            'reviewer': 'Local whitespace-only validation replay'}], 'local_resolution': {
                'method': 'unicode_whitespace_only_original_quote_replay',
                'original_finding_sha256': _sha(originals[ident]),
                'original_evidence': deepcopy(originals[ident]['evidence']),
                'repaired_evidence': deepcopy(corrected['evidence']),
                'validator': 'complementary_contract.validate', 'accepted_action': 'confirmed',
                'accepted_value': validated['value'], 'new_opus_result': False,
                'original_response_changed': False, 'accepted_records_changed': False}}
    return resolved


def _text(value):
    if value is None:
        return 'NA'
    return json.dumps(value, ensure_ascii=False, sort_keys=True) if not isinstance(value, str) else value


def _parts(path):
    return [part.replace('~1', '/').replace('~0', '~') for part in path.lstrip('/').split('/')]


def _value(record, parts):
    current = record
    try:
        for part in parts:
            current = current[int(part)] if isinstance(current, list) else current[part]
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    return current


def paired_values(packet, finding):
    """Never match different R2/R3 array positions without an explicit row link."""
    target = finding.get('target') or {}
    targets = packet.get('targets', [])
    selected = next((item for item in targets if item['record_id'] == target.get('record_id')), None)
    result = {'R2': 'NA (no established corresponding row)', 'R3': 'NA (no established corresponding row)'}
    if selected is None:
        return result
    path = _parts(target.get('field_path', ''))
    if not path:
        return result
    result[selected['stage']] = _text(_value(selected['record'], path))
    other = next((item for item in targets if item['stage'] != selected['stage']), None)
    if other is None:
        return result
    if path[0] in ('study', 'decision', 'study_details'):
        result[other['stage']] = _text(_value(other['record'], path))
        return result
    r3 = next((item['record'] for item in targets if item['stage'] == 'R3'), {})
    left, right = ('r3_id', 'r2_id') if selected['stage'] == 'R3' else ('r2_id', 'r3_id')
    matches = [link for link in r3.get('r2_links', [])
               if link.get('section') == path[0] and link.get(left) == target.get('row_id')]
    if len(matches) != 1:
        return result
    rows = other['record'].get(path[0], [])
    indices = [i for i, row in enumerate(rows) if row.get('id') == matches[0][right]]
    if len(indices) == 1:
        result[other['stage']] = _text(_value(other['record'], [path[0], str(indices[0]), *path[2:]]))
    return result


def _source_locations(packet, finding):
    spans = {span['span_id']: span for span in packet.get('source_catalog', {}).get('spans', [])}
    locations = []
    for proof in finding.get('evidence', []):
        span = spans.get(proof.get('span_id'), {})
        locations.append({'span_id': proof.get('span_id'), 'source_id': span.get('source_id'),
                          'block_id': span.get('block_id'), 'quote': proof.get('quote')})
    return locations


def review_rows(packet, validation, *, attempt_id, dispositions=None, adjudicated_rows=None):
    """Keep proposals and unresolved findings distinct from confirmed extraction."""
    rows = []
    latest = next((target for target in packet.get('targets', []) if target['stage'] == 'R3'),
                  next(iter(packet.get('targets', [])), {}))
    items = [(finding, None) for finding in validation.get('accepted_findings', [])]
    items.extend((item['finding'], item['issue']) for item in validation.get('held_findings', []))
    for finding, hold in items:
        target = finding.get('target') or {}
        disposition = (dispositions or {}).get(finding['id'])
        proposed = finding.get('value')
        if 'value' not in finding:
            try:
                proposed = json.loads(finding.get('value_json', 'null'))
            except (ValueError, TypeError):
                proposed = finding.get('value_json')
        latest_unclear = (target.get('record_id') == latest.get('record_id')
            and target.get('field_path') == '/decision/status'
            and latest.get('record', {}).get('decision', {}).get('status') == 'unclear')
        confirmed_unclear = (finding.get('action') == 'confirmed'
            and target.get('record_id') == latest.get('record_id')
            and target.get('field_path') == '/decision/status' and proposed == 'unclear')
        if finding.get('action') == 'confirmed' and hold is None and not confirmed_unclear and not disposition:
            continue
        values = paired_values(packet, finding)
        selected = next((item['record'] for item in packet.get('targets', [])
                         if item['record_id'] == target.get('record_id')), {})
        row = next((row for row in selected.get(target.get('section'), [])
                    if isinstance(row, dict) and row.get('id') == target.get('row_id')), {}) \
            if isinstance(selected.get(target.get('section')), list) else {}
        population = next((p for p in selected.get('populations', [])
                           if p['id'] == row.get('population_id')), {})
        status = ('Technical source check needed' if hold else
                  'Eligibility remains unclear; existing decision confirmed' if confirmed_unclear else
                  'Unresolved' if finding['action'] == 'unresolved' else 'Proposed change; source review pending')
        output = {'PMID': packet['source']['pmid'], 'Trial': selected.get('study', {}).get('name', 'NA'),
            'Source coverage': 'Full text and available verified supplements' if packet['source']['stage'] == 'R3' else 'Abstract only',
            'Field': target.get('field_path', ''), 'Target stage': target.get('stage', ''),
            'Cohort': population.get('label', ''), 'GPT R2 value': values['R2'], 'GPT R3 value': values['R3'],
            'Claude finding': _text(proposed), 'Finding type': finding.get('action', ''),
            'Key discrepancy or addition': finding.get('reason', ''), 'Review status': status,
            'Validation issue': (hold or {}).get('code', ''),
            'Original source evidence': _text(_source_locations(packet, finding)),
            'PubMed': 'https://pubmed.ncbi.nlm.nih.gov/' + str(packet['source']['pmid']) + '/',
            'Finding ID': finding.get('id', ''), 'Attempt ID': attempt_id}
        if disposition:
            state = disposition.get('disposition')
            if disposition.get('conflict'):
                output['Review status'] = 'Conflicting or invalid source-review dispositions; review needed'
            elif latest_unclear and state in {'confirmed', 'reject'}:
                output['Review status'] = 'Eligibility remains unclear; source review recorded'
            else:
                output['Review status'] = {
                    'confirmed': 'Source-confirmed; no data change',
                    'reject': 'Proposal rejected; no data change',
                    'apply': 'Approved proposal; amendment validation and publication pending',
                    'unresolved': 'Unresolved after source review',
                }[state]
            output['Source-review disposition'] = 'conflict' if disposition.get('conflict') else state
            output['Source-review rationale'] = '\n'.join(d['rationale'] for d in disposition.get('decisions', []))
            if adjudicated_rows is not None:
                adjudicated_rows.append({**output, 'source_review': disposition,
                    'applied_or_published_by_this_report': False})
            if state in {'confirmed', 'reject'} and not disposition.get('conflict') and not latest_unclear:
                continue
        rows.append(output)
    return rows


def collect_review(root, run_id=runtime.RUN_ID):
    root = Path(root).resolve()
    snapshot = runtime.status(root, run_id)
    reviews, costs, articles, adjudicated = [], [], [], []
    disposition_index, disposition_issues = load_dispositions(root)
    actions = Counter()
    for article in snapshot['articles']:
        attempts = article.get('attempt_records', [])
        known = sum((Decimal(attempt['cost_usd']) for attempt in attempts if attempt['cost_usd'] is not None), Decimal(0))
        unknown = sum(attempt['cost_status'] == 'unknown' for attempt in attempts)
        for attempt in attempts:
            usage = attempt.get('usage') or {}
            details = usage.get('completion_tokens_details') or {}
            costs.append({'PMID': article['pmid'], 'Attempt': attempt['ordinal'], 'Attempt ID': attempt['attempt_id'],
                'State': attempt['state'], 'Model': runtime.MODEL, 'Effort requested': runtime.REASONING,
                'Input tokens': usage.get('prompt_tokens', usage.get('input_tokens')),
                'Output tokens': usage.get('completion_tokens', usage.get('output_tokens')),
                'Reasoning tokens (included in output)': details.get('reasoning_tokens'),
                'Gateway cost estimate USD': attempt['cost_usd'], 'Cost status': attempt['cost_status']})
        count = 0
        if article.get('result_ref'):
            result = verified_json(root, article['result_ref'])
            validation = result.get('validation') or {}
            if validation.get('valid'):
                packet = verified_json(root, result['packet_ref'])
                dispositions, issues = explicit_dispositions(packet, validation, article['result_ref'], disposition_index)
                disposition_issues.extend(issues)
                dispositions = {**whitespace_confirmations(packet, validation), **dispositions}
                found = review_rows(packet, validation, attempt_id=result['attempt_id'],
                                    dispositions=dispositions, adjudicated_rows=adjudicated)
                reviews.extend(found)
                count = len(found)
                actions.update(f['action'] for f in validation.get('accepted_findings', []))
        articles.append({'PMID': article['pmid'], 'Review state': article['state'], 'Attempts': len(attempts),
            'Findings needing source review': count, 'Known gateway cost estimate USD': str(known),
            'Attempts with unknown cost': unknown, 'Problem': _text(article.get('reason')) if article.get('reason') else ''})
    if sum((Decimal(row['Known gateway cost estimate USD']) for row in articles), Decimal(0)) != Decimal(snapshot['gateway_reported_cost_usd']):
        raise ValueError('Article cost totals do not reconcile to the gateway journal')
    return {'as_of': now(), 'run_id': run_id, 'summary': {key: value for key, value in snapshot.items() if key != 'articles'},
            'finding_actions': dict(actions), 'review_findings': reviews, 'adjudicated_findings': adjudicated,
            'source_review_issues': list({_sha(i): i for i in disposition_issues}.values()), 'article_costs': articles,
            'attempt_costs': costs, 'sources': {'journal': runtime.JOURNAL,
                'original_evidence_unchanged': True, 'proposals_are_not_automatic_corrections': True}}


def export_review(root, run_id=runtime.RUN_ID):
    """Write a reproducible table snapshot; CSV serialization is a separate step."""
    root = Path(root).resolve()
    runtime._safe_id(run_id)
    value = collect_review(root, run_id)
    path = f'data/current/complementary/{run_id}/review_tables.json'
    atomic_json(owned(root, path), value)
    return {'tables_ref': reference(root, path), 'summary': value['summary'],
            'findings_for_review': len(value['review_findings']), 'article_rows': len(value['article_costs'])}
