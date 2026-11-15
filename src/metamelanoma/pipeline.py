"""Finite, resumable R2 screening/extraction followed by complementary R3."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import time
from urllib.parse import quote

from . import schema, screening, validation
from .accounting import Journal
from .bootstrap import PHASE, bootstrap
from .execution import RateLimits, execute
from .io import atomic_json, canonical, digest, now, owned, producer_reference, read_json, reference, verified_json
from .registry import Registry
from .sources import PublicSources

CONFIG = "config/pipeline.json"


class PipelineHeld(RuntimeError):
    """The finite executor stopped safely; later stages must not dispatch."""


def compact_r2_controls_article(root, pmid):
    """Prepared compact R2 supersedes the legacy registry for future R3 routing."""
    path = owned(Path(root).resolve(), 'data/current/gateway_accounting.sqlite3')
    if not path.exists():
        return False
    try:
        with sqlite3.connect('file:' + quote(str(path), safe='/') + '?mode=ro', uri=True) as db:
            if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='reextraction_phases'").fetchone():
                return False
            for (raw,) in db.execute('SELECT authority_json FROM reextraction_phases'):
                authority = json.loads(raw)
                if authority.get('stage') != 'R2':
                    continue
                plan = verified_json(Path(root).resolve(), authority['plan_ref'])
                entries = plan.get('articles', plan.get('article_pmids', []))
                ids = {str(entry.get('citation', entry).get('pmid')) if isinstance(entry, dict) else str(entry) for entry in entries}
                if str(pmid) in ids:
                    return True
    except (OSError, sqlite3.Error, KeyError, TypeError, ValueError) as exc:
        raise PermissionError('Current compact R2 routing authority could not be verified') from exc
    return False


def pilot_candidates(tasks, journal):
    """Sample work that can run; old terminal holds remain in the audit/bulk list."""
    states={row[0]:row[1] for row in journal.db.execute("SELECT task_id,state FROM tasks")}
    return [task for task in tasks if states.get(task["task_id"])in {None,"pending","retry_wait"}]


def registered_article_tasks(root, journal, pmid, stage="R3"):
    """Restore an already-registered whole article plan; never repack its source."""
    if not callable(getattr(type(journal),"current_task_ref",None)):
        return None
    rows=journal.db.execute("SELECT task_id FROM tasks WHERE CAST(json_extract(identity,'$.metadata.pmid') AS TEXT)=? AND json_extract(identity,'$.stage')=? ORDER BY rowid",(str(pmid),stage)).fetchall()
    if not rows:
        return None
    tasks={}
    for row in rows:
        task_id=row["task_id"]
        task=verified_json(root,journal.current_task_ref(task_id))
        identity={"task_id":task["task_id"],"stage":task["stage"],"model":task["model"],
                  "body_sha256":schema.digest(task["body"]),"metadata":task["metadata"]}
        if task_id!=task["task_id"] or task["stage"]!=stage or str(task["metadata"]["pmid"])!=str(pmid) or identity!=journal.task(task_id)["identity"]:
            raise PipelineHeld("Registered article task identity needs review; source was not repacked")
        tasks[task_id]=task
    declared=next(iter(tasks.values()))["metadata"].get("article_task_ids")
    if not isinstance(declared,list) or len(declared)!=len(set(declared)) or set(declared)!=set(tasks) or any(t["metadata"].get("article_task_ids")!=declared for t in tasks.values()):
        raise PipelineHeld("Registered whole-article plan is incomplete; source was not repacked")
    return [tasks[task_id]for task_id in declared]


def immutable_json(root: Path, path: str, value) -> dict:
    target = owned(root,path)
    if target.exists():
        if read_json(target) != value:
            raise ValueError("An existing task or scientific artifact changed: " + path)
    else:atomic_json(target,value)
    return reference(root,path)


def prepare(root: Path) -> dict:
    root = root.resolve()
    registry = Registry(root)
    imported = bootstrap(root,registry)
    baseline = read_json(owned(root,"data/proposed_changes/canonical_runtime_consolidation/EXPANSION_CARRY_FORWARD_BASELINE.json"))
    path = owned(root,CONFIG)
    if path.exists():
        config = read_json(path)
        if config["phase_id"] != PHASE or config["baseline"] != baseline or config["additional_budget_usd"] != "100":
            raise ValueError("A run cannot reset the authorized expansion allowance")
        return config
    config = {"phase_id":PHASE,"created_at":now(),"not_after_utc":(datetime.now(timezone.utc)+timedelta(hours=48)).isoformat(),
              "additional_budget_usd":"100","total_cap_usd":"244.959774","baseline":baseline,
              "authorization_basis":"User requested OpenAI screening/extraction of the 3,596 candidates and explicitly approved up to $100 additional.",
              "endpoint":"https://api.openai.com/v1/responses","models":dict(schema.MODELS),"reasoning_effort":"high",
              "service_tier":"flex",
              "include_deferred_treatments":True,"include_separate_treatments":False,
              "max_workers":32,"max_attempts":3,"R2_output_tokens":8192,"R2_output_ceiling":16384,
              "R3_output_tokens":16384,"R3_output_ceiling":32768,
              "cohort":imported["inputs"]["candidates"],"article_count":3596,
              "producer_files":[producer_reference(root,path) for path in sorted((root/"src/metamelanoma").glob("*.py"))]}
    atomic_json(path,config)
    return config


def make_task(root: Path, citation: dict, source: dict, config: dict) -> dict:
    stage = source["stage"]
    body = screening.request_body(source,max_output_tokens=config.get(stage+"_fresh_output_tokens",config[stage+"_output_tokens"]),service_tier=config.get("service_tier","default"))
    core = {k:v for k,v in body.items()if k!="max_output_tokens"}
    identity = {"phase":PHASE,"pmid":str(citation["pmid"]),"source":schema.digest(source),"core":core}
    provider = config.get("provider", "openai")
    if provider != "openai":
        identity["provider"] = provider
    task_id = stage.lower()+"-"+digest(canonical(identity))[:28]
    source_ref = immutable_json(root,"data/current/tasks/"+task_id+"/source.json",source)
    task = {"task_id":task_id,"stage":stage,"model":body["model"],"body":body,
            "metadata":{"phase_id":PHASE,"pmid":str(citation["pmid"]),"report_id":citation["report_id"],
                        "source_ref":source_ref,"body_core_sha256":digest(canonical(core)),
                        "max_output_tokens_ceiling":config[stage+"_output_ceiling"]}}
    if provider != "openai":
        task["metadata"]["provider"] = provider
    return task


def pack_fulltext(root: Path, citation: dict, document: dict, upstream: dict, config: dict) -> tuple[list[dict],list[dict]]:
    """Pack complete source units, retaining the title/abstract as non-target context."""
    blocks = document["blocks"]
    def is_context(block):
        return (block.get("is_target") is False or block.get("document_role") == "citation"
                or block["text"].startswith(("Title:","Abstract:")))
    context = [{**block,"is_target":False}for block in blocks if is_context(block)]
    targets = [block for block in blocks if not is_context(block)]
    groups = []; current = []; gaps = []
    def source_for(group):
        source=screening.build_source(citation,"R3",[*context,*group],fulltext_verified=True,upstream_R2=upstream,
                   limitations=[*document.get("limitations",[]),"This request reviews the supplied complete source units; other source units may be in separate requests."])
        source["prior_clinical_facts"]={key:deepcopy(upstream.get(key,[]))for key in ["entities","models","facts","evidence","field_coverage"]}
        for key in ("arm_regimens", "contrast_definitions"):
            if key in upstream:
                source["prior_clinical_facts"][key] = deepcopy(upstream[key])
        return source
    for block in targets:
        try:screening.request_body(source_for([*current,block]),max_output_tokens=config["R3_output_tokens"],service_tier=config.get("service_tier","default"))
        except ValueError:
            if current:groups.append(current);current = []
            try:screening.request_body(source_for([block]),max_output_tokens=config["R3_output_tokens"],service_tier=config.get("service_tier","default"))
            except ValueError:
                gaps.append({"source_id":block["source_id"],"block_id":block["block_id"],"reason":"Whole source unit exceeds request bound; not truncated or treated as absent."});continue
        current.append(block)
    if current:groups.append(current)
    tasks = [make_task(root,citation,source_for(group),config)for group in groups]
    ids = [task["task_id"]for task in tasks]
    for task in tasks:
        task["metadata"]["article_task_ids"] = ids
        task["metadata"]["source_gaps"] = gaps
        task["metadata"]["raw_source_ref"] = document["raw_ref"]
    return tasks,gaps


def namespace_graph(payload: dict, prefix: str) -> dict:
    """A bijective ID rename; never combine estimates, populations or models."""
    value = deepcopy(payload)
    ids = {item[key]:prefix+":"+item[key] for collection,key in [("entities","entity_id"),("models","model_id"),("facts","fact_id"),("evidence","evidence_id")]
           for item in value.get(collection,[])}
    for contrast in value.get("contrast_definitions", []):
        ids[contrast["contrast_id"]] = prefix + ":" + contrast["contrast_id"]
    for regimen in value.get("arm_regimens", []):
        for node in regimen.get("nodes", []):
            ids[node["node_id"]] = prefix + ":" + node["node_id"]
    def walk(node):
        if isinstance(node,list):return [walk(item)for item in node]
        if not isinstance(node,dict):return node
        return {key:([ids.get(item,item)for item in item_value] if key in {"evidence_ids","arm_ids","children"}
                      else ids.get(item_value,item_value)if key.endswith("_id") and isinstance(item_value,str)
                      else walk(item_value))for key,item_value in node.items()}
    return walk(value)


def aggregate_fragments(registry: Registry, task: dict) -> bool:
    ids = task["metadata"].get("article_task_ids",[task["task_id"]])
    fragments = registry.fragments(ids)
    if len(fragments)!=len(ids) or any(f["status"] not in {"retain","exclude","unclear"}for f in fragments):return False
    statuses = {f["status"]for f in fragments}
    if statuses=={"exclude"}:status="exclude"
    elif "retain" in statuses and "exclude" not in statuses:status="retain"
    else:status="unclear"
    reason = fragments[0]["reason"] if len(fragments)==1 or len({f["reason"]for f in fragments})==1 else (
        "Source sections disagree on eligibility: "if "exclude" in statuses and len(statuses)>1 else "Full-text clinical review: ")+"; ".join(dict.fromkeys(f["reason"]for f in fragments))
    payload = namespace_graph(fragments[0]["payload"],fragments[0]["task_id"])
    collections = ["entities","models","facts","evidence","field_coverage","limitations"]
    collections.extend(key for key in ("arm_regimens", "contrast_definitions")
                       if any(key in fragment["payload"] for fragment in fragments))
    for key in collections:payload[key]=[]
    for fragment in fragments:
        qualified = namespace_graph(fragment["payload"],fragment["task_id"])
        for key in collections:payload[key].extend(qualified.get(key,[]))
    payload["record_kind"]="source_fragment_aggregate"
    payload["decision"]["evidence_ids"]=list(dict.fromkeys(
        fragment["task_id"]+":"+anchor for fragment in fragments for anchor in fragment["payload"]["decision"]["evidence_ids"]))
    payload["decision"]["status"] = "uncertain"if status=="unclear"else status
    payload["decision"]["reason"] = reason
    payload["fragment_source_refs"] = [f["source_ref"]for f in fragments]
    payload["limitations"].extend(gap["reason"]for gap in task["metadata"].get("source_gaps",[]))
    key="canonical:"+digest(canonical([{key:f[key]for key in ["task_id","source_ref"]}for f in fragments]))
    registry.save_decision(task["metadata"]["pmid"],task["stage"],key,status,reason,payload,
                           {"fragments":[f["source_ref"]for f in fragments]})
    return True


class Pipeline:
    def __init__(self,root: Path):
        self.root=root.resolve();self.registry=Registry(self.root);self.config=prepare(self.root)
        self.tasks={};self._last_publish=0.0;self._last_status=0.0;self.journal=None
        self.transport=None
        self.allowed={str(row[0])for row in self.registry.db.execute("SELECT pmid FROM worklist WHERE phase=?",(PHASE,))}
        self.r3_routing_allowed=frozenset(str(row[0]) for row in self.registry.db.execute(
            "SELECT d.pmid FROM decisions d JOIN (SELECT pmid,MAX(id) id FROM decisions WHERE stage='R2' GROUP BY pmid) latest ON d.id=latest.id WHERE d.status IN ('retain','unclear')"))
        self.config_ref=reference(self.root,CONFIG)
        self.rate_limits=RateLimits(self.config["max_workers"])

    def guard_environment(self):
        hold=self.root/"data/current/HOLD"
        if hold.exists() or hold.is_symlink():raise PermissionError("Pipeline HOLD is set")
        complete=read_json(owned(self.root,"data/current/cleanup_complete.json"))
        if complete.get("status")!="complete":raise PermissionError("Repository cleanup must finish before model dispatch")
        if reference(self.root,CONFIG)!=self.config_ref:raise PermissionError("Run configuration changed")
        for ref in self.config["producer_files"]:
            if reference(self.root,ref["path"])!=ref:raise PermissionError("Active producer changed: "+ref["path"])

    def gate(self,task):
        self.guard_environment()
        meta=task["metadata"]
        # Old queued/recovery tasks carry superseded R2 decisions. This legacy
        # runner has no authority to dispatch R3 for a freshly reviewed compact
        # cohort, even if an older registry entry said retain. A routing preview
        # or a caller-supplied flag is not a source-bound R3 dispatch authority.
        if task['stage'] == 'R3' and compact_r2_controls_article(self.root, meta.get('pmid')):
            raise PermissionError('Prepared compact R2 requires a new source-bound R3 dispatch authority; legacy R3 is disabled for this article')
        if meta.get("phase_id")!=PHASE or meta.get("pmid")not in self.allowed:raise PermissionError("Task is outside the authorized candidate set")
        if meta.get("provider","openai") != self.config.get("provider","openai"):
            raise PermissionError("Task provider differs from the configured route")
        if task["model"]!=self.config["models"][task["stage"]]:raise PermissionError("Wrong stage/model")
        if task["body"].get("service_tier")!=self.config.get("service_tier","default"):
            raise PermissionError("Service tier differs; automatic Standard fallback is forbidden")
        if meta.get('finite_recovery') is not None:
            from .gateway_recovery import validate_recovery_task
            if meta.get('provider') != 'cornell_openai_gateway' or task['stage'] != 'R3':
                raise PermissionError('Finite R3 recovery requires the Cornell route')
            proof = validate_recovery_task(self.root, task, self.recovery_authority(task))
            source = verified_json(self.root, meta['source_ref'])
            if meta['finite_recovery']['kind'] == 'eligibility_repair':
                from .eligibility_repair import validate_task_body
                validate_task_body(task, source, parent_body=proof['last_body'])
            if (source['stage'] != 'R3' or str(source['pmid']) != meta['pmid']
                    or source['report_id'] != meta['report_id'] or not source.get('main_full_text_verified')
                    or source['upstream_R2']['decision']['status'] not in {'retain','uncertain','unclear'}):
                raise PermissionError('Recovery requires the exact eligible verified R3 source')
            if meta['pmid'] not in self.r3_routing_allowed:
                raise PermissionError('R2-excluded articles cannot receive R3 recovery')
            ref = meta['raw_source_ref']
            if reference(self.root, ref['path']) != ref:
                raise PermissionError('Verified primary source changed')
            return True
        initial=self.config[task["stage"]+"_output_tokens"];ceiling=self.config[task["stage"]+"_output_ceiling"]
        if meta.get("max_output_tokens_ceiling")!=ceiling or not initial<=task["body"]["max_output_tokens"]<=ceiling:
            raise PermissionError("Retry output cap exceeds the reviewed range")
        if digest(canonical({k:v for k,v in task["body"].items()if k!="max_output_tokens"}))!=meta["body_core_sha256"]:
            raise PermissionError("Only the approved output cap may vary on retry")
        source=verified_json(self.root,meta["source_ref"])
        if source["stage"]!=task["stage"] or str(source["pmid"])!=meta["pmid"] or source["report_id"]!=meta["report_id"]:
            raise PermissionError("Source identity changed")
        wire_ceiling=120000
        if meta.get("enum_repair") is not None:
            if meta.get("provider") != "cornell_openai_gateway" or not self.config.get("catalog_enum_repair_ref"):
                raise PermissionError("Catalog repair requires the exact configured Cornell authority")
            from .gateway_accounting import validate_amended_task
            validate_amended_task(self.root,task,self.config["catalog_enum_repair_ref"],allow_output_cap_variant=True)
            wire_ceiling=meta.get("wire_ceiling_bytes")
        elif meta.get("wire_ceiling_bytes",120000) != 120000:
            raise PermissionError("Fresh tasks retain the120k wire bound")
        if task["body"]!=screening.request_body(source,max_output_tokens=task["body"]["max_output_tokens"],service_tier=task["body"]["service_tier"],wire_ceiling=wire_ceiling,
                recorded_schema=task["body"]["text"]["format"]["schema"],recorded_instructions=task["body"]["instructions"]):
            raise PermissionError("Request body differs from its bound source and scientific contract")
        if task["stage"]=="R3":
            if not source.get("main_full_text_verified") or source["upstream_R2"]["decision"]["status"]not in {"retain","uncertain","unclear"}:
                raise PermissionError("Only retained/unclear R2 with verified main may enter R3")
            ref=meta["raw_source_ref"]
            if reference(self.root,ref["path"])!=ref:raise PermissionError("Verified primary source changed")

    def recovery_authority(self, task):
        matches = []
        for ref in self.config.get('source_recovery_refs', []):
            authority = verified_json(self.root, ref)
            if any(row['task_id'] == task['task_id'] for row in authority['entries']):
                matches.append(ref)
        if len(matches) != 1:
            raise PermissionError('Exactly one configured finite recovery authority is required')
        return matches[0]

    def publish(self,force=False):
        if not force and time.monotonic()-self._last_publish<self.config.get('clinical_publish_interval_seconds',120):return
        self.registry.publish_progress()
        script=self.root/"website/scripts/clinical_evidence.py"
        if script.exists():
            folder=str(script.parent);added=folder not in sys.path
            if added:sys.path.insert(0,folder)
            try:
                spec=importlib.util.spec_from_file_location("melanoma_clinical_export",script)
                module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            finally:
                if added:sys.path.remove(folder)
            module.export_clinical_evidence(self.root,articles=self.registry.clinical_articles())
        self._last_publish=time.monotonic()

    def progress(self,event):
        for start in event.get("events",[]):
            task=self.tasks.get(start.get("task_id"))
            if task and start.get("event")=="http_attempt_started":
                self.registry.mark_attempt(task["task_id"],task["metadata"]["pmid"],task["stage"],"started",start)
        if time.monotonic()-self._last_status>2 or event.get("phase")not in {"running"}:
            atomic_json(owned(self.root,"data/current/pipeline_status.json"),event)
            self._last_status=time.monotonic()
        self.registry.publish_progress()

    def on_result(self,task,result,*,revalidation=False):
        meta=task["metadata"];pmid=meta["pmid"];stage=task["stage"]
        if result.get("status")!="completed" or not isinstance(result.get("payload"),dict):
            state="provider_problem"if result.get("sent")is True else"not_sent"
            self.registry.mark_attempt(task["task_id"],pmid,stage,state,{"error":result.get("error"),"artifacts":result.get("artifacts")})
            print(json.dumps({"at":now(),"pmid":pmid,"stage":stage,"problem":result.get("error"),"task_id":task["task_id"]}),flush=True)
            return {"status":"provider_problem","scientific_decision_created":False}
        source=verified_json(self.root,meta["source_ref"])
        saved=verified_json(self.root,result["artifacts"]["result"])
        if any(saved.get(key)!=result.get(key)for key in ["task_id","attempt_id","payload","request_body_sha256","response"]):
            raise ValueError("Saved native result and projected result differ")
        request=verified_json(self.root,result["artifacts"]["request"])
        body=request["body"]
        provider = meta.get("provider", "openai")
        endpoint = self.config["endpoint"] if provider == "cornell_openai_gateway" else "https://api.openai.com/v1/responses"
        if provider not in {"openai", "cornell_openai_gateway"}:
            raise ValueError("Unrecognized result provider")
        if (request.get("task_id")!=task["task_id"] or request.get("endpoint")!=endpoint or request.get("provider")!=provider
                or digest(canonical(body))!=result["request_body_sha256"] or request.get("body_sha256")!=result["request_body_sha256"]
                or body["model"]!=task["model"] or json.loads(body["input"])["source_sha256"]!=schema.digest(source)):
            raise ValueError("Native request, result and source proof do not agree")
        if (meta.get('finite_recovery') or {}).get('kind') == 'eligibility_repair':
            from .gateway_accounting import completed_route_proof
            if body != task['body'] or set(result.get('artifacts',{})) != {'request','raw_response','result','receipt','sent'}:
                raise ValueError('Compact callback requires the exact approved request and all native proof artifacts')
            if self.journal is None:
                raise ValueError('Compact callback requires its committed Cornell journal attempt')
            attempts = [attempt for attempt in self.journal.attempts_for(task['task_id'])
                if attempt['attempt_id'] == result['attempt_id']]
            if (len(attempts) != 1 or attempts[0]['state'] != 'committed_gateway_response'
                    or attempts[0]['record'].get('result') != result):
                raise ValueError('Compact callback attempt is missing, unsettled or differs from its committed result')
            completed_route_proof(self.root, endpoint, attempts[0]['record'], result)
            return self.on_eligibility_repair(task, result, source)
        view=validation.validate(result["payload"],source,request_schema=body["text"]["format"]["schema"])
        producers=[producer_reference(self.root,"src/metamelanoma/"+name+".py")for name in ["schema","normalization","validation","regimen_validation","screening","pipeline"]]
        view_id=digest(canonical(producers))
        native_policy=digest(body["instructions"].encode())
        ref=immutable_json(self.root,"data/reviews/current/"+pmid+"/"+stage+"/"+task["task_id"]+"/"+view_id+".json",
                           {"task_id":task["task_id"],"pmid":pmid,"stage":stage,"reviewer_model":task["model"],
                            "policy_sha256":native_policy,"effective_policy_sha256":digest(screening.PROMPT.encode()),
                            "validation_producers":producers,"source":meta["source_ref"],"native_artifacts":result["artifacts"],
                            "request_body_sha256":result["request_body_sha256"],"provider":provider,"validation":view})
        if not view["decision_valid"]:
            self.registry.mark_attempt(task["task_id"],pmid,stage,"decision_validation_pending",{"errors":view["decision_errors"],"global_errors":view["global_errors"],"artifact":ref})
            print(json.dumps({"at":now(),"pmid":pmid,"stage":stage,"problem":"decision_validation_pending","artifact":ref}),flush=True)
            return {"status":"decision_validation_pending","artifact":ref}
        qualified=deepcopy(view["normalized_payload"])
        qualified.update(facts=view["validated_facts"],models=view["validated_models"],entities=view["validated_entities"],evidence=view["evidence"])
        for key in ("arm_regimens", "contrast_definitions"):
            if key in qualified:
                qualified[key] = deepcopy(view["validated_" + key])
        qualified["validation_issues"]={"fact_results":view["fact_results"],"model_results":view["model_results"],"coverage":view["field_coverage_errors"]}
        for key in ("arm_regimen_results", "contrast_results"):
            if key in view:
                qualified["validation_issues"][key] = deepcopy(view[key])
        qualified["source_checked_counts"]={**view["counts"],
            "numeric_facts_submitted":sum(bool(f.get("numbers"))for f in result["payload"]["facts"]),
            "numeric_facts_accepted":sum(bool(f.get("numbers"))for f in view["validated_facts"])}
        qualified["clinical_verified"]=False;qualified["pooling_eligible"]=False
        qualified["reviewer_model"]=task["model"];qualified["policy_sha256"]=native_policy
        qualified["treatment_policy"]=view.get("treatment_policy",{"status":"not_recorded","priority":"review"})
        status={"uncertain":"unclear"}.get(qualified["decision"]["status"],qualified["decision"]["status"])
        self.registry.save_fragment(task["task_id"],pmid,stage,status,qualified["decision"]["reason"],qualified,ref,
                                    revision_reason="Offline source revalidation under producer "+view_id if revalidation else None)
        completed=aggregate_fragments(self.registry,task)
        self.registry.mark_attempt(task["task_id"],pmid,stage,"reviewed",{"artifact":ref,"article_screening_finished":completed,"facts":view["counts"]})
        self.publish()
        return {"status":"reviewed","artifact":ref,"article_screening_finished":completed,"facts":view["counts"]}

    def on_eligibility_repair(self, task, result, source):
        """A compact native decision supplements the preceding accepted graph."""
        from .gateway_recovery import validate_recovery_task
        from .eligibility_repair import derive_closed_subset
        authority = self.recovery_authority(task)
        proof = validate_recovery_task(self.root, task, authority)
        entry = proof['entry']
        prior = verified_json(self.root, entry['failure_ref'])
        if prior['source'] != task['metadata']['source_ref'] or prior['task_id'] != task['task_id']:
            raise ValueError('Compact repair prior validation belongs to another source')
        record = {'record_kind':'Cornell_compact_eligibility_source_repair', 'as_of':now(),
            'task_id':task['task_id'], 'pmid':task['metadata']['pmid'], 'stage':'R3',
            'source_ref':task['metadata']['source_ref'], 'authority_ref':authority,
            'prior_validation_ref':entry['failure_ref'], 'native_artifacts':result['artifacts'],
            'request_body_sha256':result['request_body_sha256'],
            'is_native_full_graph':False, 'clinical_verified':False, 'pooling_eligible':False,
            'producers':[producer_reference(self.root,'src/metamelanoma/'+name+'.py')
                for name in ['pipeline','eligibility_repair','schema','validation','normalization']]}
        try:
            derivative = derive_closed_subset(result['payload'], source, prior['validation'])
            record['derivative'] = derivative
        except ValueError as exc:
            record['decision_valid'] = False
            record['problem'] = str(exc)
            ref = immutable_json(self.root,'data/reviews/compact_R3/'+task['metadata']['pmid']+'/'+digest(canonical(record))+'.json',record)
            self.registry.mark_attempt(task['task_id'],task['metadata']['pmid'],'R3','decision_validation_pending',
                {'artifact':ref,'error':str(exc)})
            print(json.dumps({'at':now(),'pmid':task['metadata']['pmid'],'stage':'R3',
                'problem':'compact_decision_validation_pending','reason':str(exc),'artifact':ref}),flush=True)
            return {'status':'decision_validation_pending','artifact':ref}
        record['decision_valid'] = True
        qualified = derivative['qualified']
        qualified['reviewer_model'] = task['model']
        qualified['native_compact_result_ref'] = result['artifacts']['result']
        ref = immutable_json(self.root,'data/reviews/compact_R3/'+task['metadata']['pmid']+'/'+digest(canonical(record))+'.json',record)
        status = {'uncertain':'unclear'}.get(qualified['decision']['status'],qualified['decision']['status'])
        self.registry.save_fragment(task['task_id'],task['metadata']['pmid'],'R3',status,
            qualified['decision']['reason'],qualified,ref,
            revision_reason='Compact Cornell eligibility repair; preceding accepted extraction retained')
        completed = aggregate_fragments(self.registry,task)
        self.registry.mark_attempt(task['task_id'],task['metadata']['pmid'],'R3','reviewed',
            {'artifact':ref,'article_screening_finished':completed,'facts':qualified['source_checked_counts']})
        self.publish()
        return {'status':'reviewed','artifact':ref,'article_screening_finished':completed,
            'facts':qualified['source_checked_counts']}

    def revalidate(self):
        """Apply current source normalization to paid responses; never open a wallet writer."""
        path=owned(self.root,"data/current/accounting.sqlite3")
        db=sqlite3.connect("file:"+str(path)+"?mode=ro",uri=True)
        db.row_factory=sqlite3.Row
        before=tuple(db.execute("SELECT seq,event_hash FROM events ORDER BY seq DESC LIMIT 1").fetchone())
        rows=db.execute("SELECT task_id,identity,result FROM tasks WHERE result IS NOT NULL ORDER BY task_id").fetchall()
        outcomes=[]
        for row in rows:
            result=json.loads(row["result"])
            if result.get("status")!="completed":continue
            task=read_json(owned(self.root,"data/current/tasks/"+row["task_id"]+"/task.json"))
            identity=json.loads(row["identity"])
            if (identity["metadata"]!=task["metadata"] or identity["body_sha256"]!=digest(canonical(task["body"]))
                    or identity["model"]!=task["model"] or identity["stage"]!=task["stage"]):
                raise ValueError("Historical task differs from its committed native identity")
            outcomes.append({"task_id":task["task_id"],"result":self.on_result(task,result,revalidation=True)})
        after=tuple(db.execute("SELECT seq,event_hash FROM events ORDER BY seq DESC LIMIT 1").fetchone());db.close()
        if before!=after:raise ValueError("Accounting changed during offline revalidation")
        self.publish(force=True)
        receipt={"record_kind":"offline_source_revalidation","as_of":now(),"native_requests_created":0,
                 "accounting_head_before":before,"accounting_head_after":after,"native_originals_preserved":True,"outcomes":outcomes}
        name=digest(canonical(receipt))
        atomic_json(owned(self.root,"data/audits/offline_revalidation/"+name+".json"),receipt)
        return receipt

    def execute_tasks(self,tasks,pilot=False):
        unknown = [(task.get('metadata',{}).get('finite_recovery')or{}).get('kind')=='user_approved_unknown_retry'for task in tasks]
        if any(unknown)and not all(unknown):raise PermissionError('Informed unknown-send retries must run as a separate finite batch')
        attempt_limit=2 if unknown and all(unknown) else self.config['max_attempts']
        self.tasks.update({task["task_id"]:task for task in tasks})
        if not tasks:return
        for task in tasks:
            if task.get('metadata',{}).get('finite_recovery') is not None:
                from .gateway_accounting import immutable
                immutable(self.root,'data/current/tasks/'+task['task_id']+'/revisions/'+schema.digest(task)+'/task.json',task)
                self.journal.amend_task(task,self.recovery_authority(task))
            elif task.get("metadata",{}).get("enum_repair") is not None:
                authority=self.config.get("catalog_enum_repair_ref")
                if not authority:
                    raise PermissionError("A registered task revision requires the finite repair authority")
                from .gateway_accounting import immutable
                immutable(self.root,"data/current/tasks/"+task["task_id"]+"/revisions/"+schema.digest(task)+"/task.json",task)
                self.journal.amend_task(task,authority)
            else:
                immutable_json(self.root,"data/current/tasks/"+task["task_id"]+"/task.json",task)
        outcome=execute(tasks,journal=self.journal,on_result=self.on_result,progress=self.progress,gate=self.gate,
                transport=self.transport,
                max_workers=self.config["max_workers"],max_attempts=attempt_limit,
                deadline=self.config["not_after_utc"],rate_limits=self.rate_limits)
        if outcome["phase"]=="held":
            self.registry.publish_progress()
            atomic_json(owned(self.root,"data/current/pipeline_status.json"),{**outcome,"as_of":now(),"saved_work_preserved":True})
            raise PipelineHeld("Execution held: "+str(outcome["stop_reason"]))
        self.publish(force=not pilot)
        return outcome

    def open_execution_route(self):
        """Open the configured route under the shared model-writer lease."""
        self.guard_environment()
        if self.config.get("provider", "openai") == "cornell_openai_gateway":
            from .gateway import GatewayTransport
            from .gateway_accounting import GatewayJournal
            self.journal=GatewayJournal(self.root,route_ref=self.config["gateway_route_ref"])
            self.transport=GatewayTransport(root=self.root,expected_endpoint=self.config["endpoint"],
                timeout_seconds=self.config.get('gateway_timeout_seconds',1200))
        elif self.config.get("provider", "openai") == "openai":
            if self.config.get("direct_OpenAI_dispatch_enabled") is False:
                raise PermissionError("Direct OpenAI dispatch is disabled by the Cornell switch")
            self.journal=Journal(owned(self.root,"data/current/accounting.sqlite3"),root=self.root,phase_id=PHASE,
                                 baseline=self.config["baseline"],allowance_usd="100",total_cap_usd="244.959774")
        else:
            raise PermissionError("Unrecognized execution provider; no automatic route fallback")

    def recover_r3(self, *, pilot_only=False):
        """Run only the explicitly reviewed unfinished-source recovery worklist."""
        if self.config.get('provider') != 'cornell_openai_gateway':
            raise PermissionError('R3 recovery uses only the configured Cornell gateway')
        refs = self.config.get('source_recovery_refs', [])
        if not refs:
            raise PermissionError('No finite R3 recovery worklist is configured')
        tasks = []
        seen = set()
        scope = set()
        for ref in refs:
            authority = verified_json(self.root, ref)
            scope.update(str(pmid) for pmid in verified_json(self.root, authority['scope_selector_ref']))
            for entry in authority['entries']:
                task = verified_json(self.root, entry['revised_task_ref'])
                if task['task_id'] in seen:
                    raise ValueError('Duplicate task across finite recovery authorities')
                seen.add(task['task_id'])
                if self.registry.fragments([task['task_id']]):
                    continue
                if self.registry.latest(task['metadata']['pmid'], 'R3'):
                    continue
                tasks.append(task)
        self.open_execution_route()
        self.journal.recover_interrupted()
        self._last_publish = time.monotonic()
        print(json.dumps({'at':now(),'phase':'R3_finite_recovery','scope_articles':len(scope),
            'planned_requests':len(tasks),'provider':'cornell_openai_gateway',
            'max_workers':self.config['max_workers'],'direct_OpenAI_dispatch_enabled':False}),flush=True)
        if pilot_only:
            cases = {}
            for task in tasks:
                cases.setdefault(task['metadata']['finite_recovery']['kind'],task)
            self.execute_tasks(list(cases.values()),pilot=True)
        else:
            compact = next((task for task in tasks
                if task['metadata']['finite_recovery']['kind'] == 'eligibility_repair'), None)
            if compact is not None:
                self.execute_tasks([compact],pilot=True)
                callback = self.journal.task(compact['task_id']).get('callback') or {}
                if callback.get('status') != 'reviewed':
                    raise PipelineHeld('Compact recovery pilot needs checking before further dispatch')
            self.execute_tasks([task for task in tasks if task is not compact])
        self.publish(force=True)
        remaining = sorted(pmid for pmid in scope if self.registry.latest(pmid,'R3') is None)
        atomic_json(owned(self.root,'data/current/pipeline_status.json'),{
            'phase':'finite_R3_recovery_pass_finished','as_of':now(),'scope_articles':len(scope),
            'scope_finished':len(scope)-len(remaining),'scope_unfinished':len(remaining),
            'unfinished_PMIDs':remaining,'active':0,'budget':self.journal.status()})
        return {'scope_articles':len(scope),'finished':len(scope)-len(remaining),
            'unfinished':len(remaining),'new_direct_OpenAI_requests':0}

    def run(self,*,pilot_only=False):
        # Restarting never opens another native allowance or gateway phase.
        self.open_execution_route()
        sources=PublicSources(self.root)
        pending=self.registry.candidates(PHASE,"R2")
        blanks=[row for row in pending if not (row.get("abstract")or"").strip()]
        atomic_json(owned(self.root,"data/current/pipeline_status.json"),{"phase":"source_preparation","as_of":now(),
                    "R2_pending_articles":len(pending),"missing_abstracts_to_check":len(blanks),"budget":self.journal.status()})
        tasks=[]
        for citation in self.registry.candidates(PHASE,"R2"):
            if not (citation.get("abstract")or"").strip():continue
            tasks.append(make_task(self.root,citation,screening.build_source(citation),self.config))
        print(json.dumps({"at":now(),"phase":"R2","provider":self.config.get("provider","openai"),"planned_requests":len(tasks),"direct_OpenAI_additional_cap_usd":"100","max_workers":self.config["max_workers"]}),flush=True)
        sample=pilot_candidates(tasks,self.journal)
        retained=[task for task in sample if self.registry.article(task["metadata"]["pmid"]).get("R1_decision")=="retain"]
        uncertain=[task for task in sample if task not in retained]
        pilot=retained[:16]+uncertain[:16]
        pilot_ids={task["task_id"]for task in pilot}
        if len(pilot)<min(32,len(sample)):
            pilot.extend(task for task in sample if task["task_id"]not in pilot_ids)
            pilot=pilot[:32];pilot_ids={task["task_id"]for task in pilot}
        self.execute_tasks(pilot,pilot=True)
        finished=sum(self.registry.latest(task["metadata"]["pmid"],"R2")is not None for task in pilot)
        fragments=self.registry.fragments([task["task_id"]for task in pilot])
        submitted=sum(f["payload"].get("source_checked_counts",{}).get("numeric_facts_submitted",0)for f in fragments)
        accepted=sum(f["payload"].get("source_checked_counts",{}).get("numeric_facts_accepted",0)for f in fragments)
        if pilot and (finished/len(pilot)<0.8 or submitted and accepted/submitted<0.7):
            atomic_json(owned(self.root,"data/current/pipeline_status.json"),{"phase":"pilot_requires_check","as_of":now(),
                        "finished":finished,"pilot_articles":len(pilot),"numeric_facts_submitted":submitted,"numeric_facts_accepted":accepted,
                        "reason":"Pilot decision or numeric-source validation yield needs checking before bulk dispatch; raw responses remain available.",
                        "budget":self.journal.status()})
            raise RuntimeError("Pilot source/transport checks need attention before bulk dispatch")
        if pilot_only:return
        self.execute_tasks([task for task in tasks if task["task_id"]not in pilot_ids])
        # Ready abstracts must not wait behind publisher timeouts for unrelated
        # citations. Recover the missing abstracts after their ready peers run.
        atomic_json(owned(self.root,"data/current/pipeline_status.json"),{"phase":"abstract_recovery","as_of":now(),
                    "missing_abstracts_to_check":len(blanks),"budget":self.journal.status()})
        recovered=[]
        cached_checks={}
        if self.config.get("abstract_check_manifest_ref"):
            manifest=verified_json(self.root,self.config["abstract_check_manifest_ref"])
            by_pmid={str(c["pmid"]):c for c in blanks}
            for record in manifest["records"]:
                pmid=str(record["pmid"])
                if pmid in by_pmid and digest(canonical(by_pmid[pmid]))==record["citation_sha256"]:
                    cached_checks[pmid]=verified_json(self.root,record["check_return_ref"])
        checks={**cached_checks,**sources.recover_abstracts([c for c in blanks if str(c["pmid"])not in cached_checks])}
        for pmid,check in checks.items():
            check_ref=immutable_json(self.root,"data/sources/abstract_checks/"+pmid+"/"+digest(canonical(check))+".json",check)
            if check.get("abstract"):
                self.registry.set_abstract(pmid,check["abstract"],{k:v for k,v in check.items()if k!="abstract"})
                citation=self.registry.article(pmid)
                recovered.append(make_task(self.root,citation,screening.build_source(citation),self.config))
            elif check.get("abstract_check_status")=="verified_absent_in_checked_sources":
                self.registry.save_decision(pmid,"R2","source-availability:"+pmid,"exclude",check["reason"],
                                           {"decision_basis":"verified_scientific_abstract_unavailable","facts":[],"models":[]},check_ref)
            print(json.dumps({"at":now(),"phase":"abstract_recovery","pmid":pmid,
                              "status":check.get("abstract_check_status"),"source":check_ref}),flush=True)
        self.publish(force=True)
        self.execute_tasks(recovered)
        r3_tasks=[];waiting=[];packing_gaps=[];deferred=[]
        r3_request_count=0
        from .prefetch import verified_cached_documents
        cached_documents=verified_cached_documents(self.root)
        r3_candidates=self.registry.candidates(PHASE,"R3")
        r3_candidates.sort(key=lambda c: str(c["pmid"]) not in cached_documents)
        atomic_json(owned(self.root,"data/current/pipeline_status.json"),{"phase":"fulltext_source_preparation","as_of":now(),
                    "R3_candidate_articles":len(r3_candidates),"budget":self.journal.status()})
        cached_phase_complete = False
        for citation in r3_candidates:
            if not cached_phase_complete and str(citation["pmid"]) not in cached_documents:
                cached_phase_complete = True
                if r3_tasks:
                    self.execute_tasks(r3_tasks)
                    r3_tasks=[]
            hold=self.root/"data/current/HOLD"
            if hold.exists()or hold.is_symlink():raise PipelineHeld("Pipeline HOLD is set")
            upstream=self.registry.latest(citation["pmid"],"R2")["payload"]
            priority=upstream.get("treatment_policy",{}).get("priority")
            if (priority=="deferred" and not self.config.get("include_deferred_treatments",False)
                    or priority=="separate" and not self.config.get("include_separate_treatments",False)):
                deferred.append({"pmid":str(citation["pmid"]),"reason":"Treatment remains in the original deferred/separate review group.",
                                 "treatment_policy":upstream["treatment_policy"]})
                continue
            existing=registered_article_tasks(self.root,self.journal,citation["pmid"])
            if existing is not None:
                r3_tasks.extend(existing);r3_request_count+=len(existing)
                gaps=existing[0]["metadata"].get("source_gaps",[])
                if gaps:packing_gaps.append({"pmid":str(citation["pmid"]),"gaps":gaps,"source":existing[0]["metadata"].get("raw_source_ref")})
                if len(r3_tasks)>=self.config["max_workers"]:
                    self.execute_tasks(r3_tasks);r3_tasks=[]
                continue
            try:
                document=self.registry.source(citation["pmid"],"main")
                cached=cached_documents.get(str(citation["pmid"]))
                if not document and cached:
                    if any(cached["citation"].get(k)!=citation.get(k)for k in ["pmid","report_id","doi","pmcid"]):
                        raise ValueError("Prefetched citation identity changed")
                    document=cached["document"]
                    self.registry.save_source(citation["pmid"],"main",document,True)
                if not document:
                    document=sources.fulltext(citation)
                    self.registry.save_source(citation["pmid"],"main"if document.get("main_full_text_verified")else"availability",document,document.get("main_full_text_verified",False))
            except Exception as exc:
                document={"main_full_text_verified":False,"reason":"Source verification pending: "+type(exc).__name__+": "+str(exc)}
            if not document.get("main_full_text_verified"):
                waiting.append({"pmid":str(citation["pmid"]),"reason":document.get("reason"),"source":document});continue
            try:
                tasks,gaps=pack_fulltext(self.root,citation,document,upstream,self.config)
                r3_tasks.extend(tasks)
                r3_request_count+=len(tasks)
                if gaps:packing_gaps.append({"pmid":str(citation["pmid"]),"gaps":gaps,"source":document["raw_ref"]})
                if not tasks:
                    waiting.append({"pmid":str(citation["pmid"]),"reason":"Verified source needs separate whole-unit packing before R3 can start.","gaps":gaps})
            except Exception as exc:
                waiting.append({"pmid":str(citation["pmid"]),"reason":"Source packing pending: "+type(exc).__name__+": "+str(exc)})
            # Send verified articles in bounded batches while later articles'
            # sources are checked, using the same wallet and rate limiter.
            if len(r3_tasks)>=self.config["max_workers"]:
                self.execute_tasks(r3_tasks)
                r3_tasks=[]
        atomic_json(owned(self.root,"data/current/fulltext_waiting.json"),{"as_of":now(),"articles":waiting})
        atomic_json(owned(self.root,"data/current/source_packing_gaps.json"),{"as_of":now(),"articles":packing_gaps})
        atomic_json(owned(self.root,"data/current/deferred_treatments.json"),{"as_of":now(),"articles":deferred})
        print(json.dumps({"at":now(),"phase":"R3","planned_requests":r3_request_count,"awaiting_verified_fulltext":len(waiting)}),flush=True)
        self.execute_tasks(r3_tasks)
        self.publish(force=True)
        atomic_json(owned(self.root,"data/current/pipeline_status.json"),{"phase":"finite_pass_finished","as_of":now(),
                    "article_progress":self.registry.snapshot(),"budget":self.journal.status(),"awaiting_verified_fulltext":len(waiting),
                    "R2_pending":len(self.registry.candidates(PHASE,"R2")),"R3_without_finished_review":len(self.registry.candidates(PHASE,"R3")),
                    "deferred_treatment_articles":len(deferred)})
