"""Explicitly reviewed complementary amendments; never publish or edit originals.

The disposition ledger is independent of the model run. A source-bound proposal
is not permission to apply it. This module requires a saved semantic review,
replays both validators, and returns derived records for a future publication
adapter. Existing manual presentation rules are neither changed nor bypassed.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from pathlib import Path

from . import complementary_contract as contract, quantitative as q
from .io import atomic_json, canonical, digest, now, owned, reference, verified_json
from .screening import catalog_for


SCHEMA = 'metaMelanomaTrials_complementary_amendments_v1'
DIRECTORY = 'data/current/complementary/amendments'
DISPOSITIONS = frozenset({'apply', 'reject', 'unresolved', 'confirmed'})
ARRAYS = frozenset({'populations', 'arms', 'sample_sizes', 'effects', 'survival', 'binary', 'r2_links'})


def _sha(value):
    return digest(canonical(value))


def _parts(path):
    if not isinstance(path, str) or not path.startswith('/'):
        raise ValueError('Explicit JSON pointer required')
    return [x.replace('~1', '/').replace('~0', '~') for x in path[1:].split('/')]


def _get(value, path):
    for key in _parts(path):
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value


def _put(value, path, replacement):
    parts = _parts(path); parent = value
    for key in parts[:-1]:
        parent = parent[int(key)] if isinstance(parent, list) else parent[key]
    if isinstance(parent, list):
        if parts[-1] == '-':
            parent.append(deepcopy(replacement))
            return '/' + '/'.join(parts[:-1] + [str(len(parent) - 1)])
        parent[int(parts[-1])] = deepcopy(replacement)
    else:
        parent[parts[-1]] = deepcopy(replacement)
    return path


def schema_record(record):
    """Remove processor annotations only; never fill missing clinical fields."""
    def keep(value, spec):
        if '$ref' in spec:
            spec = q.DEFS[spec['$ref'].rsplit('/', 1)[-1]]
        if spec.get('type') == 'object' and isinstance(value, dict):
            return {key: keep(value[key], child) for key, child in spec['properties'].items() if key in value}
        if spec.get('type') == 'array' and isinstance(value, list):
            return [keep(item, spec['items']) for item in value]
        return deepcopy(value)
    return keep(record, q.review_schema(record['stage']))


def required_review_fields(finding, record):
    """Related values must be explicitly checked, even when left unchanged.

    The compact contract does not contain editable raw-number strings. Its
    evidence, units and count/arithmetic metadata are the corresponding raw
    dependencies. CI and numerator/denominator edits require joint review.
    """
    path = finding['target']['field_path']; parts = _parts(path)
    if len(parts) < 3 or parts[0] not in ARRAYS or parts[1] == '-':
        return [path]
    row_path = '/' + '/'.join(parts[:2]); row = _get(record, row_path)
    field = parts[2]; required = {path, row_path + '/evidence'}
    group = set()
    if field in {'estimate', 'ci_lower', 'ci_upper', 'ci_level'}:
        group.update({'estimate', 'ci_lower', 'ci_upper', 'ci_level', 'unit', 'median_status'})
    if field in {'numerator', 'denominator', 'percentage'}:
        group.update({'numerator', 'denominator', 'percentage'})
    if field == 'n':
        group.update({'method', 'component_ids', 'count_purpose', 'population_id', 'arm_id', 'result_id'})
    if field == 'analysis_n':
        group.update({'population_id', 'arm_id', 'intervention_arm_id', 'reference_arm_id', 'cutoff'})
    if field in {'time', 'assessment_time', 'time_unit'}:
        group.update({'time', 'assessment_time', 'time_unit'})
    if field == 'p_value':
        group.update({'p_test', 'p_sidedness'})
    required.update(row_path + '/' + key for key in group if key in row)
    return sorted(required)


def _review(root, review_ref):
    review = verified_json(root, review_ref)
    if review.get('state') not in {'completed', 'completed_with_holds'} or not review.get('validation', {}).get('valid'):
        raise ValueError('A completed saved complementary review is required')
    packet = verified_json(root, review['packet_ref'])
    replay = contract.validate(review['validation']['record'], packet)
    if not replay.get('valid') or replay.get('global_errors'):
        raise ValueError('Complementary review no longer validates against its original packet')
    if replay.get('accepted_findings') != review['validation'].get('accepted_findings'):
        raise ValueError('Saved complementary findings differ from current exact validation')
    if str(review.get('pmid')) != str(packet['source']['pmid']):
        raise ValueError('Complementary review PMID differs from its packet')
    return review, packet, replay


def _semantic_review(decision, finding, packet, target):
    semantic = decision.get('semantic_review') or {}
    if (semantic.get('source_checked') is not True or semantic.get('scope_checked') is not True
            or not str(semantic.get('scope_note') or '').strip()):
        raise ValueError('Explicit source-checked semantic scope review required')
    spans = {s['span_id']: s for s in packet['source_catalog']['spans']}
    evidence = semantic.get('evidence') or []
    if not evidence:
        raise ValueError('Semantic review requires original-source evidence')
    for proof in evidence:
        span = spans.get(proof.get('span_id'))
        quote = proof.get('quote')
        if (not span or not isinstance(quote, str) or not quote.strip() or quote not in span['text']
                or proof['span_id'] not in target.get('source_span_ids', [])):
            raise ValueError('Semantic review evidence is not in the exact original target source')
    checked = set(semantic.get('reviewed_fields') or [])
    required = set(required_review_fields(finding, target['record']))
    if not required <= checked:
        raise ValueError('Dependent fields require joint source review: ' + ', '.join(sorted(required - checked)))


def record_decisions(root, review_ref, decisions, *, reviewer, review_note, output_dir=DIRECTORY):
    """Save explicit dispositions; this does not apply or publish anything.

    Each decision has finding_id, disposition, rationale, and (for apply)
    semantic_review={source_checked:true, scope_checked:true, scope_note,
    evidence:[{span_id,quote}], reviewed_fields:[JSON pointers]}.
    """
    root = Path(root).resolve()
    if not isinstance(reviewer, str) or not reviewer.strip() or not str(review_note or '').strip():
        raise ValueError('An explicit reviewer and review note are required')
    review, packet, validation = _review(root, review_ref)
    accepted = {f['id']: f for f in validation['accepted_findings']}
    held = {f['finding']['id']: f['finding'] for f in validation.get('held_findings', [])}
    targets = {t['record_id']: t for t in packet['targets']}
    selected = {}; entries = []
    for item in decisions:
        ident = item.get('finding_id')
        if ident in selected or ident not in accepted.keys() | held.keys():
            raise ValueError('Unique existing finding IDs required')
        if item.get('disposition') not in DISPOSITIONS or not str(item.get('rationale') or '').strip():
            raise ValueError('Explicit disposition and rationale required')
        finding = accepted.get(ident) or held[ident]
        if item['disposition'] == 'apply':
            if ident not in accepted or finding['action'] not in {'addition', 'correction'}:
                raise ValueError('Only an accepted addition or correction can be applied')
            if finding.get('same_source_amendment_eligible') is not True:
                raise ValueError('Cross-source findings remain proposals; R3 cannot rewrite R2')
            _semantic_review(item, finding, packet, targets[finding['target']['record_id']])
        selected[ident] = deepcopy(item)
    for ident, finding in {**accepted, **held}.items():
        decision = selected.get(ident, {'finding_id': ident, 'disposition': 'unresolved',
                                       'rationale': 'No explicit apply or reject disposition has been recorded.'})
        entries.append({**decision, 'explicit_decision': ident in selected,
                        'finding_sha256': _sha(finding), 'target': deepcopy(finding['target']),
                        'target_record_sha256': _sha(targets[finding['target']['record_id']]['record']),
                        'finding_was_held': ident in held})
    ledger = {'schema': SCHEMA, 'review_ref': deepcopy(review_ref), 'packet_ref': deepcopy(review['packet_ref']),
              'packet_sha256': packet['packet_sha256'], 'pmid': str(packet['source']['pmid']),
              'reviewer': reviewer.strip(), 'review_note': review_note.strip(), 'reviewed_at': now(),
              'decisions': entries, 'applied_to_original_records': False, 'published': False}
    path = owned(root, Path(output_dir) / 'dispositions' / (_sha(ledger) + '.json'))
    if path.exists():
        if verified_json(root, reference(root, path)) != ledger:
            raise ValueError('Immutable disposition ledger differs')
    else:
        atomic_json(path, ledger)
    return reference(root, path)


def _diff(before, after, path=''):
    if isinstance(before, dict) and isinstance(after, dict):
        return [p for key in sorted(set(before) | set(after))
                for p in (_diff(before[key], after[key], path + '/' + key) if key in before and key in after
                          else [path + '/' + key])]
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        return [p for i, (a, b) in enumerate(zip(before, after)) for p in _diff(a, b, path + '/' + str(i))]
    return [] if before == after else [path or '/']


def _covers(path, ancestor):
    return path == ancestor or path.startswith(ancestor.rstrip('/') + '/')


def _overlaps(path, scopes):
    return any(_covers(path, scope) or _covers(scope, path) for scope in scopes)


def _dependency_paths(candidate, paths):
    """Guard explicitly reviewed fields and relational dependents, not all facts."""
    guarded = set(paths)
    touched = defaultdict(set)
    for path in paths:
        parts = _parts(path)
        if len(parts) >= 2 and parts[0] in ARRAYS and parts[1].isdigit():
            row = candidate[parts[0]][int(parts[1])]
            touched[parts[0]].add(row.get('id'))
    # Changed counts can feed explicit arithmetic. Population/arm changes can
    # invalidate children and results even when their numeric field is untouched.
    changed = True
    while changed:
        changed = False
        for section in ARRAYS:
            for i, row in enumerate(candidate.get(section, [])):
                if not isinstance(row, dict):
                    continue
                depends = (row.get('population_id') in touched['populations']
                    or section == 'populations' and row.get('parent_id') in touched['populations']
                    or any(row.get(key) in touched['arms'] for key in ('arm_id', 'intervention_arm_id', 'reference_arm_id'))
                    or section == 'sample_sizes' and bool(set(row.get('component_ids', [])) & touched['sample_sizes']))
                if depends:
                    guarded.add('/' + section + '/' + str(i))
                    if row.get('id') not in touched[section]:
                        touched[section].add(row.get('id')); changed = True
    return sorted(guarded)


def _clinical_overlay(original, clinical):
    """Keep original annotations and untouched values; never copy replay masks."""
    effective = deepcopy(original)
    for key, value in clinical.items():
        if key in ARRAYS and isinstance(value, list):
            previous = {row.get('id'): row for row in original.get(key, []) if isinstance(row, dict) and 'id' in row}
            effective[key] = [{**deepcopy(previous.get(row.get('id'), {})), **deepcopy(row)}
                              if isinstance(row, dict) and 'id' in row else deepcopy(row) for row in value]
        elif isinstance(value, dict) and isinstance(effective.get(key), dict):
            effective[key] = {**effective[key], **deepcopy(value)}
        else:
            effective[key] = deepcopy(value)
    return effective


def _flag_path(flag, record):
    section = flag.get('section')
    if section in ARRAYS:
        rows = record.get(section, [])
        index = next((i for i, row in enumerate(rows) if row.get('id') == flag.get('id')), None)
        if index is None:
            return None
        base = '/' + section + '/' + str(index)
    elif section in record:
        base = '/' + section
    else:
        return None
    field = flag.get('field')
    return base + '/' + field if field and field not in {'row', 'relationship'} else base


def _retain_flags(original, candidate, changed_paths):
    inherited = []
    for flag in original.get('field_flags', []):
        path = _flag_path(flag, original)
        if path is None or not any(_covers(path, change) for change in changed_paths):
            inherited.append(deepcopy(flag))
    combined = {_sha(f): deepcopy(f) for f in [*candidate.get('field_flags', []), *inherited]}
    candidate['field_flags'] = list(combined.values())
    for section in ARRAYS:
        for row in candidate.get(section, []):
            if not isinstance(row, dict) or 'id' not in row:
                continue
            relevant = [f for f in combined.values() if f.get('section') == section and f.get('id') == row['id']]
            if relevant:
                row['field_flags'] = list({_sha(f): deepcopy(f) for f in [*row.get('field_flags', []), *relevant]}.values())
    candidate.setdefault('validation', {})['field_issue_count'] = len(combined)
    return inherited


def _materialize_target(root, target, decisions, findings, packet, disposition_ref):
    original = target['record']; source = verified_json(root, target['source_ref'])
    if (source['stage'] != target['stage'] or source['pmid'] != original['pmid']
            or source['report_id'] != original['report_id'] or _sha(source) != target['source_sha256']
            or original['source_sha256'] != _sha(source) or _sha(original) != target['record_sha256']):
        raise ValueError('Original quantitative target/source binding changed')
    raw_artifact = verified_json(root, target['artifact_ref'])
    if raw_artifact.get('validated', {}).get('record') != original or raw_artifact.get('source_ref') != target['source_ref']:
        raise ValueError('Original GPT artifact differs from its saved review target')
    source_spans = {s['span_id'] for s in catalog_for(source)['spans']}
    if set(target.get('source_span_ids', [])) != source_spans:
        raise ValueError('Target original-source span membership differs')
    baseline = schema_record(original)
    baseline_validation = q.validate(baseline, source)
    if not baseline_validation.get('valid') or baseline_validation.get('global_errors'):
        raise ValueError('Original accepted clinical fields cannot be replayed by the quantitative validator')
    baseline_drift = _diff(baseline, schema_record(baseline_validation['record']))
    candidate = deepcopy(baseline); applied = []; changed_paths = []; pointers = []; reviewed_paths = []
    for decision in decisions:
        finding = findings[decision['finding_id']]
        _semantic_review(decision, finding, packet, target)
        reviewed_paths.extend(decision['semantic_review']['reviewed_fields'])
        pointer = finding['target']['field_path']
        concrete_pointer = (pointer[:-1] + str(len(_get(candidate, pointer.rsplit('/', 1)[0])))
                            if pointer.endswith('/-') else pointer)
        if any(_covers(concrete_pointer, other) or _covers(other, concrete_pointer) for other in pointers):
            raise ValueError('Overlapping amendment paths require a single reconciled decision')
        if finding['target']['source_sha256'] != _sha(source) or not finding.get('same_source_amendment_eligible'):
            raise ValueError('Cross-source amendment remains a proposal')
        if not pointer.endswith('/-') and _get(candidate, pointer) != finding['expected_value']:
            raise ValueError('Amendment expected value no longer matches original clinical field')
        actual_path = _put(candidate, pointer, finding['value']); changed_paths.append(actual_path); pointers.append(actual_path)
        parts = _parts(actual_path)
        row_path = '/' + '/'.join(parts[:2] if parts[0] in ARRAYS else parts[:1])
        row = _get(candidate, row_path)
        if isinstance(row, dict) and 'evidence' in row:
            ids = [p['span_id'] for p in finding['evidence']]
            row['evidence'] = list(dict.fromkeys([*row['evidence'], *ids]))
            changed_paths.append(row_path + '/evidence')
        applied.append({'finding_id': finding['id'], 'field_path': pointer, 'materialized_path': actual_path,
                        'previous_value': deepcopy(finding['expected_value']), 'value': deepcopy(finding['value']),
                        'original_source_sha256': _sha(source), 'source_evidence': deepcopy(finding['evidence']),
                        'semantic_review': deepcopy(decision['semantic_review']), 'rationale': decision['rationale']})
    validation = q.validate(candidate, source)
    if not validation.get('valid') or validation.get('global_errors'):
        raise ValueError('Amended quantitative record failed validation: ' + ', '.join(validation.get('global_errors', [])))
    drift = _diff(candidate, schema_record(validation['record']))
    # Appended rows have concrete indices now; the original '/-' pointer is a
    # review instruction, not a reference to every existing collection member.
    review_scopes = [path for path in reviewed_paths if not path.endswith('/-')]
    guarded = _dependency_paths(candidate, [*changed_paths, *review_scopes])
    related_drift = [path for path in drift if _overlaps(path, guarded)]
    if related_drift:
        raise ValueError('Quantitative validation changed or held proposed/dependent fields: ' + ', '.join(related_drift[:12]))
    old_issues = {_sha(i) for i in baseline_validation.get('issues', [])}
    new_issues = [i for i in validation.get('issues', []) if _sha(i) not in old_issues]
    if new_issues:
        raise ValueError('Amendment introduces quantitative validation issues: ' + ', '.join(i['code'] for i in new_issues[:8]))
    related_issues = [i for i in validation.get('issues', [])
                      if (path := _flag_path(i, candidate)) is not None and _overlaps(path, guarded)]
    if related_issues:
        raise ValueError('Quantitative validation holds a reviewed dependency: ' + ', '.join(
            (_flag_path(i, candidate) or 'record') + ': ' + i['code'] for i in related_issues[:8]))
    effective = _clinical_overlay(original, candidate)
    # Resolved flags must not survive on the amended field; unrelated flags stay.
    effective['field_flags'] = []
    for section in ARRAYS:
        for row in effective.get(section, []):
            if isinstance(row, dict) and row.get('field_flags'):
                row['field_flags'] = [flag for flag in row['field_flags']
                    if (path := _flag_path(flag, original)) is None or not any(_covers(path, changed) for changed in changed_paths)]
    inherited = _retain_flags(original, effective, changed_paths)
    # Recompute only annotation-level count links from the preserved clinical
    # values, so a newly verified N reaches planning without importing unrelated
    # numerical masks from the whole-record replay.
    for section in ('effects', 'survival', 'binary'):
        for row in effective.get(section, []):
            row['display_n'] = q.select_sample_size(row, effective['sample_sizes'], section=section, arms=effective['arms'])
    diagnostics = {'baseline_clinical_differences': baseline_drift,
                   'baseline_issues': deepcopy(baseline_validation.get('issues', [])),
                   'unrelated_replay_differences': [path for path in drift if path not in related_drift],
                   'unrelated_replay_issues': deepcopy(validation.get('issues', [])),
                   'guarded_field_paths': guarded,
                   'unrelated_clinical_values_preserved': True}
    effective_task = 'amend-' + _sha({'disposition_ref': disposition_ref, 'target': target['record_id'], 'record': effective})[:32]
    base_binding = _sha({'task_id': target['task_id'], 'record': original})
    binding = _sha({'task_id': effective_task, 'record': effective})
    effective_validation = {**deepcopy(validation), 'record': deepcopy(effective),
                            'issues': deepcopy(effective['field_flags']),
                            'inherited_unresolved_flags': deepcopy(inherited),
                            'validation_kind': 'field_scoped_quantitative_replay_with_original_values_preserved',
                            'replay_diagnostics': deepcopy(diagnostics)}
    return {'stage': target['stage'], 'task_id': effective_task, 'baseline_task_id': target['task_id'],
            'review_origin': 'source_reviewed_complementary_amendment', 'reviewer': 'Opus complementary review with explicit source adjudication',
            'original_record': deepcopy(original), 'record': effective,
            'baseline_record_sha256': _sha(original), 'effective_record_sha256': _sha(effective),
            'base_review_binding_sha256': base_binding, 'effective_review_binding_sha256': binding,
            'original_artifact_ref': deepcopy(target['artifact_ref']), 'source_ref': deepcopy(target['source_ref']),
            'disposition_ref': deepcopy(disposition_ref), 'amended_fields': applied,
            'inherited_unresolved_flags': inherited, 'prior_derivations': deepcopy(original.get('derivations', [])),
            'quantitative_validation': validation,
            'effective_validation': effective_validation,
            'replay_diagnostics': diagnostics,
            'manual_review_binding_status': 'requires_explicit_unchanged_dependency_bridge_before_publication'}


def materialize(root, disposition_ref):
    """Read-only: return effective proposals and holds, never change served data."""
    root = Path(root).resolve(); ledger = verified_json(root, disposition_ref)
    if (ledger.get('schema') != SCHEMA or ledger.get('published') is not False
            or not str(ledger.get('reviewer') or '').strip() or not str(ledger.get('review_note') or '').strip()):
        raise ValueError('An unpublished complementary disposition ledger is required')
    review, packet, validation = _review(root, ledger['review_ref'])
    if ledger['packet_ref'] != review['packet_ref'] or ledger['packet_sha256'] != packet['packet_sha256']:
        raise ValueError('Disposition ledger belongs to a different immutable review packet')
    accepted = {f['id']: f for f in validation['accepted_findings']}
    held = {f['finding']['id']: f['finding'] for f in validation.get('held_findings', [])}
    all_findings = {**accepted, **held}; targets = {t['record_id']: t for t in packet['targets']}
    groups = defaultdict(list); entries = []; seen = set()
    for decision in ledger['decisions']:
        ident = decision['finding_id']; finding = all_findings.get(ident)
        if (decision.get('disposition') not in DISPOSITIONS or not str(decision.get('rationale') or '').strip()
                or not finding or ident in seen or decision['finding_sha256'] != _sha(finding)
                or decision['target'] != finding['target']):
            raise ValueError('Disposition finding is stale, duplicate or foreign')
        seen.add(ident)
        target = targets[finding['target']['record_id']]
        if decision['target_record_sha256'] != _sha(target['record']):
            raise ValueError('Disposition target record differs')
        entry = {**deepcopy(decision), 'materialization_status': decision['disposition']}
        if decision['disposition'] == 'apply':
            if ident not in accepted or finding['action'] not in {'addition', 'correction'}:
                raise ValueError('A held or unresolved finding cannot be applied')
            groups[target['record_id']].append(decision)
            entry['materialization_status'] = 'pending_validation'
        entries.append(entry)
    if seen != set(all_findings):
        raise ValueError('The disposition ledger must preserve every review finding')
    effective = []; blocked = []
    for target_id, decisions in groups.items():
        try:
            value = _materialize_target(root, targets[target_id], decisions, accepted, packet, disposition_ref)
            effective.append(value); status = 'materialized_not_published'; reason = None
        except (ValueError, KeyError, TypeError, IndexError) as exc:
            reason = str(exc); status = 'blocked'
            blocked.append({'record_id': target_id, 'finding_ids': [d['finding_id'] for d in decisions],
                            'field_paths': [d['target']['field_path'] for d in decisions],
                            'original_record_preserved': True, 'reason': reason})
        for entry in entries:
            if entry['finding_id'] in {d['finding_id'] for d in decisions}:
                entry.update(materialization_status=status, materialization_reason=reason)
    value = {'schema': SCHEMA, 'disposition_ref': deepcopy(disposition_ref), 'pmid': ledger['pmid'],
             'review_ref': deepcopy(ledger['review_ref']), 'packet_ref': deepcopy(ledger['packet_ref']),
             'ledger': entries, 'effective_records': effective, 'blocked': blocked,
             'original_records_changed': False, 'served_data_changed': False, 'published': False,
             'publication_requirement': 'Shared effective-record projection and explicitly rechecked manual-review bindings are required before any UI publication.'}
    value['materialization_sha256'] = _sha(value)
    return value
