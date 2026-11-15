"""Finite offline PMID31580492 arm-link review; never writes the Registry."""
from copy import deepcopy
import argparse
import json
from pathlib import Path

from . import schema, screening, sources, validation
from .io import atomic_json, canonical, digest, evidence_path, owned, reference, verified_json

PMID = '31580492'
REPORT = 'report-d355bfb012497c165b7774cb'
TASK = 'r3-c30935052c0afb785ed282db9aa9'
BASE = 'data/proposed_changes/regimen_link_repair_31580492'
NATIVE = {'path':'data/reviews/current/31580492/R3/'+TASK+'/7c1fabf53bf766811cb3934d234630408bd52ab6ea82b36ee6d981cf1067d28f.json',
          'sha256':'fd774a7f40a590d16354521dd25d971635f140c7cdd26998160230df6612934e','bytes':201275}
PREFETCH = {'path':'data/sources/prefetch/31580492/7e790673219c7e97841fc0e27ddc78d610fe947da3b96c176bba247158d7ccc6.json',
            'sha256':'c9c66a92b3022fdf217d36f242f9121d038ee5dd978180818154be77cdbfd615','bytes':40788}
# These are exact existing native evidence passages. No evidence ID is remapped.
RECIPES = {
    'F7':('E6','b00016','Response rates (RR) were 45% for combination therapy and 36% for anti-PD-1 monotherapy;', 'arm_specific_descriptive_response'),
    'F9':('E6','b00016','median PFS was 248 and 169 days for combination and anti-PD-1 monotherapy', 'arm_specific_descriptive_survival'),
    'F11':('E6','b00016','median OS was 1249 and 683 days for combination and anti-PD-1 monotherapy, respectively', 'arm_specific_descriptive_survival'),
    'F14':('E7','b00017','toxicities of grade 3 or higher (n=27, 30% vs n=20, 8%, P<0.001)', 'arm_specific_safety_value_in_reported_group_comparison'),
    'F17':('E9','b00019','Requirement for intensive care unit stays was low in both groups but seemed more common in combination treated patients (n=4, 5% vs. n=3, 1%, p=0.053).', 'arm_specific_safety_value_in_reported_group_comparison'),
    'F19':('E10','b00020','rates of hospitalization (n=41, 47% vs n=108, 42%, p=0.472)', 'arm_specific_healthcare_value_in_reported_group_comparison'),
    'F21':('E10','b00020','multiple hospitalizations (n=16, 18% vs n=37, 14%, p=0.403)', 'arm_specific_healthcare_value_in_reported_group_comparison'),
    'F23':('E10','b00020','duration of hospitalization (mean 3.97 vs 3.68 days, p=0.747)', 'arm_specific_healthcare_value_in_reported_group_comparison'),
}
REMAIN_HELD = {'F1','F4','F12','F22','F24'}
PRODUCERS = ['src/metamelanoma/'+name+'.py' for name in
             ('regimen_repairs','io','schema','normalization','validation','regimen_validation','screening','sources')]


def repair_links(payload):
    """Change only the eight exact reference links; this alone is not a review."""
    if (payload.get('pmid'),payload.get('report_id'),payload.get('stage')) != (PMID,REPORT,'R3'):
        raise ValueError('This review is finite to the original PMID31580492 R3 payload')
    candidate = deepcopy(payload)
    facts = {f['fact_id']:f for f in candidate['facts']}
    if len(facts) != len(candidate['facts']) or not set(RECIPES).issubset(facts):
        raise ValueError('Unique exact eight native fact IDs required')
    for fid in RECIPES:
        fact = facts[fid]
        if (fact['arm_id'],fact['experimental_arm_id'],fact['comparator_arm_id'],fact['contrast_type']) != ('A2','A1','A1','treatment_comparison'):
            raise ValueError('Original held monotherapy link pattern changed')
        fact['comparator_arm_id'] = 'A2'
    return candidate


def verify_candidate(original, candidate):
    if candidate != repair_links(original):
        raise ValueError('Only the eight reviewed comparator links may change')


def _load(root, ref):
    if (set(ref) != {'path','sha256','bytes'} or type(ref['bytes']) is not int
            or ref['bytes'] < 0 or not isinstance(ref['path'],str)):
        raise ValueError('An exact owned reference with integer bytes is required')
    if reference(root, ref['path']) != ref:
        raise ValueError('Bound source, native artifact or producer changed')
    return verified_json(root, ref)


def _anchor(source, evidence, eid, block_id, literal):
    block = next((b for b in source['blocks'] if b['block_id'] == block_id),None)
    ev = next((e for e in evidence if e['evidence_id'] == eid),None)
    if block is None or ev is None:
        raise ValueError('Original owned evidence/source block is missing')
    span = next((s for s in screening.catalog_for(source)['spans'] if s['span_id'] == ev['span_id']),None)
    if span is None:
        raise ValueError('Original owned source span changed')
    if (ev['source_id'],ev['block_id'],ev['quote'],ev['is_target']) != (block['source_id'],block_id,block['text'],True):
        raise ValueError('Original evidence must own this exact target source passage')
    if span['text'] != block['text'] or block['text'].count(literal) != 1:
        raise ValueError('An unambiguous exact literal source passage is required')
    start = block['text'].index(literal)
    return {'evidence_id':eid,'span_id':ev['span_id'],'source_id':block['source_id'],
        'block_id':block_id,'block_sha256':digest(block['text'].encode()),
        'raw_element_sha256':block['raw_element_sha256'],
        'char_start':start,'char_end':start+len(literal),'text':literal}


def prepare(root):
    """Reconstruct the proposal from immutable paid history and primary evidence."""
    root = Path(root).resolve()
    native = _load(root,NATIVE)
    source = _load(root,native['source'])
    prefetch = _load(root,PREFETCH)
    document = prefetch['source_document']
    raw_ref = document['raw_ref']
    if reference(root,raw_ref['path']) != raw_ref:
        raise ValueError('Original primary XML changed')
    raw = evidence_path(root,raw_ref['path']).read_bytes()
    replay = sources.document_from_jats(raw,prefetch['citation'],raw_ref)
    if (source['pmid'],source['report_id'],source['stage']) != (PMID,REPORT,'R3'):
        raise ValueError('Foreign article/source identity')
    if (replay['identity'] != document['identity'] or replay['blocks'] != document['blocks']
            or source['blocks'] != document['blocks'] or document['main_full_text_verified'] is not True):
        raise ValueError('Complete original source and primary identity must replay exactly')
    artifacts = {key:_load(root,ref) for key,ref in native['native_artifacts'].items()}
    request = artifacts['request']; body = request['body']; result = artifacts['result']
    response = artifacts['raw_response']
    if (request['task_id'] != TASK or result['task_id'] != TASK
            or response['status'] != 'completed' or body['model'] != 'gpt-6-luna'
            or response['model'] != body['model'] or body['reasoning']['effort'] != 'high'):
        raise ValueError('Exact completed original Luna/high response required')
    wire = json.loads(body['input'])
    if (wire['source_sha256'] != schema.digest(source)
            or wire['source_span_catalog'] != screening.catalog_for(source)):
        raise ValueError('Recorded request must contain this exact original source/catalog')
    original = native['validation']['original_payload']
    emitted = [part['text'] for output in response['output'] for part in output.get('content',[])
               if part.get('type') == 'output_text']
    if len(emitted) != 1 or json.loads(emitted[0]) != original or result['payload'] != original:
        raise ValueError('Original validation must preserve the exact paid native payload')
    old = validation.validate(original,source,request_schema=body['text']['format']['schema'])
    if old != native['validation']:
        raise ValueError('Original validation no longer replays exactly')
    candidate = repair_links(original)
    verify_candidate(original,candidate)
    revised = validation.validate(candidate,source,request_schema=body['text']['format']['schema'])
    old_facts = {f['fact_id']:f for f in old['validated_facts']}
    new_facts = {f['fact_id']:f for f in revised['validated_facts']}
    held = {r['fact_id'] for r in revised['fact_results'] if r['status'] != 'source_checked'}
    if (not revised['decision_valid'] or revised['global_errors'] or revised['field_coverage_errors']
            or set(new_facts)-set(old_facts) != set(RECIPES) or held != REMAIN_HELD
            or any(new_facts[fid] != fact for fid,fact in old_facts.items())
            or any(revised['validated_'+key] != old['validated_'+key] for key in ('models','entities'))):
        raise ValueError('Exact eight recoveries and complete old accepted graph conservation required')
    old_results = {r['fact_id']:r for r in old['fact_results']}
    if any(r != old_results[r['fact_id']] for r in revised['fact_results'] if r['fact_id'] in REMAIN_HELD):
        raise ValueError('An unrelated held field changed')
    original_facts = {f['fact_id']:f for f in original['facts']}
    candidate_facts = {f['fact_id']:f for f in candidate['facts']}
    repairs = []
    for fid,(eid,block,literal,meaning) in RECIPES.items():
        before = original_facts[fid]; after = candidate_facts[fid]
        if eid not in before['evidence_ids'] or old_results[fid]['errors'] != ['An arm cannot compare with itself']:
            raise ValueError('Only the exact original self-comparison holds are reviewed')
        repairs.append({'fact_id':fid,'original_fact_sha256':schema.digest(before),
            'candidate_fact_sha256':schema.digest(after),'numbers_sha256':schema.digest(before['numbers']),
            'numbers_unchanged':before['numbers']==after['numbers'],
            'original_links':{k:before[k] for k in ('arm_id','experimental_arm_id','comparator_arm_id')},
            'corrected_links':{k:after[k] for k in ('arm_id','experimental_arm_id','comparator_arm_id')},
            'changed_fields':['comparator_arm_id'],'interpretation':meaning,
            'supporting_anchor':_anchor(source,old['evidence'],eid,block,literal)})
    qualified = deepcopy(revised['normalized_payload'])
    qualified.update(facts=deepcopy(revised['validated_facts']),models=deepcopy(revised['validated_models']),
        entities=deepcopy(revised['validated_entities']),evidence=deepcopy(revised['evidence']),
        record_kind='reviewed_nonnative_fact_link_repair',is_native_response=False,
        clinical_verified=False,pooling_eligible=False,whole_source_coverage_complete=False,
        full_R3_extraction_complete=False)
    return {'record_kind':'finite_primary_source_arm_link_repair_proposal','status':'proposed',
        'pmid':PMID,'report_id':REPORT,'stage':'R3','task_id':TASK,
        'is_native_response':False,'new_model_requests':0,'requires_independent_review':True,
        'lineage':{'original_native_view_ref':NATIVE,'original_source_ref':native['source'],
            'original_task_id':TASK,'raw_source_ref':raw_ref,'prefetch_ref':PREFETCH,
            'native_artifacts':deepcopy(native['native_artifacts'])},
        'producer_files':[reference(root,p) for p in PRODUCERS],
        'source':source,'candidate_payload':candidate,'validation':revised,
        'qualified_payload':qualified,'original_native_validation':old,'repairs':repairs,
        'context_anchors':[
            _anchor(source,old['evidence'],'E3','b00010','treated with anti-PD-1 monotherapy (nivolumab or pembrolizumab) or nivolumab combined with ipilimumab'),
            _anchor(source,old['evidence'],'E6','b00016','Among the 344 patients, 256 (74%) were treated with anti-PD-1 monotherapy and 88 (26%) were treated with combination ipilimumab-nivolumab.'),
            _anchor(source,old['evidence'],'E6','b00016','We did not formally compare response rates and survival in these populations.')],
        'unchanged_held_fact_ids':sorted(REMAIN_HELD),
        'conservation':{'original_accepted_facts':len(old_facts),'candidate_accepted_facts':len(new_facts),
            'all_original_accepted_facts_exact':True,'all_original_models_and_entities_exact':True,
            'all_original_number_wrappers_exact':True,'all_original_source_blocks_exact':True},
        'interpretation_limits':[
            'A2 values describe anti-PD-1 monotherapy; A1/A2 retain the original group orientation, not a derived ratio.',
            'The full text explicitly did not formally compare response rates or survival; no HR, RR, CI or causal effect is derived.',
            'Anti-PD-1 monotherapy includes nivolumab or pembrolizumab. This is not a uniform ipilimumab add-on over nivolumab.',
            'This local review changes eight references only; five unrelated holds and native/cost history remain untouched.']}


def verify(root, proposal):
    if proposal != prepare(root):
        raise ValueError('Repair proposal differs from the complete finite source-bound reconstruction')
    return deepcopy(proposal['qualified_payload'])


def write_proposal(root):
    root = Path(root).resolve()
    proposal = prepare(root)
    path = owned(root,BASE+'/'+schema.digest(proposal)+'.json')
    if path.exists():
        if json.loads(path.read_bytes()) != proposal:
            raise ValueError('Immutable proposal path contains different evidence')
    else:
        atomic_json(path,proposal)
    return reference(root,path.relative_to(root))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','verify'])
    parser.add_argument('--root',type=Path,default=Path.cwd())
    parser.add_argument('--proposal')
    args=parser.parse_args()
    if args.action=='prepare':
        print(json.dumps(write_proposal(args.root),sort_keys=True))
    else:
        if not args.proposal:parser.error('verify requires --proposal')
        proposal=verified_json(args.root,reference(args.root,args.proposal))
        result=verify(args.root,proposal)
        print(json.dumps({'status':'verified','pmid':PMID,'accepted_facts':len(result['facts'])},sort_keys=True))


if __name__=='__main__':
    main()
