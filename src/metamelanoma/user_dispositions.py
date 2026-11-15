"""Explicit user-confirmed source exclusions, separate from model history."""
from copy import deepcopy
import json
from pathlib import Path
import sqlite3

from . import quantitative, screening
from .io import atomic_json, canonical, digest, now, owned, reference, verified_json

MANIFEST = 'data/current/r2_user_exclusions.json'
ORIGIN = 'user_confirmed_source_availability'
REASON = 'Abstract unavailable; confirmed by the user after manual checking.'


def scope_hash(payload):
    return digest(canonical(sorted(payload['authorized_scope_pmids'])))


def immutable(root, value):
    path = owned(root, 'data/current/user_dispositions/R2/' + digest(canonical(value)) + '.json')
    if path.exists():
        if json.loads(path.read_text()) != value:
            raise ValueError('Existing user-disposition artifact differs')
    else:
        atomic_json(path, value)
    return reference(root, path)


def make_record(source):
    record = quantitative.empty_record(source)
    record['decision'] = {'status': 'exclude', 'reason_code': 'scientific_abstract_unavailable',
        'reason': REASON, 'evidence': []}
    return record


def register_absence(root, pmids, statement):
    """Record the user's actual verification; never claim an API/source check."""
    root = Path(root).resolve()
    payload = json.loads(owned(root, 'website/dist/data/quantitative_extraction.json').read_text())
    pmids = list(map(str, pmids))
    if not pmids or len(set(pmids)) != len(pmids) or not isinstance(statement, str) or not statement.strip():
        raise ValueError('Unique PMIDs and the explicit user verification are required')
    # A completed R3 run keeps its exact original R2 evidence immutable.
    baseline_ref = payload['fulltext_assessment']['R2_publication_ref']
    baseline = verified_json(root, baseline_ref)
    holds = {h['pmid']: h for h in baseline['source_availability_holds']}
    if not set(pmids) <= set(holds) or not set(pmids) <= set(payload['authorized_scope_pmids']):
        raise ValueError('Only original held articles in this authorized cohort may be resolved')
    path = owned(root, MANIFEST)
    if path.exists():
        prior = json.loads(path.read_text())
        confirmation = verified_json(root, prior['confirmation_ref'])
        if confirmation['pmids'] == pmids and confirmation['user_statement'] == statement:
            apply(root, payload)  # Verify the existing resolution before reusing it.
            return reference(root, path)
        raise ValueError('Existing user dispositions require an explicit new adjudication')
    database = owned(root, 'data/current/articles.sqlite3')
    db = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
    try:
        citations = []
        for pmid in pmids:
            row = db.execute('SELECT citation_json FROM articles WHERE pmid=?', (pmid,)).fetchone()
            if not row:
                raise ValueError('Citation is missing: ' + pmid)
            citation = json.loads(row[0])
            if str(citation.get('abstract') or '').strip():
                raise ValueError('An available abstract cannot become an absence disposition')
            citations.append(citation)
    finally:
        db.close()
    confirmation = {'record_kind': ORIGIN, 'stage': 'R2', 'pmids': pmids,
        'user_statement': statement, 'recorded_at': now(), 'confirmed_by': 'user',
        'original_R2_publication_ref': baseline_ref, 'authorized_scope_sha256': scope_hash(payload),
        'policy': 'Exclude articles with user-confirmed unavailable abstracts from R2 and R3.',
        'model': None, 'model_requests': 0, 'automated_availability_check_claimed': False}
    confirmation_ref = immutable(root, confirmation)
    entries = []
    for citation in citations:
        source = screening.build_source(citation, 'R2')
        source['user_confirmation_ref'] = confirmation_ref
        source_ref = immutable(root, source)
        entry = {'pmid': str(citation['pmid']), 'citation': citation, 'stage': 'R2',
            'original_hold': holds[str(citation['pmid'])], 'confirmation_ref': confirmation_ref,
            'source_ref': source_ref, 'record': make_record(source),
            'review_origin': ORIGIN, 'model': None, 'model_requests': 0}
        entries.append(immutable(root, entry))
    manifest = {'schema_version': 1, 'authorized_scope_sha256': scope_hash(payload),
        'confirmation_ref': confirmation_ref, 'entry_refs': entries}
    # Validate before installing the durable publication overlay.
    apply(root, payload, manifest=manifest)
    atomic_json(path, manifest)
    return reference(root, path)


def apply(root, payload, *, manifest=None):
    """Idempotently resolve held articles without changing any existing review."""
    root = Path(root).resolve(); path = root / MANIFEST
    if manifest is None:
        if not path.exists():
            return payload
        manifest = json.loads(path.read_text())
    if manifest.get('authorized_scope_sha256') != scope_hash(payload):
        return payload  # A pilot or unrelated cohort is not this adjudication.
    confirmation = verified_json(root, manifest['confirmation_ref'])
    if (manifest.get('schema_version') != 1 or confirmation.get('record_kind') != ORIGIN
            or confirmation.get('confirmed_by') != 'user' or not confirmation.get('user_statement')
            or confirmation.get('authorized_scope_sha256') != scope_hash(payload)
            or confirmation.get('stage') != 'R2' or confirmation.get('model') is not None
            or confirmation.get('model_requests') != 0):
        raise ValueError('Explicit user-confirmed R2 source absence is required')
    baseline = verified_json(root, confirmation['original_R2_publication_ref'])
    original_holds = {h['pmid']: h for h in baseline['source_availability_holds']}
    out = deepcopy(payload)
    existing = {a['pmid']: a for a in out['articles']}
    clinical = {a['pmid']: a for a in out['clinical_evidence']['articles']}
    applied = out.get('user_R2_dispositions', {}).get('entry_refs', [])
    entries = [verified_json(root, ref) for ref in manifest['entry_refs']]
    if [e['pmid'] for e in entries] != confirmation['pmids']:
        raise ValueError('User-confirmed PMID scope differs')
    changed = False
    from .quantitative_export import project_article
    for entry, entry_ref in zip(entries, manifest['entry_refs']):
        pmid = entry['pmid']; citation = entry['citation']
        source = screening.build_source(citation, 'R2')
        source['user_confirmation_ref'] = manifest['confirmation_ref']
        record = make_record(source)
        if (str(citation['pmid']) != pmid or str(citation.get('abstract') or '').strip()
                or pmid not in payload['authorized_scope_pmids']
                or entry['original_hold'] != original_holds.get(pmid)
                or entry.get('review_origin') != ORIGIN or entry.get('stage') != 'R2'
                or entry.get('model') is not None or entry.get('model_requests') != 0
                or entry.get('confirmation_ref') != manifest['confirmation_ref']
                or verified_json(root, entry['source_ref']) != source or entry['record'] != record):
            raise ValueError('User disposition cannot alter clinical evidence or model history')
        task_id = 'user-r2-' + entry_ref['sha256'][:32]
        compact = {'pmid': pmid, 'records': [{'stage': 'R2', 'task_id': task_id,
            'review_origin': ORIGIN, 'model': None, 'model_requests': 0,
            'user_confirmation_ref': manifest['confirmation_ref'], 'artifact_ref': entry_ref,
            'record': record, 'issues': []}]}
        if pmid in existing:
            if existing[pmid] != compact or entry_ref not in applied:
                raise ValueError('Cannot replace an existing R2 decision with source absence')
            displayed = clinical.get(pmid, {})
            if (displayed.get('current_screening_status') != 'exclude'
                    or displayed.get('current_main_eligible') is not False
                    or any(displayed.get(k) for k in ('quantitative_results', 'sample_size_records', 'comparisons'))
                    or pmid not in out['scope_pmids']
                    or any(h['pmid'] == pmid for h in out['source_availability_holds'])):
                raise ValueError('Published user exclusion has inconsistent clinical scope')
            continue
        if not any(h['pmid'] == pmid for h in out['source_availability_holds']):
            raise ValueError('A current unresolved source hold is required')
        article, evidence = project_article(citation, {'task_id': task_id, 'source': source,
            'validation': {'valid': True, 'global_errors': [], 'issues': [], 'record': record,
                           'validation_kind': ORIGIN}})
        article['review_origin'] = ORIGIN
        out['articles'].append(compact); out['scope_pmids'].append(pmid)
        out['clinical_evidence']['articles'].append(article)
        out['clinical_evidence']['evidence_registry'].update(evidence)
        out['source_availability_holds'] = [h for h in out['source_availability_holds'] if h['pmid'] != pmid]
        for key in ('entered', 'screening_finished', 'excluded'):
            out['about_progress']['stages']['R2'][key] += 1
        changed = True
    out['user_R2_dispositions'] = deepcopy(manifest)
    if changed:
        timestamp = now(); out['as_of'] = out['about_progress']['as_of'] = timestamp
        out['clinical_evidence']['as_of'] = timestamp
        if not out['source_availability_holds'] and not out.get('pending_reports'):
            out['scope_kind'] = 'complete_r2_cohort'
        out['clinical_evidence']['content_sha256'] = digest(canonical({k: out['clinical_evidence'][k]
            for k in ('articles', 'evidence_registry')}))
    return out


def check_preserved(previous, incoming):
    before = previous.get('user_R2_dispositions', {})
    after = incoming.get('user_R2_dispositions', {})
    if before and (before.get('confirmation_ref') != after.get('confirmation_ref') or
                   any(ref not in after.get('entry_refs', []) for ref in before.get('entry_refs', []))):
        raise ValueError('Publication cannot discard confirmed user exclusions')
