"""Apply verified field decisions to a derived publication, preserving the original model records."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
import json
from pathlib import Path

from . import quantitative
from .complementary_amendments import ARRAYS, _get, _parts, _put, _flag_path, schema_record
from .fulltext_export import merge_fulltext_article
from .io import atomic_bytes, canonical, digest, owned, verified_json
from .quantitative_export import PUBLIC, project_article
from .screening import catalog_for

MANIFEST = 'data/current/complementary/adjudicated.json'
EDITABLE = {'study', 'study_details', 'populations', 'arms', 'sample_sizes', 'effects', 'binary', 'survival'}
OUTCOMES = ('effects', 'survival', 'binary')


def _hash(value):
    return digest(canonical(value))


def _at(value, path):
    try:
        return _get(value, path)
    except (KeyError, IndexError):
        return None


def _merge_edits(original, findings):
    """All expected values and array offsets refer to the same immutable baseline."""
    record = deepcopy(original)
    applied = {}
    sources = defaultdict(set)
    blocked_counts = set()
    for finding in findings:
        for edit in finding.get('edits', []):
            path = edit['field_path']
            parts = _parts(path)
            if parts[0] not in EDITABLE or len(parts) < 2:
                raise ValueError(f'Unsupported scientific field {path}')
            value = edit['after']
            if parts[-1] == '-':
                parent_path = path.rsplit('/', 1)[0]
                collection = _get(record, parent_path)
                if not isinstance(collection, list):
                    raise ValueError(f'Append target is not a list: {path}')
                if value in collection:
                    index = collection.index(value)
                else:
                    if isinstance(value, dict) and value.get('id') and any(isinstance(other, dict) and
                            other.get('id') == value['id'] for other in collection):
                        raise ValueError(f'Appended row identity already belongs to another value: {path}')
                    index = len(collection)
                    _put(record, path, value)
                actual = parent_path + '/' + str(index)
            else:
                if _at(original, path) != edit['before']:
                    raise ValueError(f'Expected pre-edit field differs: {path}')
                # Every array offset is pinned to the original identified row, even with other appends.
                if parts[0] in ARRAYS and parts[1].isdecimal():
                    row = original[parts[0]][int(parts[1])]
                    if record[parts[0]][int(parts[1])].get('id') != row.get('id'):
                        raise ValueError(f'Original row identity changed: {path}')
                actual = path
                if actual in applied and applied[actual] != value:
                    raise ValueError(f'Conflicting accepted edits: {actual}')
                if any(actual != previous and (actual.startswith(previous + '/') or
                        previous.startswith(actual + '/')) for previous in applied):
                    raise ValueError(f'Overlapping accepted edits: {actual}')
                _put(record, path, value)
            if (parts[0] in OUTCOMES and value in ('NA', None) and
                    (parts[2:] in (['display_n', 'n'], ['analysis_n'], ['denominator']))):
                blocked_counts.add((parts[0], int(parts[1])))
            method = edit.get('derivation')
            if method == 'unique_integer_from_rounded_percent' or finding.get('reason', '').startswith('Derived numerator.'):
                if len(parts) != 3 or parts[0] != 'binary' or parts[2] != 'numerator':
                    raise ValueError('A derived response count must address an outcome numerator')
                binary = record['binary'][int(parts[1])]
                derivation = {'section': 'binary', 'id': binary['id'], 'field': 'numerator',
                    'method': 'unique_integer_from_rounded_percent', 'value': value,
                    'denominator': binary['denominator'], 'percentage': binary['percentage']}
                if derivation not in record['derivations']:
                    record['derivations'].append(derivation)
            applied[actual] = value
            row_path = '/' + '/'.join(_parts(actual)[:2] if parts[0] in ARRAYS else [parts[0]])
            sources[row_path].update(proof['span_id'] for proof in finding['evidence'])
    for path, spans in sources.items():
        row = _get(record, path)
        if isinstance(row, dict) and 'evidence' in row:
            row['evidence'] = list(dict.fromkeys([*row['evidence'], *sorted(spans)]))
    if applied:
        flags = [flag for flag in record.get('field_flags', [])
                 if _flag_path(flag, original) not in applied]
        if 'field_flags' in record:
            record['field_flags'] = flags
        if isinstance(record.get('validation'), dict) and 'field_issue_count' in record['validation']:
            record['validation']['field_issue_count'] = len(flags)
        for section in OUTCOMES + ('sample_sizes', 'arms', 'populations'):
            for i, row in enumerate(record[section]):
                if 'field_flags' in row:
                    row['field_flags'] = [f for f in row['field_flags'] if _flag_path(f, original) not in applied]
                if (section, i) in blocked_counts:
                    row['complementary_count_scope'] = 'source_reviewed_unavailable'
                if section in OUTCOMES:
                    row['display_n'] = quantitative.select_sample_size(row, record['sample_sizes'],
                        section=section, arms=record['arms'])
    quantitative._shape(schema_record(record), quantitative.review_schema(record['stage']))
    return record


def _proofs(packet, target, finding, originals):
    spans = {s['span_id']: s for s in packet['source_catalog']['spans']}
    for proof in finding.get('evidence', []):
        span = spans.get(proof.get('span_id'))
        quote = proof.get('quote')
        if not span or not isinstance(quote, str) or not quote.strip() or quote not in span['text']:
            raise ValueError(f"Unverified quotation in {finding['finding_id']}")
        if (proof['span_id'] not in originals or quote not in originals[proof['span_id']] or
                proof['span_id'] not in target['source_span_ids']):
            raise ValueError(f"Quote is absent from the original target source in {finding['finding_id']}")
    if not finding.get('evidence'):
        raise ValueError(f"Source evidence is missing in {finding['finding_id']}")


def _public_note(finding):
    note = finding.get('note')
    if not note:
        return None
    if isinstance(note, dict):
        note = note.get('text') or note.get('description')
    if not isinstance(note, str) or not note.strip():
        raise ValueError(f"Missing note text for {finding['finding_id']}")
    return {'field': finding.get('field') or finding.get('domain') or 'Study details', 'text': note,
            'finding_id': finding['finding_id'], 'evidence': deepcopy(finding['evidence'])}


def _apply_article(root, article, previous, entries, drug_catalog):
    packets = {}
    targets = {}
    sources = {}
    originals = {}
    by_stage = defaultdict(list)
    for item in entries:
        path = item['packet_path']
        if path not in packets:
            packet = json.loads(owned(root, path).read_bytes())
            content_hash = packet.pop('packet_sha256')
            if _hash(packet) != content_hash:
                raise ValueError('Original review packet differs from its saved hash')
            if str(packet['pmid']) != article['pmid']:
                raise ValueError('Review packet belongs to a different PMID')
            packets[path] = packet
            for target in packet['targets']:
                prior = targets.setdefault(target['stage'], target)
                if prior['record_sha256'] != target['record_sha256']:
                    raise ValueError('Review packets disagree on original study record')
        packet = packets[path]
        target = next((t for t in packet['targets'] if t['record_id'] == item['record_id']), None)
        if (not target or item['stage'] != target['stage'] or
                item['baseline_record_sha256'] != target['record_sha256'] or
                item['source_sha256'] != target['source_sha256']):
            raise ValueError(f"Finding does not match its original target: {item['finding_id']}")
        stage = target['stage']
        if stage not in sources:
            source = verified_json(root, target['source_ref'])
            catalog = catalog_for(source)
            if (catalog['source_sha256'] != target['source_sha256'] or source['stage'] != stage or
                    str(source['pmid']) != article['pmid']):
                raise ValueError('Original source identity differs from the saved review')
            sources[stage] = source
            originals[stage] = {s['span_id']: s['text'] for s in catalog['spans']}
        _proofs(packet, target, item, originals[stage])
        by_stage[target['stage']].append(item)

    if set(by_stage) - {wrapper['stage'] for wrapper in article['records']}:
        raise ValueError('Reviewed stage is missing from the published article')
    changed = False
    for wrapper in article['records']:
        stage = wrapper['stage']
        if stage not in by_stage:
            continue
        items = by_stage[stage]
        target = targets[stage]
        baseline = target['record']
        effective = wrapper['record']
        if (wrapper['task_id'] != target['task_id'] or _hash(baseline) != target['record_sha256'] or
                (effective != baseline and wrapper.get('complementary_effective_sha256') != _hash(effective))):
            raise ValueError('Published study differs from its reviewed original or verified derivative')
        notes = {}
        for item in items:
            note = _public_note(item)
            if not note:
                continue
            existing_note = notes.get(note['text'])
            if existing_note is None:
                notes[note['text']] = note
            else:
                fields = existing_note.setdefault('fields', [existing_note['field']])
                if note['field'] not in fields:
                    fields.append(note['field'])
                for proof in note['evidence']:
                    if proof not in existing_note['evidence']:
                        existing_note['evidence'].append(proof)
        if notes:
            wrapper['complementary_notes'] = list(notes.values())
        if any(item.get('edits') for item in items):
            updated = _merge_edits(baseline, items)
            changed |= effective != updated
            # Existing human reviews bind specific endpoint/cohort data. Carry
            # a binding across unrelated edits only when its full scope agrees.
            scope = ('arms', 'populations', 'sample_sizes', 'decision')
            same_scope = all(baseline.get(key) == updated.get(key) for key in scope)
            original_study = {k: v for k, v in baseline['study'].items() if k not in ('name', 'doi', 'identifiers', 'evidence')}
            revised_study = {k: v for k, v in updated['study'].items() if k not in ('name', 'doi', 'identifiers', 'evidence')}
            binding = lambda r: _hash({'task_id': wrapper['task_id'], 'record': r})
            wrapper['complementary_review_bindings'] = {
                'original': binding(baseline), 'effective': binding(updated),
                'cohort_scope_unchanged': same_scope and original_study == revised_study,
                'comparison_scope_unchanged': same_scope and original_study == revised_study
                    and baseline['effects'] == updated['effects'] and baseline.get('study_details') == updated.get('study_details')}
            wrapper['complementary_edits'] = [{'finding_id': item['finding_id'], 'field_paths': [
                edit['field_path'] for edit in item['edits']], 'evidence': item['evidence']}
                for item in items if item.get('edits')]
            if 'issues' in wrapper:
                old_flags = baseline.get('field_flags', [])
                new_flags = updated.get('field_flags', [])
                wrapper['issues'] = [issue for issue in wrapper['issues'] if issue not in old_flags or issue in new_flags]
            wrapper.update(record=updated, complementary_original_sha256=target['record_sha256'],
                           complementary_effective_sha256=_hash(updated))
    if not changed:
        return previous, {}, None

    citation = {key: previous.get(key) for key in ('pmid', 'report_id', 'title', 'year', 'doi',
                                                   'first_author_surname', 'publication_hold')}
    actions = []
    for wrapper in article['records']:
        stage = wrapper['stage']
        target = targets.get(stage)
        if stage in sources:
            source = sources[stage]
        elif target:
            source = verified_json(root, target['source_ref'])
        else:
            artifact = verified_json(root, wrapper['artifact_ref'])
            source = verified_json(root, artifact['source_ref'])
        record = wrapper['record']
        if _hash(source) != record['source_sha256']:
            raise ValueError('Accepted review source and record differ')
        result = {'task_id': wrapper['task_id'], 'source': source,
                  'validation': {'valid': True, 'global_errors': [], 'record': record}}
        if stage == 'R2':
            clinical, evidence = project_article(citation, result)
            r2 = record
        else:
            actions = merge_fulltext_article(clinical, evidence, citation, result, r2, drug_catalog,
                                             previous['R3_report_complete'])
    return clinical, evidence, actions


def apply(root, payload, manifest=None, *, archive_baseline=False):
    """Overlay validated decisions before clinical classification, maps and study tables are built."""
    root = Path(root).resolve()
    if manifest is None:
        path = owned(root, MANIFEST)
        if not path.is_file():
            return payload
        manifest = json.loads(path.read_bytes())
    if manifest.get('schema_version') != 1 or not isinstance(manifest.get('findings'), list):
        raise ValueError('Invalid complementary adjudication manifest')
    manifest_hash = _hash(manifest)
    marker = payload.get('complementary_adjudication') or {}
    if marker.get('manifest_sha256') == manifest_hash:
        return payload
    history = owned(root, 'data/current/reextraction/' + payload['phase_id'] + '/publications')
    baseline_sha = marker.get('baseline_sha256')
    if marker:
        if not baseline_sha:
            raise ValueError('An earlier derivative requires its immutable pre-adjudication publication')
        data = (history / (baseline_sha + '.json')).read_bytes()
        if digest(data) != baseline_sha:
            raise ValueError('Pre-adjudication evidence changed')
        payload = json.loads(data)
        del data
    elif archive_baseline:
        data = canonical(payload)
        baseline_sha = digest(data)
        path = history / (baseline_sha + '.json')
        if path.exists():
            if path.read_bytes() != data:
                raise ValueError('Pre-adjudication archive hash collision')
        else:
            atomic_bytes(path, data)
        del data
    clinical = payload['clinical_evidence']
    by_pmid = {article['pmid']: i for i, article in enumerate(clinical['articles'])}
    compact = {article['pmid']: article for article in payload['articles']}
    grouped = defaultdict(list)
    for finding in manifest['findings']:
        if finding['status'] in {'amended', 'supplement'}:
            pmid = str(finding['pmid'])
            if pmid not in compact:
                raise ValueError(f'Complementary target is outside this publication: {pmid}')
            grouped[pmid].append(finding)
    assessment = payload.get('fulltext_assessment') or {}
    new_actions = {}
    obsolete = set()
    active = set()
    drug_catalog = json.loads(owned(root, 'config/drug_catalog.json').read_bytes())
    for pmid, entries in grouped.items():
        index = by_pmid[pmid]
        old = clinical['articles'][index]
        try:
            revised, evidence, actions = _apply_article(root, compact[pmid], old, entries, drug_catalog)
        except (KeyError, IndexError, ValueError) as exc:
            raise ValueError(f'Complementary publication PMID {pmid}: {exc}') from exc
        if actions is not None:
            new_actions[pmid] = actions
            clinical['articles'][index] = revised
            # Replace only this PMID's superseded evidence namespace. Unedited
            # reviews retain their exact identifiers for audit and human curation.
            bindings = {r['review_binding_sha256'][:24] for key in ('quantitative_results','sample_size_records')
                        for r in old[key] if r.get('review_binding_sha256')}
            obsolete.update('CE-' + binding for binding in bindings)
            active.update(key[:27] for key in evidence)
            clinical['evidence_registry'].update(evidence)
    obsolete.difference_update(active)
    if obsolete:
        registry = clinical['evidence_registry']
        for key in [k for k in registry if k[:27] in obsolete]:
            del registry[key]
    if assessment and new_actions:
        assessment['display_reconciliation'] = [a for a in assessment['display_reconciliation']
            if str(a['pmid']) not in new_actions] + [a for actions in new_actions.values() for a in actions]
    clinical['content_sha256'] = _hash({key: clinical[key] for key in ('articles','evidence_registry')})
    payload['complementary_adjudication'] = {'schema_version': 1, 'manifest_sha256': manifest_hash, 'baseline_sha256': baseline_sha,
        'findings': dict(Counter(f['status'] for f in manifest['findings'])), 'articles': len(grouped)}
    return payload


def archive_decisions(root, payload):
    """Bind a published derivative to the exact private ledger used to build it."""
    marker = payload.get('complementary_adjudication')
    if not marker:
        return
    data = canonical(json.loads(owned(root, MANIFEST).read_bytes()))
    key = digest(data)
    if key != marker['manifest_sha256']:
        raise ValueError('The approved field decisions changed during publication. Rebuild from the current ledger.')
    path = owned(root, 'data/current/complementary/amendments/publications/' + key + '.json')
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError('Archived complementary decisions differ from their content address')
    else:
        atomic_bytes(path, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='.')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if not owned(root, MANIFEST).is_file():
        parser.error('The saved adjudication manifest is missing.')
    from .fulltext_export import publish
    payload = json.loads(owned(root, PUBLIC).read_bytes())
    print(json.dumps(publish(root, payload), indent=2))


if __name__ == '__main__':
    main()
