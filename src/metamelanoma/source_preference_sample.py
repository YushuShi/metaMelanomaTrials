"""Materialize a source-verified count omitted from the original clinical projection."""
from copy import deepcopy

from .io import canonical, digest
from .quantitative import select_sample_size
from .quantitative_export import arm_entity, numeric, population_entity, present, project_sample, projection_fields, selected_n, wrap


def ensure_preferred_sample(article, wrapper, row, decision, evidence):
    """Append the canonical R3 sample when its adjudicated N and population are supported."""
    record = wrapper['record']
    if (decision.get('status') != 'main_text' or wrapper.get('stage') != 'R3' or record.get('stage') != 'R3'
            or not wrapper.get('source_proof_ref') or not article.get('current_main_eligible')
            or article.get('publication_hold') or record['decision']['status'] != 'retain'
            or (record['report_id'], record['pmid']) != (article['report_id'], article['pmid'])):
        return None
    originals = [s for s in record['sample_sizes'] if s['id'] == row['id']]
    if originals != [row]:
        return None
    sample = {**row, **decision.get('values', {})}
    n = sample['n']
    if type(n) is not int or n < 0:
        return None
    binding = digest(canonical({'task_id': wrapper['task_id'], 'record': record}))
    prefix = 'CE-' + binding[:24] + '-'
    anchors = decision.get('evidence_ids', [])
    from .source_preference import main_document
    if not anchors or not all(key.startswith(prefix) and key in evidence and
            evidence[key]['source_id'].startswith(record['report_id'] + ':') and
            main_document(evidence[key]['source_id']) for key in anchors):
        return None
    sample['evidence'] = [key.removeprefix(prefix) for key in anchors]
    populations = {p['id']: p for p in record['populations']}
    arms = {a['id']: a for a in record['arms']}
    if present(sample.get('arm_id')) and sample['arm_id'] not in arms:
        return None
    def ids(spans):
        keys = [prefix + span for span in spans]
        if not all(key in evidence and evidence[key]['source_id'].startswith(record['report_id'] + ':') for key in keys):
            raise ValueError(f'Unbound population or treatment passage for preferred count {row["id"]}')
        return keys
    preferred = project_sample(sample, common=projection_fields(record, binding), eligible=True, prefix=prefix,
        population=lambda value: population_entity(populations.get(value), ids),
        arm=lambda value: arm_entity(arms.get(value), ids), ids=ids)
    if not preferred:
        return None
    for existing in article['sample_size_records']:
        if existing['sample_record_id'] == preferred['sample_record_id']:
            return existing
    preferred['source_preference_generated'] = True
    article['sample_size_records'].append(preferred)
    return preferred


def _preserve(row, keys):
    """The source-preference reset restores these fields before the next publication."""
    saved = row.setdefault('before_source_preference', {'absent': [], 'fields': {}})
    for key in keys:
        if key in saved['fields'] or key in saved['absent']:
            continue
        if key in row:
            saved['fields'][key] = deepcopy(row[key])
        else:
            saved['absent'].append(key)


def refresh_preferred_sample_sizes(article, wrappers, evidence):
    """Refresh dependent outcome Ns through the normal population/arm/cutoff selector."""
    from .source_preference import _section, effective_record
    outcomes = {(r['review_stage'], _section(r['quantitative_record']), r['quantitative_record']['id']): r
                for r in article['quantitative_results'] if 'calculation' not in r.get('quantitative_record', {})}
    changed = {}
    for stage, wrapper in wrappers.items():
        decisions = wrapper.get('source_preferences', {})
        if not decisions:
            continue
        record = effective_record(wrapper)
        for section in ('binary', 'effects', 'survival'):
            for result in record[section]:
                ident = result['id']
                choice = decisions.get(section, {}).get(ident, {})
                if 'sample_sizes' not in decisions and not {'analysis_n', 'denominator'} & choice.get('values', {}).keys():
                    continue
                row = outcomes.get((stage, section, ident))
                if row is None:
                    continue
                original = next(r for r in wrapper['record'][section] if r['id'] == ident)
                selection = select_sample_size(result, record['sample_sizes'], section=section, arms=record['arms'])
                old = select_sample_size(original, wrapper['record']['sample_sizes'], section=section, arms=record['arms'])
                # Even the same N may now cite a specific main-text passage.
                n, basis, spans = selected_n(result, record, collection=section)
                if selection == old and spans == selected_n(original, wrapper['record'], collection=section)[2]:
                    continue
                prefix = 'CE-' + row['review_binding_sha256'][:24] + '-'
                anchors = [prefix + span for span in spans]
                if not all(anchor in evidence for anchor in anchors):
                    raise ValueError(f'Unbound outcome sample size for PMID {article["pmid"]}, {stage} {ident}')
                own = wrapper['source_preferences'].setdefault(section, {}).setdefault(ident, {'status': 'sample_context'})
                own.setdefault('values', {})['display_n'] = selection
                _preserve(row, ('quantitative_record', 'sample_size_basis', 'scoped_sample_size', 'analysis_n'))
                row['source_preference'] = own
                row['quantitative_record'] = {**row['quantitative_record'], 'display_n': deepcopy(selection)}
                row['sample_size_basis'] = basis
                row['scoped_sample_size'] = {'n': n, 'basis': basis, 'evidence_ids': anchors,
                    'status': 'CONFLICTING' if basis == 'conflicting' else 'available' if numeric(n) else 'missing'}
                row['analysis_n'] = wrap(n, 'sample_size', anchors, 'patients')
                changed[row['result_id']] = row
    # A displayed abstract can explicitly source a missing analysis N from a full-text
    # outcome. Follow that existing provenance when the supplying outcome was updated.
    for row in outcomes.values():
        for item in row.get('display_supplements', []):
            source = changed.get(item.get('source_result_id'))
            if item.get('field') == 'analysis_n' and source:
                _preserve(row, ('analysis_n', 'sample_size_basis', 'scoped_sample_size'))
                for key in ('analysis_n', 'sample_size_basis', 'scoped_sample_size'):
                    row[key] = deepcopy(source[key])
