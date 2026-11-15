"""Proof-bound finite same-source retries; no accounting constructors or HTTP."""
from datetime import datetime
import json
from . import accounting as a

KIND='finite_Cornell_source_recovery_authority'
EVENT='task_recovery_amend'
PROVIDER='cornell_openai_gateway'
UNKNOWN_RISK='user_approved_unknown_retry'

def identity(task):
    return {'task_id':task['task_id'],'stage':task['stage'],'model':task['model'],
            'body_sha256':a.digest(task['body']),'metadata':task['metadata']}

def _read(root,ref):return json.loads(a.checked_ref(root,ref))

def _explicit_risk_approval(root,auth):
    """No inference from general task authorization or assistant approval."""
    approval=_read(root,auth['explicit_user_risk_approval_ref'])
    ids=sorted(row['task_id']for row in auth['entries'])
    if (approval.get('record_kind')!='explicit_user_unknown_send_duplicate_charge_approval'
            or approval.get('status')!='approved' or approval.get('approving_role')!='user'
            or not isinstance(approval.get('user_message'),str)or not approval['user_message'].strip()
            or approval.get('approved_task_ids')!=ids
            or approval.get('question_ref')!=auth['question_ref']
            or approval.get('possible_original_execution_acknowledged')is not True
            or approval.get('possible_duplicate_Cornell_charges_accepted')is not True
            or approval.get('original_unknown_holds_preserved')is not True
            or approval.get('maximum_additional_attempts_per_task')!=1
            or auth.get('maximum_additional_attempts_per_task')!=1
            or auth.get('execution_max_attempts')!=2
            or approval.get('direct_OpenAI_allowance_unchanged')!='100'):
        raise ValueError('NEW explicit user informed duplicate-charge approval is required')
    a.checked_ref(root,auth['question_ref'])
    approved=datetime.fromisoformat(approval['approved_at'])
    if approved.tzinfo is None or approved>=datetime.fromisoformat(auth['not_after']):raise ValueError('Explicit approval is outside original deadline')
    return approval

def validate_recovery_task(root,task,authority_ref,*,allow_output_cap_variant=False):
    """Validate concrete approved bytes independently of mutable pipeline state."""
    auth=_read(root,authority_ref)
    if (auth.get('record_kind')!=KIND or auth.get('status')!='approved' or auth.get('phase_id')!=a.PHASE_ID
            or auth.get('provider')!=PROVIDER or auth.get('global_max_attempts')!=3):
        raise ValueError('Approved finite Cornell source-recovery authority required')
    parent_config=_read(root,auth['parent_config_ref'])
    if auth['not_after']!=parent_config['not_after_utc']:raise ValueError('Original deadline cannot change')
    end=datetime.fromisoformat(auth['not_after'])
    if end.tzinfo is None:raise ValueError('Timezone-aware original deadline required')
    entries=auth.get('entries')
    if not isinstance(entries,list)or not entries or len({r['task_id']for r in entries})!=len(entries):raise ValueError('Closed unique recovery membership required')
    selected=[r for r in entries if r['task_id']==task['task_id']]
    if len(selected)!=1:raise ValueError('Task is outside finite recovery authority')
    row=selected[0];mode=row['case']
    if mode not in {'output_cap_only','eligibility_repair',UNKNOWN_RISK}:raise ValueError('Unreviewed recovery case')
    if mode==UNKNOWN_RISK:_explicit_risk_approval(root,auth)
    base=_read(root,row['revised_task_ref']);expected='data/current/tasks/'+task['task_id']+'/revisions/'+a.digest(base)+'/task.json'
    if row['revised_task_ref']['path']!=expected or a.checked_ref(root,row['revised_task_ref'])!=a.canonical(base):raise ValueError('Exact immutable same-task recovery revision required')
    if task!=base:
        normalized={**task,'body':{**task['body'],'max_output_tokens':base['body']['max_output_tokens']}}
        if (allow_output_cap_variant is not True or normalized!=base or type(task['body']['max_output_tokens'])is not int
                or not base['body']['max_output_tokens']<task['body']['max_output_tokens']<=base['metadata']['max_output_tokens_ceiling']):
            raise ValueError('Only an already scheduled bounded cap variant may differ from revision')
    a.validate_task(task,wire_ceiling_bytes=a.reviewed_wire_ceiling(task),output_ceiling=a.reviewed_output_ceiling(task))
    parent=_read(root,row['parent_task_ref']);prefix='data/current/tasks/'+task['task_id']+'/'
    if (not row['parent_task_ref']['path'].startswith(prefix) or parent['task_id']!=task['task_id']
            or parent['stage']!=base['stage'] or base['stage']!='R3' or parent['model']!=base['model']):
        raise ValueError('Recovery changes logical task/stage/model')
    if a.digest(identity(parent))!=row['old_identity_sha256']:raise ValueError('Parent identity differs')
    allowed={'finite_recovery','max_output_tokens_ceiling','body_core_sha256','wire_ceiling_bytes','enum_repair'}
    if {k:v for k,v in parent['metadata'].items()if k not in allowed}!={k:v for k,v in base['metadata'].items()if k not in allowed}:
        raise ValueError('Recovery changes original source or article identity metadata')
    if base['metadata'].get('enum_repair')not in (None,parent['metadata'].get('enum_repair')):raise ValueError('Old enum marker can only be retained exactly or removed')
    if row.get('derived_source_ref')is not None:raise ValueError('This finite contract preserves the exact original source')
    source=_read(root,parent['metadata']['source_ref']);newmeta=base['metadata']
    if (str(source['pmid'])!=str(newmeta['pmid'])or source['report_id']!=newmeta['report_id']or source['stage']!='R3'
            or newmeta.get('provider')!=PROVIDER or newmeta.get('phase_id')!=a.PHASE_ID):raise ValueError('Bound source/phase/provider differs')
    scope=_read(root,auth['scope_selector_ref'])
    if not isinstance(scope,list)or str(newmeta['pmid'])not in {str(p)for p in scope}:raise ValueError('Article is outside exact unfinished selector')
    request=_read(root,row['latest_request_ref']);last=request['body']
    if (request.get('task_id')!=task['task_id']or request.get('attempt_id')!=row['latest_attempt_id']
            or request.get('provider')!=PROVIDER or a.digest(last)!=row['latest_request_body_sha256']):raise ValueError('Exact latest sent request required')
    previous=dict(parent['body']);actual=dict(last);oldcap=previous.pop('max_output_tokens');lastcap=actual.pop('max_output_tokens')
    if previous!=actual or not oldcap<=lastcap<=parent['metadata']['max_output_tokens_ceiling']:raise ValueError('Last body is not an approved parent cap variant')
    if newmeta.get('finite_recovery')!={'kind':mode,'parent_body_sha256':a.digest(last)}:raise ValueError('Typed recovery parent binding differs')
    newbody=base['body']
    if a.digest(newbody)==a.digest(last):raise ValueError('A failed response cannot receive an identical scientific replay')
    if newmeta.get('body_core_sha256')!=a.digest({k:v for k,v in newbody.items()if k!='max_output_tokens'}):raise ValueError('New body core digest differs')
    if a.reviewed_wire_ceiling(base)!=row.get('wire_ceiling_bytes',a.reviewed_wire_ceiling(parent)):raise ValueError('Wire authority differs')
    # Target text, catalog and all prior context remain byte-identical here.
    if newbody['input']!=last['input']:raise ValueError('Original sent input/source/catalog must remain byte-identical')
    payload=json.loads(last['input'])
    if payload['source_sha256']!=a.digest(source):raise ValueError('Sent input does not bind original source')
    if mode in {'output_cap_only',UNKNOWN_RISK}:
        left=dict(last);right=dict(newbody);left.pop('max_output_tokens');right.pop('max_output_tokens')
        if (left!=right or lastcap!=32768 or newbody['max_output_tokens']!=65536
                or newmeta['max_output_tokens_ceiling']!=65536):raise ValueError('Only exact32k-to64k output-cap recovery is permitted')
        proof=_read(root,auth['model_capability_ref']);checks={x['path']:x for x in proof['checks']}
        if proof.get('record_kind')!='Cornell_model_output_limit_read_only_check' or proof.get('completion_requests')!=0:raise ValueError('Verified gateway output-cap proof required')
        for path in ('models','model/info'):
            check=checks[path]
            if check['http_status']!=200:raise ValueError('Gateway model capability check failed')
            model=next(x for x in check['models']if x.get('id',x.get('model_name'))==base['model'])
            info=model.get('model_info',model);limit=info.get('max_output_tokens')
            if type(limit)is not int or limit<65536:raise ValueError('Gateway model has not verified64k support')
        if checks['model/info']['models'] and not all(next(x for x in checks['model/info']['models']if x['model_name']==base['model'])['model_info'].get(k)is True for k in ('supports_reasoning','supports_response_schema')):raise ValueError('Required reasoning/schema support unverified')
    else:
        left={k:v for k,v in last.items()if k not in {'instructions','text','max_output_tokens'}}
        right={k:v for k,v in newbody.items()if k not in {'instructions','text','max_output_tokens'}}
        if left!=right or newbody['max_output_tokens']!=8192 or newmeta['max_output_tokens_ceiling']!=8192:raise ValueError('Compact eligibility recovery routing/cap differs')
        contract=_read(root,row['protocol_contract_ref'])
        if (contract.get('record_kind')!='reviewed_compact_R3_eligibility_repair_contract' or contract.get('status')!='approved'
                or contract.get('instructions_sha256')!=__import__('hashlib').sha256(newbody['instructions'].encode()).hexdigest()):raise ValueError('Reviewed exact compact protocol required')
        for producer in contract['producer_files']:
            if not producer['path'].startswith('archive/producer_snapshots/'):
                raise ValueError('Protocol producers must be immutable historical snapshots')
            a.checked_ref(root,producer)
        props=newbody['text']['format']['schema']['properties']
        if set(props)!=set(contract['allowed_output_properties']) or set(props)&{'facts','models','entities'}:raise ValueError('Compact recovery must not replace numerical graphs')
        request_schema=newbody['text']['format']['schema']
        if a.digest(request_schema)!=row['request_schema_sha256']:raise ValueError('Exact compact schema binding differs')
        for key in ('report_id','pmid','stage','source_sha256'):
            expected=a.digest(source)if key=='source_sha256'else source[key]
            if props[key].get('enum')!=[expected]:raise ValueError('Compact schema source identity is not exact')
        ids=[span['span_id']for span in payload['source_span_catalog']['spans']]
        evidence=request_schema['$defs']['evidence']['properties']
        if any(evidence[key].get('enum')!=ids for key in ('evidence_id','span_id')):
            raise ValueError('Compact evidence IDs must be from the exact sent catalog')
        if any(props[key]['properties']['evidence_ids']['items'].get('enum')!=ids for key in ('decision','treatment_context')):
            raise ValueError('Compact decision/treatment references must be owned catalog IDs')
    return {'authority':auth,'entry':row,'task':base,'parent':parent,'last_body':last,'source':source}

def validate_state(root,task,authority_ref,current,history,route_ref):
    proof=validate_recovery_task(root,task,authority_ref);auth,row=proof['authority'],proof['entry']
    if auth['route_ref']!=route_ref or a.digest(current['identity'])!=row['old_identity_sha256']:raise ValueError('Current identity/route differs')
    from . import gateway_accounting as g
    if current['source_key']!=g.source_key(task):raise ValueError('Original global scientific source changed')
    count=len(history)
    if (type(row['expected_global_attempt_count'])is not int or row['expected_global_attempt_count']!=count
            or type(row['remaining_attempts'])is not int or row['remaining_attempts']!=3-count or count>=3):raise ValueError('Global three-attempt history cannot reset')
    if row['case']!=UNKNOWN_RISK and any(r['state'].startswith('held_')or r['state']in {'reserved','started'}for r in history):raise ValueError('Unknown/integrity-held sends cannot be resubmitted')
    if not history or history[-1]['attempt_id']!=row['latest_attempt_id']:raise ValueError('Recovery is not bound to the latest actual attempt')
    record=history[-1]['record'];result=record.get('result')or{}
    if ((result.get('artifacts')or{}).get('request')!=row['latest_request_ref'] or result.get('request_body_sha256')!=row['latest_request_body_sha256']
            or current['result']!=result):raise ValueError('Last committed result/request differs')
    route=_read(root,route_ref)
    if not g.cost_evidence(root,route['endpoint'],record,result):raise ValueError('Immutable native result/receipt/usage proof required')
    if row['case']==UNKNOWN_RISK:
        if (count!=1 or history[-1]['ordinal']!=1 or history[-1]['state']!='held_unknown_gateway_send'
                or current['state']!='provider_hold' or row['failure_ref']!=result['artifacts']['result']
                or result.get('status')!='provider_problem' or result.get('sent')is not True
                or result.get('http_status')is not None or result.get('usage')is not None
                or result.get('provider_request_id')is not None or result.get('response')!={}
                or result.get('headers')!={} or (result.get('error')or{}).get('type')!='network_error'
                or a.checked_ref(root,result['artifacts']['raw_response'])!=b''):
            raise ValueError('Only exact original one-attempt network-unknown sends qualify')
        a.checked_ref(root,row['failure_ref'])
    elif row['case']=='output_cap_only':
        raw=_read(root,result['artifacts']['raw_response']);usage=result.get('usage')
        if (current['state']!='provider_hold' or row['failure_ref']!=result['artifacts']['result']
                or result.get('status')!='provider_problem' or result.get('http_status')!=200
                or result.get('error')!={'type':'incomplete_output','details':{'reason':'max_output_tokens'}}
                or not isinstance(usage,dict)or type(usage.get('output_tokens'))is not int or usage['output_tokens']!=32768
                or raw.get('status')!='incomplete' or raw.get('incomplete_details')!={'reason':'max_output_tokens'}):raise ValueError('Only known exact32k output exhaustion is recoverable by64k')
        a.checked_ref(root,row['failure_ref'])
    else:
        callback=current.get('callback')or{}
        if (current['state']not in {'completed','scientific_hold'} or result.get('status')!='completed'
                or callback.get('status')!='decision_validation_pending' or callback.get('artifact')!=row['failure_ref']):raise ValueError('A source-valid completed response cannot be resubmitted')
        view=_read(root,row['failure_ref'])
        if (view.get('source')!=task['metadata']['source_ref']or view.get('native_artifacts')!=result['artifacts']
                or view['validation'].get('original_payload')!=result.get('payload')or view['validation'].get('decision_valid')is not False):raise ValueError('Exact original failed scientific view required')
    return proof
