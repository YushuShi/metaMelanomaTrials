"""Ingest reviewed, source-qualified subsets without changing native history."""
from copy import deepcopy
import json

from . import schema, screening, validation
from .io import canonical, digest, now, producer_reference, verified_json
from .pipeline import aggregate_fragments, immutable_json


def apply_closed_subset(root, registry, task, proposal_ref, review_ref, scope_ref):
    proposal = verified_json(root, proposal_ref)
    verified_json(root, review_ref)
    scope = verified_json(root, scope_ref)
    pmid = str(task['metadata']['pmid'])
    if pmid not in {str(value) for value in scope} or task['stage'] != 'R3':
        raise ValueError('Adjudication is outside the finite unfinished R3 scope')
    lineage = proposal['lineage']
    if (lineage['original_task_id'] != task['task_id']
            or lineage['original_source_ref'] != task['metadata']['source_ref']
            or proposal.get('is_native_response') is not False):
        raise ValueError('Exact original task and explicit derived provenance required')
    original = verified_json(root, lineage['original_source_ref'])
    native_view = verified_json(root, lineage['original_native_view_ref'])
    old = proposal['original_native_validation']
    if native_view['validation'] != old or native_view['source'] != lineage['original_source_ref']:
        raise ValueError('Original validation lineage differs')
    source = proposal['source']
    for key in ('report_id', 'pmid', 'stage', 'upstream_R2', 'main_full_text_verified'):
        if source[key] != original[key]:
            raise ValueError('Derived source changed article identity or upstream decision')
    by_key = {(b['source_id'], b['block_id']): b for b in source['blocks']}
    if len(by_key) != len(source['blocks']):
        raise ValueError('Duplicate derived source units')
    for block in original['blocks']:
        if by_key.get((block['source_id'], block['block_id'])) != block:
            raise ValueError('Original source units or target roles changed')
    original_keys = {(b['source_id'], b['block_id']) for b in original['blocks']}
    document = registry.source(pmid, 'main_full_text')
    # Older imports used another kind; locate the exact verified primary by raw ref.
    documents = [document] if document else []
    documents.extend(json.loads(row[0]) for row in registry.db.execute(
        'SELECT source_json FROM sources WHERE pmid=? AND verified=1', (pmid,)))
    raw_ref = lineage['raw_source_ref']
    documents = [d for d in documents if d and d.get('raw_ref') == raw_ref]
    if not documents:
        raise ValueError('Verified same-article primary source is missing')
    from .io import reference
    if reference(root, raw_ref['path']) != raw_ref:
        raise ValueError('Primary source bytes changed')
    primary = {(b['source_id'], b['block_id']): b for b in documents[0]['blocks']}
    linked_doc = None
    linked_ref = proposal.get('linked_supplement_document_proposal_ref')
    if linked_ref is not None:
        from .linked_sources import verify
        if lineage.get('linked_supplement_document_ref') != linked_ref:
            raise ValueError('Linked supplement lineage differs')
        linked_doc = verified_json(root, linked_ref)
        for block in verify(root, linked_doc, documents[0]):
            key = (block['source_id'], block['block_id'])
            if key in primary:
                raise ValueError('Supplement cannot replace a primary source unit')
            primary[key] = block
    for key, block in by_key.items():
        if key not in original_keys:
            parent = primary.get(key)
            if (block.get('is_target') is not False or parent is None
                    or {k:v for k,v in block.items() if k != 'is_target'}
                    != {k:v for k,v in parent.items() if k != 'is_target'}):
                raise ValueError('Added context must be an exact non-target primary source unit')
    view = validation.validate(proposal['payload'], source,
        request_schema=schema.report_schema(screening.catalog_for(source), source=source))
    if (view != proposal['validation'] or not view['decision_valid'] or view['global_errors']
            or view['field_coverage_errors'] or view['counts']['held_facts']
            or any(r['status'] != 'source_checked' for r in view['model_results'])
            or view['treatment_policy']['status'] == 'held'):
        raise ValueError('The complete derived subset must pass the unchanged validator')
    excluded = proposal['payload']['decision']['status'] == 'exclude'
    previous_graph = {key:deepcopy(old['validated_'+key]) for key in ('facts','models','entities')}
    if excluded and any(previous_graph.values()):
        if (proposal.get('prior_graph_kept_private_for_new_exclusion') is not True
                or proposal.get('previous_accepted_graph') != previous_graph):
            raise ValueError('Excluded canonical graphs require exact private preservation of prior evidence')
    for key in ('facts', 'models', 'entities'):
        if view['validated_'+key] != ([] if excluded else old['validated_'+key]):
            raise ValueError('Previously accepted graph changed or held material was promoted')
    qualified = deepcopy(view['normalized_payload'])
    qualified.update(facts=view['validated_facts'], models=view['validated_models'],
        entities=view['validated_entities'], evidence=view['evidence'],
        record_kind='reviewed_nonnative_source_qualified_subset', is_native_response=False,
        clinical_verified=False, pooling_eligible=False, full_R3_extraction_complete=False,
        whole_source_coverage_complete=False, reviewer_model=task['model'],
        treatment_policy=view['treatment_policy'],
        source_checked_counts={**old['counts'],
            'source_checked_facts':len(view['validated_facts']),
            'numeric_facts_submitted':sum(bool(f.get('numbers')) for f in old['original_payload']['facts']),
            'numeric_facts_accepted':sum(bool(f.get('numbers')) for f in view['validated_facts'])},
        validation_issues={'fact_results':old['fact_results'], 'model_results':old['model_results'],
            'coverage':old['field_coverage_errors']})
    record = {'record_kind':'reviewed_source_subset_ingestion', 'as_of':now(),
        'task_id':task['task_id'], 'pmid':pmid, 'proposal_ref':proposal_ref,
        'independent_review_ref':review_ref, 'finite_scope_ref':scope_ref,
        'producer':producer_reference(root, 'src/metamelanoma/adjudication.py'),
        'source':source, 'validation':view, 'qualified_payload':qualified,
        'previous_accepted_graph':previous_graph,
        'prior_graph_kept_private_for_new_exclusion':excluded,
        'native_history_unchanged':True, 'new_API_requests':0}
    if linked_doc is not None:
        record['linked_supplement_document_ref'] = linked_ref
        record['linked_supplement_verifier'] = producer_reference(root, 'src/metamelanoma/linked_sources.py')
        registry.save_source(pmid, 'linked_supplement_context', {
            **deepcopy(linked_doc), 'record_kind':'verified_identity_bound_linked_supplement_document',
            'proposal_ref':linked_ref, 'verification_producer':record['linked_supplement_verifier']}, verified=True)
    ref = immutable_json(root, 'data/reviews/source_qualified_R3/'+pmid+'/'+digest(canonical(record))+'.json', record)
    status = {'uncertain':'unclear'}.get(qualified['decision']['status'], qualified['decision']['status'])
    registry.save_fragment(task['task_id'], pmid, 'R3', status, qualified['decision']['reason'],
        qualified, ref, revision_reason='Reviewed same-primary source subset; original native history preserved')
    finished = aggregate_fragments(registry, task)
    registry.mark_attempt(task['task_id'], pmid, 'R3', 'source_qualified_reviewed',
        {'artifact':ref, 'article_screening_finished':finished, 'native_history_unchanged':True})
    return {'task_id':task['task_id'], 'pmid':pmid, 'artifact':ref,
        'article_screening_finished':finished, 'accepted_facts':len(view['validated_facts'])}
