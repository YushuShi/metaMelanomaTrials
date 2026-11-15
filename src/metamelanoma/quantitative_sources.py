"""Prepare immutable compact-R3 sources from checked local originals only.

This module never retrieves documents, dispatches requests, or imports old
clinical extractions. Historical source indexes supply only checked source text
and document provenance. Every source is bound to the current compact R2 result.
"""
from copy import deepcopy
import json
from pathlib import Path
import sqlite3

from .io import atomic_json, canonical, digest, owned, reference, verified_json, producer_reference
from .sources import _read_ref, document_from_jats
from .pmc_html import document_from_pmc_html
from .screening import build_source, catalog_for
from . import linked_sources


LEGACY_REGISTRY = 'data/reviews/v2/r3_source_index_successor_v1/APPROVED_source_index_registry_v1.json'
READY = {'hash_and_identity_verified_main', 'hash_and_identity_verified_legacy_cached_main'}


def immutable(root, folder, value):
    path = owned(root, Path(folder) / (digest(canonical(value)) + '.json'))
    if path.exists():
        if json.loads(path.read_bytes()) != value:
            raise ValueError('Immutable source artifact differs')
    else:
        atomic_json(path, value)
    return reference(root, path)


def compact_r2(root, candidate):
    artifact = verified_json(root, candidate['R2_artifact_ref'])
    validation = artifact['validated']
    record = validation['record']
    if (not validation.get('valid') or validation.get('global_errors')
            or record['stage'] != 'R2' or record['pmid'] != candidate['pmid']
            or record['report_id'] != candidate['report_id']
            or record['decision']['status'] not in {'retain', 'unclear'}
            or record['decision']['status'] != candidate['R2_decision']
            or record['source_sha256'] != candidate['R2_source_sha256']
            or artifact['task_id'] != candidate['R2_task_id']):
        raise ValueError('Current compact R2 result does not authorize this R3 source')
    source = verified_json(root, artifact['source_ref'])
    if digest(canonical(source)) != record['source_sha256']:
        raise ValueError('R2 source binding differs')
    return record, source


def main_document(root, citation, raw_ref, identity_hint=None):
    raw = _read_ref(root, raw_ref)
    # HTML parsing checks exact primary PMID, DOI, title, canonical PMC identity
    # and complete main body. The hint supplies only an already bound PMCID.
    if b'<!doctype html' in raw[:200].lower() or b'<html' in raw[:200].lower():
        c = dict(citation)
        pmcids = (identity_hint or {}).get('persistent_identifiers', {}).get('pmcid', [])
        if not c.get('pmcid') and len(pmcids) == 1:
            c['pmcid'] = pmcids[0]
        return document_from_pmc_html(raw, c, raw_ref, xml_identity=identity_hint)
    return document_from_jats(raw, citation, raw_ref)


def _main_refs(row):
    refs = [{'path': d['source_path'], 'sha256': d['sha256']}
            for d in row.get('documents', [])
            if d.get('document_role') == 'main_article' and d.get('identity_verified')]
    if row.get('main_article_source'):
        refs.append({k: row['main_article_source'][k] for k in ('path', 'sha256', 'bytes')
                     if k in row['main_article_source']})
    return refs


def supplements(root, citation, legacy_row, index_ref):
    """Reuse approved literal attachments, preserving planned-only markings.

    Pending image review is a visible coverage limitation. Unchecked image
    transcriptions and unlinked attachments are not silently promoted.
    """
    if not legacy_row:
        return [], [], []
    blocks, documents, gaps = [], [], []
    relation_main_refs = _main_refs(legacy_row)
    attachment_rows = [d for d in legacy_row.get('documents', [])
                       if d.get('document_role') != 'main_article']
    if not attachment_rows:
        return blocks, documents, gaps
    # Association is to this primary article, not simply a matching filename.
    for ref in relation_main_refs:
        main_document(root, citation, ref, legacy_row.get('identity'))
    for document in attachment_rows:
        source_id = document.get('source_id')
        selected = [deepcopy(b) for b in legacy_row.get('blocks', [])
                    if b.get('source_id') == source_id and b.get('text')]
        if not document.get('identity_verified_by_explicit_attachment_relation'):
            gaps.append({'source_id': source_id, 'reason': 'No explicit verified attachment relation in the approved index; source text remains outside this corpus.'})
            continue
        if not relation_main_refs or not selected:
            gaps.append({'source_id': source_id, 'reason': 'Attachment has no complete linked main proof or no available literal text blocks.'})
            continue
        ref = {'path': document['source_path'], 'sha256': document['sha256']}
        try:
            raw = _read_ref(root, ref)
        except (OSError, ValueError) as exc:
            gaps.append({'source_id': source_id, 'reason': 'Attachment integrity check failed: ' + str(exc)})
            continue
        for block in selected:
            block.setdefault('is_target', True)
        proof = {'document_role': document['document_role'], 'source_id': source_id,
                 'raw_ref': {**ref, 'bytes': len(raw)},
                 'source_index_ref': index_ref,
                 'source_row_sha256': digest(canonical(legacy_row)),
                 'attachment_metadata': deepcopy(document),
                 'relation_main_refs': relation_main_refs,
                 'blocks_sha256': digest(canonical(selected))}
        documents.append(proof)
        blocks.extend(selected)
        review = document.get('visual_review', {})
        if review.get('complete_document_visual_review') is False:
            gaps.append({'source_id': source_id, 'reason': 'Available literal text included; complete visual/image review is not certified.'})
    return blocks, documents, gaps


def verify_entry(root, entry):
    """Read-only replay of source/R2/proof/raw-file and attachment bindings."""
    root = Path(root).resolve()
    source = verified_json(root, entry['source_ref'])
    proof = verified_json(root, entry['source_proof_ref'])
    if (proof['source_ref'] != entry['source_ref'] or proof['pmid'] != entry['pmid']
            or proof['report_id'] != entry['report_id'] or proof['R2_artifact_ref'] != entry['R2_artifact_ref']
            or proof['citation_sha256'] != digest(canonical(entry['citation']))
            or source['pmid'] != entry['pmid'] or source['report_id'] != entry['report_id']
            or source['stage'] != 'R3' or not source.get('main_full_text_verified')):
        raise ValueError('Corpus entry source identity differs')
    route = verified_json(root, proof['routing_ref'])
    candidates = [r for r in route['candidates'] if r['pmid'] == entry['pmid']]
    if candidates != [proof['R2_candidate']]:
        raise ValueError('Corpus entry does not match its source-bound R2 routing')
    upstream, _ = compact_r2(root, proof['R2_candidate'])
    if source['upstream_R2'] != upstream:
        raise ValueError('Corpus source has stale or foreign upstream R2')
    parsed = main_document(root, entry['citation'], proof['main_raw_ref'], proof['main_identity'])
    expected = deepcopy(parsed['blocks'])
    indexes, checked_relations = {}, set()
    for doc in proof.get('supplement_documents', []):
        _read_ref(root, doc['raw_ref'])
        index_key = canonical(doc['source_index_ref'])
        if index_key not in indexes:
            raw_index = _read_ref(root, doc['source_index_ref'])
            indexes[index_key] = [row for row in map(json.loads, raw_index.decode().splitlines())
                                  if row.get('report_id') == entry['report_id']]
        rows = indexes[index_key]
        if len(rows) != 1 or digest(canonical(rows[0])) != doc['source_row_sha256']:
            raise ValueError('Supplement belongs to a different approved source row')
        row = rows[0]
        if doc['attachment_metadata'] not in row.get('documents', []) or not doc['attachment_metadata'].get('identity_verified_by_explicit_attachment_relation'):
            raise ValueError('Supplement association is not verified')
        for ref in doc['relation_main_refs']:
            key = canonical(ref)
            if key not in checked_relations:
                main_document(root, entry['citation'], ref, row.get('identity'))
                checked_relations.add(key)
        selected = [deepcopy(b) for b in row.get('blocks', []) if b.get('source_id') == doc['source_id'] and b.get('text')]
        for block in selected:
            block.setdefault('is_target', True)
        if digest(canonical(selected)) != doc['blocks_sha256']:
            raise ValueError('Supplement source blocks differ')
        expected.extend(selected)
    for doc in proof.get('linked_supplement_documents', []):
        proposal = verified_json(root, doc['proposal_ref'])
        literal = linked_sources.verify(root, proposal, parsed)
        selected = [{**block, 'is_target': True} for block in literal]
        if digest(canonical(selected)) != doc['blocks_sha256']:
            raise ValueError('Linked supplement literal source blocks differ')
        expected.extend(selected)
    if expected != source['blocks']:
        raise ValueError('Source does not preserve the complete checked main/attachment blocks')
    catalog_for(source)  # Reject duplicate source/block identities.
    return {'citation': deepcopy(entry['citation']), 'blocks': deepcopy(source['blocks']),
            'limitations': deepcopy(source['limitations']), 'source': source, 'proof': proof}


def prepare(root, routing_ref, readiness_ref, destination='data/r3/quantitative_20261108'):
    root = Path(root).resolve()
    route = verified_json(root, routing_ref)
    readiness = verified_json(root, readiness_ref)
    if readiness['routing_ref'] != routing_ref:
        raise ValueError('Readiness audit does not match current R2 routing')
    allowed = {r['pmid']: r for r in route['candidates']}
    audit = {r['pmid']: r for r in readiness['articles']}
    if set(audit) != set(allowed):
        raise ValueError('Readiness cohort differs from R2 routing')
    registry_ref = reference(root, LEGACY_REGISTRY)
    index_ref = verified_json(root, registry_ref)['index']
    index = {r['report_id']: r for r in map(json.loads, _read_ref(root, index_ref).decode().splitlines())}
    db = sqlite3.connect('file:' + str(root / 'data/current/articles.sqlite3') + '?mode=ro', uri=True)
    db.execute('BEGIN')
    citations = {p: json.loads(c) for p, c in db.execute('SELECT pmid,citation_json FROM articles')}
    mains = {p: (s, json.loads(s)) for p, s in db.execute("SELECT pmid,source_json FROM sources WHERE kind='main' AND verified=1 ORDER BY id")}
    linked = {}
    for pmid, text in db.execute("SELECT pmid,source_json FROM sources WHERE kind='linked_supplement_context' AND verified=1 ORDER BY id"):
        linked.setdefault(pmid, []).append(json.loads(text))
    db.rollback(); db.close()
    producer_refs = [producer_reference(root, 'src/metamelanoma/' + name) for name in
                     ('quantitative_sources.py', 'sources.py', 'pmc_html.py', 'screening.py', 'linked_sources.py', 'io.py')]
    entries, held = [], []
    for candidate in route['candidates']:
        pmid = candidate['pmid']; observed = audit[pmid]
        if observed['status'] not in READY:
            held.append({'pmid': pmid, 'reason': observed['status']})
            continue
        citation = deepcopy(citations[pmid])
        record, old_source = compact_r2(root, candidate)
        for block in old_source['blocks']:
            if block['block_id'] in {'title', 'abstract'}:
                citation[block['block_id']] = block['text']
        if observed['status'] == 'hash_and_identity_verified_main':
            original, saved = mains[pmid]
            if digest(original.encode()) != observed['registry_source_json_sha256']:
                raise ValueError('Registry main metadata changed since readiness review')
            raw_ref = observed['raw_ref']; identity_hint = saved['identity']
        else:
            checked = [c for c in observed['legacy_raw_checks'] if c.get('identity_and_body_reverified')]
            if not checked:
                raise ValueError('Missing verified legacy main')
            raw_ref = checked[0]['raw_ref']; identity_hint = index[candidate['report_id']].get('identity')
        main = main_document(root, citation, raw_ref, identity_hint)
        extra, attachments, gaps = supplements(root, citation, index.get(candidate['report_id']), index_ref)
        linked_documents = []
        for saved in linked.get(pmid, []):
            proposal = verified_json(root, saved['proposal_ref'])
            literal = linked_sources.verify(root, proposal, main)
            # Earlier runs used this exact attachment as non-target context.
            # This new R3 pass may extract from its verified literal text.
            selected = [{**block, 'is_target': True} for block in literal]
            linked_documents.append({'proposal_ref': saved['proposal_ref'],
                'raw_ref': proposal['raw_ref'], 'blocks_sha256': digest(canonical(selected)),
                'target_policy': 'Verified original supplement is target evidence in this new R3 extraction; original context-only artifact remains unchanged.'})
            extra.extend(selected)
        limitations = list(main.get('limitations', []))
        limitations.extend(g['reason'] for g in gaps)
        source = build_source(citation, 'R3', [*main['blocks'], *extra], fulltext_verified=True,
                              upstream_R2=record, limitations=limitations)
        catalog_for(source)
        source_ref = immutable(root, Path(destination) / 'sources' / pmid, source)
        proof = {'schema_version': 1, 'pmid': pmid, 'report_id': candidate['report_id'],
                 'citation_sha256': digest(canonical(citation)),
                 'R2_artifact_ref': candidate['R2_artifact_ref'], 'R2_candidate': candidate,
                 'routing_ref': routing_ref, 'readiness_ref': readiness_ref,
                 'main_raw_ref': raw_ref, 'main_identity': main['identity'],
                 'main_body_verified': True, 'main_article_complete': True,
                 'main_article_text_complete': True, 'supplement_documents': attachments,
                 'linked_supplement_documents': linked_documents,
                 'coverage_gaps': gaps, 'whole_source_coverage_complete': False,
                 'source_report_coverage_complete': False,
                 'coverage_definition': 'Complete checked main article text and available verified literal attachment text. Figure/image interpretation and universal supplement completeness are not certified.',
                 'source_ref': source_ref, 'producer_refs': producer_refs}
        proof_ref = immutable(root, Path(destination) / 'proofs' / pmid, proof)
        entry = {'pmid': pmid, 'report_id': candidate['report_id'], 'citation': citation,
                 'R2_artifact_ref': candidate['R2_artifact_ref'], 'source_ref': source_ref,
                 'source_proof_ref': proof_ref,
                 'counts': {'blocks': len(source['blocks']), 'main_blocks': len(main['blocks']),
                            'supplement_blocks': len(extra), 'supplement_documents': len(attachments) + len(linked_documents),
                            'text_characters': sum(len(b['text']) for b in source['blocks']),
                            'text_utf8_bytes': sum(len(b['text'].encode()) for b in source['blocks'])}}
        entries.append(entry)
    manifest = {'schema_version': 1, 'phase_id': 'melanoma-quantitative-r3-20261108',
                'source_kind': 'complete_checked_local_main_and_available_verified_attachments',
                'routing_ref': routing_ref, 'readiness_ref': readiness_ref,
                'legacy_source_index_ref': index_ref, 'legacy_source_registry_ref': registry_ref,
                'producer_refs': producer_refs, 'articles': entries, 'held_articles': held,
                'article_count': len(entries), 'authorized_R2_candidates': len(allowed),
                'R3_dispatch_enabled': False, 'network_requests': 0}
    content_ref = immutable(root, Path(destination) / 'manifests', manifest)
    path = owned(root, Path(destination) / 'source_corpus.json')
    if path.exists():
        immutable(root, Path(destination) / 'manifests', json.loads(path.read_bytes()))
    atomic_json(path, manifest)
    return {'manifest_ref': reference(root, path), 'content_addressed_manifest_ref': content_ref,
            'article_count': len(entries), 'held_articles': len(held),
            'supplement_documents': sum(e['counts']['supplement_documents'] for e in entries)}
