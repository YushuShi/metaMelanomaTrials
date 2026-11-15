"""Frozen, source-bound inputs for the complementary review; no API or retrieval.

The accepted GPT records and earlier presentation reviews are review targets and
context. Only the checked original title/abstract, article and supplement blocks
enter the evidence catalogue. Preparing an inventory never edits those inputs.
"""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import re

from .io import atomic_json, canonical, digest, evidence_path, owned, reference, verified_json
from .quantitative_sources import verify_entry
from .screening import catalog_for


SCHEMA = 'metaMelanomaTrials_complementary_sources_v1'
SCOPE_SIZE = 2538
MANUAL_NO_ABSTRACT = frozenset({'27528584', '27743875'})
DEFAULT_DIRECTORY = 'data/current/complementary/melanoma-opus-complementary-20261114'
DEFAULT_PUBLICATION = 'website/dist/data/quantitative_extraction.json'
DEFAULT_R2_PLAN = 'data/continuations/r2_quantitative_20261107/plan_ref.json'
DEFAULT_R3_PLAN = 'data/r3/quantitative_20261108/plan_ref.json'
DEFAULT_CORRECTIONS = (
    'config/sample_size_link_reviews.json', 'config/comparison_result_reviews.json',
    'website/dist/outcome_source_rules.js', 'website/dist/cohort_alias_rules.js',
)
DEFAULT_DISCREPANCIES = ('data/audits/outcome_conflicts_20261108/human_manual_review_summary.json',)
SUBSTANTIVE_CODES = frozenset({
    'CONFLICTING_same_scope_counts', 'CONFLICTING_reported_CI_level',
    'CONFLICTING_source_CI_levels', 'arm_population_mismatch', 'self_comparison',
    'reversed_confidence_interval', 'impossible_value',
})
REVIEW_QUEUE_SECTIONS = frozenset({
    'published_value_or_denominator_review', 'unclear_outcome_scope_review',
    'extracted_population_scope_review', 'derived_interval_review',
})


def _sha(value):
    return digest(canonical(value))


def _checked_bytes(root, ref):
    content = evidence_path(root, ref['path']).read_bytes()
    if digest(content) != ref['sha256'] or ref.get('bytes', len(content)) != len(content):
        raise ValueError('Saved evidence no longer matches its reference')
    return content


def _context_rows(root, ref, *, discrepancy=False):
    """Read declarative review data, never execute presentation JavaScript."""
    content = _checked_bytes(root, ref).decode()
    if ref['path'].endswith('.js'):
        match = re.search(r'\breturn\s+(\[.*\])\s*;\s*\}\);\s*$', content, re.S)
        if not match:
            raise ValueError('Review context must be a declarative JSON array')
        value = json.loads(match.group(1))
    else:
        value = json.loads(content)
    if discrepancy:
        return [dict(row, review_queue=key) for key in sorted(REVIEW_QUEUE_SECTIONS)
                for row in value.get(key, []) if isinstance(row, dict)]
    return value if isinstance(value, list) else value.get('reviews', [])


def _index_context(root, refs, *, discrepancy=False):
    result = {}
    for ref in refs:
        for row in _context_rows(root, ref, discrepancy=discrepancy):
            if row.get('pmid'):
                result.setdefault(str(row['pmid']), []).append({
                    'context_ref': deepcopy(ref), 'authority': 'prior_review_context_only',
                    'review': deepcopy(row),
                })
    return result


def _status(record):
    value = record.get('decision', {}).get('status')
    return 'unclear' if value in {'uncertain', 'retain_for_full_text'} else value


def _number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool)


def priority_for(wrappers, discrepancy_context=()):
    """A scheduling hint, not a new eligibility or error decision.

    Routine literal/number normalization and isolated missing references do not
    become substantive discrepancies. A later R3 decision supersedes R2 unclear
    for scheduling, while both original decisions remain in the review packet.
    """
    ordered = sorted(wrappers, key=lambda w: (w['stage'] != 'R3', w.get('task_id', '')))
    latest = ordered[0]['record'] if ordered else {}
    issues = [dict(i, stage=w['stage']) for w in wrappers for i in w.get('issues', [])
              if i.get('code') in SUBSTANTIVE_CODES]
    reasons = []
    if _status(latest) == 'unclear':
        reasons.append('latest_stage_unclear')
    if issues or discrepancy_context:
        reasons.append('substantive_difference_to_verify')
    eligible = [w['record'] for w in wrappers if _status(w['record']) in {'retain', 'unclear'}]
    counts = [n for record in eligible for n in record.get('sample_sizes', [])
              if _number(n.get('n')) and n['n'] > 0]
    effects = [e for record in eligible for e in record.get('effects', [])]
    missing = []
    if eligible and not counts:
        missing.append('sample_size')
    if any(not (_number(e.get('ci_lower')) and _number(e.get('ci_upper'))) for e in effects):
        missing.append('effect_confidence_interval')
    if any(not (_number(e.get('analysis_n')) or _number((e.get('display_n') or {}).get('n')))
           for e in effects):
        missing.append('effect_sample_size_link')
    if missing:
        reasons.append('missing_quantitative_fields')
    rank = (0 if 'latest_stage_unclear' in reasons else 1 if issues or discrepancy_context
            else 2 if missing else 3)
    return {'rank': rank, 'reasons': reasons or ['remaining_cohort'],
            'latest_stage': ordered[0]['stage'] if ordered else None,
            'latest_decision': _status(latest), 'missing_fields': missing,
            'substantive_issue_count': len(issues), 'issue_hints': issues[:20],
            'issue_hints_truncated': len(issues) > 20}


def _artifact(root, wrapper, pmid, phases):
    record = wrapper['record']
    candidates = [wrapper['artifact_ref']] if wrapper.get('artifact_ref') else []
    if not candidates:
        for phase in phases:
            folder = owned(root, f'data/current/reextraction/{phase}/records/{pmid}')
            if folder.exists():
                candidates.extend(reference(root, path) for path in sorted(folder.glob('*.json')))
    matches = []
    for ref in candidates:
        value = verified_json(root, ref)
        if (str(value.get('pmid')) == pmid and value.get('stage') == wrapper['stage']
                and value.get('task_id') == wrapper.get('task_id')
                and value.get('validated', {}).get('record') == record):
            matches.append((ref, value))
    if not matches:
        raise ValueError('Accepted published record has no matching original validated artifact')
    # Validator replays can leave byte-different wrappers around identical facts.
    ref, value = sorted(matches, key=lambda item: item[0]['path'])[0]
    source = verified_json(root, value['source_ref'])
    if (source.get('stage') != wrapper['stage'] or str(source.get('pmid')) != pmid
            or source.get('report_id') != record.get('report_id') or _sha(source) != record.get('source_sha256')):
        raise ValueError('Accepted record and original source binding differ')
    catalog_for(source)
    return {'stage': wrapper['stage'], 'record_id': wrapper['stage'] + ':' + wrapper['task_id'],
            'task_id': wrapper['task_id'], 'artifact_ref': deepcopy(ref),
            'record_sha256': _sha(record), 'source_sha256': _sha(source),
            'source_ref': deepcopy(value['source_ref']),
            'review_origin': wrapper.get('review_origin', 'model_extraction')}, source


def _scope(publication, r2_plan, pilot, frozen_cohort):
    scope = [str(x) for x in publication.get('authorized_scope_pmids', [])]
    if len(scope) != SCOPE_SIZE or len(set(scope)) != SCOPE_SIZE:
        raise ValueError('The authorized scope must contain exactly 2538 distinct PMIDs')
    articles = publication.get('articles', [])
    if len(articles) != SCOPE_SIZE or {str(a['pmid']) for a in articles} != set(scope):
        raise ValueError('Published articles do not equal the frozen authorized scope')
    citations = [a['citation'] for plan in (r2_plan, pilot) for a in plan['articles']]
    if (len(citations) != SCOPE_SIZE or {str(a['pmid']) for a in citations} != set(scope)
            or {str(x) for x in frozen_cohort['article_pmids']} != set(scope)):
        raise ValueError('R2 continuation, pilot and frozen cohort disagree')
    return sorted(scope, key=int)


def build_inventory(root, publication_ref, r2_plan_ref, r3_plan_ref,
                    correction_refs=(), discrepancy_refs=()):
    """Return a finite deterministic manifest. Does not write or dispatch.

    Input-level integrity/scope failures abort; article-level missing or changed
    sources become explicit holds. No held article silently falls back to less
    complete evidence, and no R2 exclusion enters full-text review here.
    """
    root = Path(root).resolve()
    publication = verified_json(root, publication_ref)
    r2_plan = verified_json(root, r2_plan_ref)
    pilot_ref = r2_plan['continuation']['pilot_plan_ref']
    pilot = verified_json(root, pilot_ref)
    cohort_ref = r2_plan['continuation']['cohort_ref']
    scope = _scope(publication, r2_plan, pilot, verified_json(root, cohort_ref))
    r3_plan = verified_json(root, r3_plan_ref)
    corpus_ref = r3_plan['source_corpus_ref']
    corpus = verified_json(root, corpus_ref)
    entries = {str(e['pmid']): e for e in corpus['articles']}
    if len(entries) != len(corpus['articles']) or not set(entries) <= set(scope):
        raise ValueError('Full-text corpus has duplicate or out-of-scope articles')
    corrections = _index_context(root, correction_refs)
    discrepancies = _index_context(root, discrepancy_refs, discrepancy=True)
    phases = sorted({p['phase_id'] for p in (r2_plan, pilot, r3_plan)})
    rows = []
    for article in publication['articles']:
        pmid = str(article['pmid']); wrappers = article.get('records', [])
        priority = priority_for(wrappers, discrepancies.get(pmid, []))
        row = {'pmid': pmid, 'packet_status': 'ready', 'reason': None,
               'priority': priority, 'target_refs': [], 'fulltext_entry': None,
               'source_corrections': corrections.get(pmid, []),
               'discrepancy_context': discrepancies.get(pmid, []),
               'current_decisions': {w['stage']: _status(w['record']) for w in wrappers},
               'published_article_sha256': _sha(article)}
        if pmid in MANUAL_NO_ABSTRACT:
            row.update(packet_status='hold', reason='user_confirmed_abstract_unavailable',
                       review_mode='source_disposition', no_model_request=True,
                       source_disposition=deepcopy(wrappers))
            rows.append(row); continue
        try:
            dispositions = [w for w in wrappers if w.get('review_origin') == 'local_primary_source_availability'
                            and w['record'].get('decision', {}).get('reason_code') == 'scientific_abstract_unavailable']
            if dispositions:
                if len(dispositions) != 1 or len(wrappers) != 1:
                    raise ValueError('Source disposition conflicts with current model records')
                disposition = dispositions[0]
                proof = verified_json(root, disposition['source_availability_ref'])
                if str(proof.get('pmid')) != pmid or proof.get('status') != 'confirmed_unavailable':
                    raise ValueError('Abstract-unavailable disposition has no matching source proof')
                for check in proof.get('checks', []):
                    if check.get('artifact_ref'):
                        _checked_bytes(root, check['artifact_ref'])
                row.update(packet_status='hold', reason='locally_confirmed_abstract_unavailable',
                           review_mode='source_disposition', no_model_request=True,
                           source_disposition=deepcopy(disposition))
                rows.append(row); continue
            if len([w for w in wrappers if w['stage'] == 'R2']) != 1:
                raise ValueError('Exactly one current R2 record is required')
            if len({w['stage'] for w in wrappers}) != len(wrappers):
                raise ValueError('Multiple current records for one stage require explicit selection')
            r2_source = None
            for wrapper in sorted(wrappers, key=lambda w: w['stage']):
                target, source = _artifact(root, wrapper, pmid, phases)
                row['target_refs'].append(target)
                if wrapper['stage'] == 'R2':
                    r2_source = source
            if not any(b.get('block_id') == 'abstract' and b.get('text', '').strip()
                       for b in r2_source['blocks']):
                raise ValueError('Scientific abstract is unavailable; no empty model request')
            excluded = row['current_decisions']['R2'] == 'exclude'
            if excluded and 'R3' in row['current_decisions']:
                raise ValueError('Current R2 exclusion has unexpected R3 record; review routing')
            row['review_mode'] = 'abstract_only' if excluded or pmid not in entries else 'full_text'
            if row['review_mode'] == 'full_text':
                checked = verify_entry(root, entries[pmid])
                for target in row['target_refs']:
                    if target['stage'] == 'R3' and target['source_sha256'] != _sha(checked['source']):
                        raise ValueError('Accepted R3 record is not bound to the verified full-text corpus')
                row['fulltext_entry'] = deepcopy(entries[pmid])
            elif 'R3' in row['current_decisions']:
                raise ValueError('Accepted R3 original full text lacks a verified corpus entry')
        except (ValueError, KeyError, OSError, TypeError) as exc:
            row.update(packet_status='hold', reason=str(exc), no_model_request=True)
        rows.append(row)
    rows.sort(key=lambda row: (row['packet_status'] != 'ready', row['priority']['rank'], int(row['pmid'])))
    counts = dict(Counter(row['packet_status'] for row in rows))
    counts.update(total=len(rows), full_text=sum(r.get('review_mode') == 'full_text' and r['packet_status'] == 'ready' for r in rows),
                  abstract_only=sum(r.get('review_mode') == 'abstract_only' and r['packet_status'] == 'ready' for r in rows),
                  latest_stage_unclear=sum(r['priority']['rank'] == 0 for r in rows))
    value = {'schema': SCHEMA, 'authorized_scope_pmids': scope,
             'publication_ref': deepcopy(publication_ref), 'r2_plan_ref': deepcopy(r2_plan_ref),
             'pilot_plan_ref': deepcopy(pilot_ref), 'cohort_ref': deepcopy(cohort_ref),
             'r3_plan_ref': deepcopy(r3_plan_ref), 'source_corpus_ref': deepcopy(corpus_ref),
             'correction_refs': deepcopy(list(correction_refs)), 'discrepancy_refs': deepcopy(list(discrepancy_refs)),
             'articles': rows, 'counts': counts,
             'source_policy': 'R2 exclusions: original title/abstract only; other articles: verified available full text and supplements, else abstract only.',
             'context_policy': 'GPT records and earlier reviews are not original evidence. Priority flags are review hints, not confirmed errors.'}
    value['inventory_sha256'] = _sha(value)
    return value


def _inventory_check(inventory):
    if inventory.get('schema') != SCHEMA or inventory.get('inventory_sha256') != _sha({
            k: v for k, v in inventory.items() if k != 'inventory_sha256'}):
        raise ValueError('Frozen complementary inventory differs from its hash')
    scope = inventory['authorized_scope_pmids']
    if len(scope) != SCOPE_SIZE or len(set(scope)) != SCOPE_SIZE:
        raise ValueError('Frozen complementary scope must contain 2538 unique PMIDs')


def build_packet(root, inventory, pmid):
    """Replay one article's exact original sources and accepted baseline records."""
    root = Path(root).resolve(); pmid = str(pmid)
    _inventory_check(inventory)
    if pmid not in inventory['authorized_scope_pmids']:
        raise ValueError('Article is outside the authorized complementary cohort')
    row = next(r for r in inventory['articles'] if r['pmid'] == pmid)
    if row['packet_status'] != 'ready' or pmid in MANUAL_NO_ABSTRACT:
        raise ValueError('Article is held: ' + (row.get('reason') or 'manual source disposition'))
    documents = []; targets = []; original_sources = []
    for target in row['target_refs']:
        artifact = verified_json(root, target['artifact_ref'])
        record = artifact['validated']['record']
        source = verified_json(root, target['source_ref'])
        if (_sha(record) != target['record_sha256'] or _sha(source) != target['source_sha256']
                or record.get('source_sha256') != _sha(source)
                or record.get('pmid') != pmid or source.get('pmid') != pmid
                or source.get('stage') != target['stage'] or artifact.get('task_id') != target['task_id']
                or artifact.get('source_ref') != target['source_ref']):
            raise ValueError('Review target or original source binding changed')
        spans = catalog_for(source)['spans']
        documents.append({'stage': target['stage'], 'role': 'original_abstract' if target['stage'] == 'R2' else 'original_full_text',
                          'source_sha256': _sha(source), 'source_ref': deepcopy(target['source_ref']),
                          'span_ids': [s['span_id'] for s in spans]})
        original_sources.append(source)
        targets.append({**deepcopy(target), 'record': deepcopy(record),
                        'source_span_ids': [s['span_id'] for s in spans]})
    if row['review_mode'] == 'full_text':
        checked = verify_entry(root, row['fulltext_entry'])
        source = checked['source']
        if not any(_sha(s) == _sha(source) for s in original_sources):
            original_sources.append(source)
            documents.append({'stage': 'R3', 'role': 'original_full_text', 'source_sha256': _sha(source),
                              'source_ref': deepcopy(row['fulltext_entry']['source_ref']),
                              'span_ids': [s['span_id'] for s in catalog_for(source)['spans']]})
    elif any(s['stage'] != 'R2' for s in original_sources):
        raise ValueError('Abstract-only audit cannot receive full text')
    blocks = {}; spans = {}; limitations = []
    for original in original_sources:
        limitations.extend(original.get('limitations', []))
        for block in original['blocks']:
            key = (block['source_id'], block['block_id'])
            if key in blocks and blocks[key] != block:
                raise ValueError('Original sources have conflicting block identities')
            blocks[key] = deepcopy(block)
        for span in catalog_for(original)['spans']:
            if span['span_id'] in spans and spans[span['span_id']] != span:
                raise ValueError('Original sources have conflicting span identities')
            spans[span['span_id']] = deepcopy(span)
    if len({s['report_id'] for s in original_sources}) != 1:
        raise ValueError('Original sources describe different reports')
    source = {'pmid': pmid, 'report_id': original_sources[0]['report_id'],
              'stage': 'R3' if row['review_mode'] == 'full_text' else 'R2',
              'source_kind': 'verified_originals_for_complementary_review',
              'main_full_text_verified': row['review_mode'] == 'full_text',
              'blocks': list(blocks.values()), 'limitations': limitations}
    source_sha = _sha(source)
    packet = {'schema': SCHEMA, 'pmid': pmid, 'review_mode': row['review_mode'],
              'inventory_sha256': inventory['inventory_sha256'], 'priority': deepcopy(row['priority']),
              'source': source, 'source_sha256': source_sha,
              'source_catalog': {'source_sha256': source_sha, 'spans': list(spans.values())},
              'source_documents': documents, 'targets': targets,
              'source_refs': [deepcopy(d['source_ref']) for d in documents],
              'context': {'authority': 'review_context_not_original_evidence',
                          'source_corrections': deepcopy(row['source_corrections']),
                          'discrepancy_hints': deepcopy(row['discrepancy_context'])},
              'full_text_after_overturn_only': row['current_decisions'].get('R2') == 'exclude'}
    # Context inputs must still match the manifest even though they are not evidence.
    for context in packet['context']['source_corrections'] + packet['context']['discrepancy_hints']:
        _checked_bytes(root, context['context_ref'])
    packet['packet_sha256'] = _sha(packet)
    return packet


def prepare_inventory(root, output_dir=DEFAULT_DIRECTORY, *, publication_ref=None,
                      r2_plan_ref=None, r3_plan_ref=None, correction_refs=None, discrepancy_refs=None):
    """Save only the new derived manifest, preserving every original artifact."""
    root = Path(root).resolve()
    publication_ref = publication_ref or reference(root, DEFAULT_PUBLICATION)
    r2_plan_ref = r2_plan_ref or json.loads(owned(root, DEFAULT_R2_PLAN).read_bytes())
    r3_plan_ref = r3_plan_ref or json.loads(owned(root, DEFAULT_R3_PLAN).read_bytes())
    if correction_refs is None:
        correction_refs = [reference(root, path) for path in DEFAULT_CORRECTIONS if owned(root, path).exists()]
    if discrepancy_refs is None:
        discrepancy_refs = [reference(root, path) for path in DEFAULT_DISCREPANCIES if owned(root, path).exists()]
    inventory = build_inventory(root, publication_ref, r2_plan_ref, r3_plan_ref, correction_refs, discrepancy_refs)
    path = owned(root, Path(output_dir) / 'inventories' / (inventory['inventory_sha256'] + '.json'))
    if path.exists():
        if json.loads(path.read_bytes()) != inventory:
            raise ValueError('Immutable complementary inventory already differs')
    else:
        atomic_json(path, inventory)
    return {'inventory_ref': reference(root, path), 'counts': inventory['counts']}
