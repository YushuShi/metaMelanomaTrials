from copy import deepcopy
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma.io import atomic_json, canonical, digest, reference, verified_json
from metamelanoma.registry import Registry
from metamelanoma.pipeline import Pipeline, PipelineHeld, PHASE, aggregate_fragments, make_task, namespace_graph, pack_fulltext, pilot_candidates
from metamelanoma import schema,screening


def citation(pmid="1"):
    return {"pmid":pmid,"report_id":"report-"+pmid.zfill(24),"title":"Melanoma treatment",
            "abstract":"Twenty-five melanoma patients were treated. Two responded."}


def graph(status="retain"):
    return {"decision":{"status":status,"reason":"Actual melanoma treatment report","evidence_ids":["E1"]},
            "entities":[{"entity_id":"P1","parent_id":None,"evidence_ids":["E1"]}],
            "models":[{"model_id":"M1","analysis_population_id":"P1","evidence_ids":["E1"],"arm_ids":[]}],
            "facts":[{"fact_id":"F1","result_population_id":"P1","model_id":"M1","evidence_ids":["E1"],
                      "reported_trial":None,"numbers":[{"value":0,"evidence_ids":["E1"]}]}],
            "evidence":[{"evidence_id":"E1","span_id":"span-original","source_id":"original-source","quote":"No events."}],
            "field_coverage":[],"limitations":[]}


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve();self.registry=Registry(self.root)
    def tearDown(self):
        self.registry.close();self.temp.cleanup()
    def add(self,pmid="1"):
        self.registry.add_articles([citation(pmid)],"test")
    def decide(self,pmid="1",stage="R2",status="retain",key=None):
        self.registry.save_decision(pmid,stage,key or stage+pmid,status,"Recorded reason",graph(status),{})

    def test_one_article_per_pmid(self):
        self.add();self.add()
        self.assertEqual(self.registry.snapshot()["stages"]["R2"]["entered"],1)
        with self.assertRaises(ValueError):self.registry.add_articles([{**citation(),"report_id":"different"}])

    def test_resume_sample_excludes_terminal_holds_and_keeps_runnable_retries(self):
        from types import SimpleNamespace
        db=sqlite3.connect(":memory:");db.execute("CREATE TABLE tasks(task_id TEXT,state TEXT)")
        db.executemany("INSERT INTO tasks VALUES (?,?)",[("old-invalid","completed"),("old-output-hold","provider_hold"),("ready","pending"),("retry","retry_wait"),("unknown-send","running")])
        tasks=[{"task_id":key}for key in ["old-invalid","old-output-hold","ready","retry","unknown-send","new"]]
        self.assertEqual([t["task_id"]for t in pilot_candidates(tasks,SimpleNamespace(db=db))],["ready","retry","new"]);db.close()

    def test_r2_exclusions_cannot_enter_r3(self):
        self.add();self.decide(status="exclude")
        with self.assertRaises(ValueError):self.registry.mark_attempt("task","1","R3","started",{})
        with self.assertRaises(ValueError):self.decide(stage="R3")
        self.assertEqual(self.registry.candidates("test","R3"),[])

    def test_unclear_may_route_but_availability_is_not_r3_entry(self):
        self.add();self.decide(status="unclear")
        self.registry.save_source("1","main",{"source_sha256":"abc","main_full_text_verified":True})
        self.assertEqual(len(self.registry.candidates("test","R3")),1)
        self.assertEqual(self.registry.snapshot()["stages"]["R3"]["entered"],0)
        self.registry.mark_attempt("task","1","R3","started",{})
        self.assertEqual(self.registry.snapshot()["stages"]["R3"]["entered"],1)

    def test_unified_five_counts_and_only_unclear_reasons(self):
        for pmid in ("1","2","3"):self.add(pmid)
        self.decide("1",status="retain");self.decide("2",status="unclear")
        value=self.registry.publish_progress();stage=value["stages"]["R2"]
        self.assertEqual([stage[k]for k in ["entered","screening_finished","retained","excluded","unclear"]],[3,2,1,0,1])
        self.assertEqual(stage["unclear_reports"],[{"pmid":"2","reason":"Recorded reason"}])
        self.assertNotIn("old",json.dumps(value));self.assertNotIn("new",json.dumps(value))

    def test_decision_history_is_not_overwritten(self):
        self.add();self.decide()
        with self.assertRaises(ValueError):self.decide(status="exclude")
        self.decide(status="exclude",key="new-reason")
        self.assertEqual(self.registry.db.execute("SELECT COUNT(*) FROM decisions").fetchone()[0],2)

    def test_fragment_namespaces_all_decision_and_graph_links(self):
        self.add();self.decide()
        for task_id in ("part-a","part-b"):
            self.registry.save_fragment(task_id,"1","R3","retain","Actual melanoma treatment report",graph(),{"sha256":task_id})
        task={"task_id":"part-a","stage":"R3","metadata":{"pmid":"1","article_task_ids":["part-a","part-b"]}}
        self.assertTrue(aggregate_fragments(self.registry,task))
        payload=self.registry.latest("1","R3")["payload"]
        self.assertEqual(payload["decision"]["evidence_ids"],["part-a:E1","part-b:E1"])
        self.assertEqual({e["entity_id"]for e in payload["entities"]},{"part-a:P1","part-b:P1"})
        self.assertEqual(payload["facts"][1]["model_id"],"part-b:M1")
        self.assertEqual(payload["facts"][0]["numbers"][0]["value"],0)

    def test_partial_and_conflicting_sections_do_not_claim_finished_retention(self):
        self.add();self.decide()
        self.registry.save_fragment("a","1","R3","retain","Human study",graph(),{})
        task={"task_id":"a","stage":"R3","metadata":{"pmid":"1","article_task_ids":["a","b"]}}
        self.assertFalse(aggregate_fragments(self.registry,task));self.assertIsNone(self.registry.latest("1","R3"))
        self.registry.save_fragment("b","1","R3","exclude","Different source scope",graph("exclude"),{})
        self.assertTrue(aggregate_fragments(self.registry,task))
        self.assertEqual(self.registry.latest("1","R3")["status"],"unclear")

    def test_whole_units_and_oversized_gap_are_conserved(self):
        self.add()
        config={"R3_output_tokens":16384,"R3_output_ceiling":32768}
        blocks=[{"source_id":"source","block_id":"title","text":"Title: Melanoma treatment"},
                {"source_id":"source","block_id":"table","text":"Entire table header: N=25; response=2."},
                {"source_id":"source","block_id":"huge","text":"X"*150000}]
        doc={"blocks":blocks,"raw_ref":{},"limitations":[]}
        tasks,gaps=pack_fulltext(self.root,citation(),doc,graph(),config)
        self.assertEqual(len(tasks),1);self.assertEqual(gaps[0]["block_id"],"huge")
        source=json.loads((self.root/tasks[0]["metadata"]["source_ref"]["path"]).read_bytes())
        self.assertEqual(source["blocks"][1]["text"],blocks[1]["text"])
        self.assertFalse(source["blocks"][0]["is_target"])

    def test_field_failure_does_not_discard_valid_decision_and_other_fact(self):
        self.add()
        pipeline=Pipeline.__new__(Pipeline);pipeline.root=self.root;pipeline.registry=self.registry;pipeline.publish=lambda **kwargs:None
        source={"pmid":"1","stage":"R2"};atomic_json(self.root/"source.json",source)
        task={"task_id":"one","stage":"R2","model":"gpt-6.1-sol","metadata":{"pmid":"1","source_ref":reference(self.root,"source.json")}}
        payload=graph();bad=deepcopy(payload["facts"][0]);bad["fact_id"]="BAD";payload["facts"].append(bad)
        view={"decision_valid":True,"normalized_payload":payload,"validated_facts":payload["facts"][:1],
              "validated_models":payload["models"],"validated_entities":payload["entities"],"evidence":payload["evidence"],
              "fact_results":[{"fact_id":"BAD","status":"held","errors":["Actual source conflict"]}],"model_results":[],
              "field_coverage_errors":[],"counts":{"source_checked_facts":1,"held_facts":1}}
        body={"model":"gpt-6.1-sol","instructions":"Original review policy","input":json.dumps({"source_sha256":schema.digest(source)}),"text":{"format":{"schema":{}}}}
        sha=digest(canonical(body))
        atomic_json(self.root/"request.json",{"task_id":"one","provider":"openai","endpoint":"https://api.openai.com/v1/responses","body":body,"body_sha256":sha})
        for name in ["schema","normalization","validation","regimen_validation","screening","pipeline"]:
            atomic_json(self.root/"src/metamelanoma"/(name+".py"),{"test_producer":name})
        result={"status":"completed","payload":payload,"artifacts":{"request":reference(self.root,"request.json")},"request_body_sha256":sha}
        atomic_json(self.root/"native-result.json",result)
        result["artifacts"]["result"]=reference(self.root,"native-result.json")
        with patch("metamelanoma.pipeline.validation.validate",return_value=view):pipeline.on_result(task,result)
        decision=self.registry.latest("1","R2")
        self.assertEqual(decision["status"],"retain");self.assertEqual(len(decision["payload"]["facts"]),1)
        self.assertEqual(decision["payload"]["source_checked_counts"]["held_facts"],1)

    def test_offline_fragment_revision_preserves_both_views(self):
        self.add();first=graph();second=deepcopy(first);second["limitations"].append("Cutoff remains unlinked")
        self.registry.save_fragment("one","1","R2","retain","Reason",first,{"sha256":"old"})
        with self.assertRaises(ValueError):self.registry.save_fragment("one","1","R2","retain","Reason",second,{"sha256":"new"})
        self.registry.save_fragment("one","1","R2","retain","Reason",second,{"sha256":"new"},revision_reason="Source normalization repair")
        self.assertEqual(self.registry.db.execute("SELECT COUNT(*) FROM fragment_history").fetchone()[0],2)
        self.assertEqual(self.registry.fragments(["one"])[0]["payload"],second)

    def test_secret_reference_is_rejected_before_read(self):
        folder=self.root/"private.env";folder.mkdir();(folder/"source.json").write_text("{}")
        with patch.object(Path,"read_bytes",side_effect=AssertionError("Secret content was read")):
            with self.assertRaises(ValueError):verified_json(self.root,{"path":"private.env/source.json","sha256":"wrong"})
            with self.assertRaises(ValueError):reference(self.root,"private.env/source.json")

    def test_sqlite_sidecar_alias_is_rejected_before_connect(self):
        other=self.root/"other";other.write_text("placeholder")
        self.registry.close()
        sidecar=self.root/"data/current/articles.sqlite3-journal";sidecar.symlink_to(other)
        with patch("metamelanoma.registry.sqlite3.connect",side_effect=AssertionError("Connected to aliased SQLite")):
            with self.assertRaises(ValueError):Registry(self.root)
        sidecar.unlink();self.registry=Registry(self.root)

    def gate_fixture(self):
        config={"models":schema.MODELS,"R2_output_tokens":8192,"R2_output_ceiling":16384,"producer_files":[]}
        atomic_json(self.root/"config/pipeline.json",config)
        atomic_json(self.root/"data/current/cleanup_complete.json",{"status":"complete"})
        pipeline=Pipeline.__new__(Pipeline);pipeline.root=self.root;pipeline.config=config
        pipeline.config_ref=reference(self.root,"config/pipeline.json");pipeline.allowed={"1"}
        task=make_task(self.root,citation(),screening.build_source(citation()),config)
        return pipeline,task

    def test_gate_checks_bound_source_not_self_asserted_hash(self):
        pipeline,task=self.gate_fixture();pipeline.gate(task)
        changed=deepcopy(task);changed["body"]["input"]="Unrelated data"
        changed["metadata"]["body_core_sha256"]=digest(canonical({k:v for k,v in changed["body"].items()if k!="max_output_tokens"}))
        with self.assertRaises(PermissionError):pipeline.gate(changed)

    def test_gate_limits_cap_variants_and_dangling_hold(self):
        pipeline,task=self.gate_fixture();changed=deepcopy(task)
        changed["body"]["max_output_tokens"]=32768
        with self.assertRaises(PermissionError):pipeline.gate(changed)
        (self.root/"data/current/HOLD").symlink_to(self.root/"missing")
        with self.assertRaises(PermissionError):pipeline.gate(task)

    def test_executor_hold_propagates_before_another_stage(self):
        pipeline=Pipeline.__new__(Pipeline);pipeline.root=self.root;pipeline.tasks={};pipeline.journal=object();pipeline.transport=None
        pipeline.registry=self.registry
        pipeline.config={"max_workers":32,"max_attempts":3,"not_after_utc":"2030-01-01T00:00:00+00:00"}
        pipeline.rate_limits=object();pipeline.publish=lambda **kwargs:None
        task={"task_id":"task","stage":"R2","metadata":{}}
        with patch("metamelanoma.pipeline.execute",return_value={"phase":"held","stop_reason":"provider_account_action_required"}) as run:
            with self.assertRaises(PipelineHeld):pipeline.execute_tasks([task])
        self.assertEqual(run.call_count,1)

    def test_disabled_or_unknown_route_never_opens_direct_openai_journal(self):
        for config in [{'provider':'unknown-provider'}, {'provider':'openai','direct_OpenAI_dispatch_enabled':False}]:
            pipeline=Pipeline.__new__(Pipeline);pipeline.root=self.root;pipeline.config=config;pipeline.guard_environment=lambda:None
            with patch('metamelanoma.pipeline.Journal') as journal:
                with self.assertRaises(PermissionError):pipeline.open_execution_route()
                journal.assert_not_called()

    def test_actual_website_publisher_import_and_absence_only_record(self):
        self.add()
        self.registry.save_decision("1","R2","availability:1","exclude","Scientific abstract unavailable in checked source",{"facts":[],"models":[]},{})
        self.assertEqual(self.registry.clinical_articles(),[])
        project=Path(__file__).resolve().parents[2];folder=self.root/"website/scripts";folder.mkdir(parents=True)
        for filename in ["article_progress.py","clinical_evidence.py","regimen_projection.cjs"]:
            shutil.copyfile(project/"website/scripts"/filename,folder/filename)
        dist=self.root/"website/dist";dist.mkdir(parents=True)
        for filename in ["regimen_definitions.js","treatment_groups.js","regimen_source_rules.js"]:
            shutil.copyfile(project/"website/dist"/filename,dist/filename)
        old=sys.modules.pop("article_progress",None);before=list(sys.path)
        pipeline=Pipeline.__new__(Pipeline);pipeline.root=self.root;pipeline.registry=self.registry;pipeline._last_publish=0
        try:
            pipeline.publish(force=True)
            result=json.loads((self.root/"website/dist/data/clinical_evidence.json").read_bytes())
            self.assertEqual(result["articles"],[]);self.assertEqual(sys.path,before)
        finally:
            sys.modules.pop("article_progress",None)
            if old is not None:sys.modules["article_progress"]=old

    def test_ready_r2_runs_before_unrelated_abstract_recovery(self):
        ready=citation("1");missing={**citation("2"),"abstract":""}
        self.registry.add_articles([ready,missing],PHASE)
        pipeline=Pipeline.__new__(Pipeline);pipeline.root=self.root;pipeline.registry=self.registry
        pipeline.config={"baseline":{},"R2_output_tokens":8192,"R2_output_ceiling":16384,"max_workers":32}
        pipeline.guard_environment=lambda:None;pipeline.publish=lambda **kwargs:None
        events=[]
        def dispatch(tasks,**kwargs):
            if tasks:events.append("dispatch")
            for task in tasks:
                pmid=task["metadata"]["pmid"]
                self.registry.save_decision(pmid,"R2","test:"+pmid,"exclude","Not original human treatment research",graph("exclude"),{})
        pipeline.execute_tasks=dispatch
        def recover(citations):
            self.assertIsNotNone(self.registry.latest("1","R2"))
            events.append("recovery")
            return {"2":{"abstract":"Recovered melanoma abstract", "abstract_check_status":"recovered"}}
        with patch("metamelanoma.pipeline.Journal") as journal,patch("metamelanoma.pipeline.PublicSources") as provider:
            journal.return_value.status.return_value={}
            provider.return_value.recover_abstracts.side_effect=recover
            pipeline.run()
        self.assertEqual(events,["dispatch","recovery","dispatch"])
        self.assertEqual(self.registry.article("2")["abstract"],"Recovered melanoma abstract")

    def test_verified_r3_batches_run_before_all_later_sources_are_fetched(self):
        for n in range(1,6):
            self.registry.add_articles([citation(str(n))],PHASE)
            self.decide(str(n))
        pipeline=Pipeline.__new__(Pipeline);pipeline.root=self.root;pipeline.registry=self.registry
        pipeline.config={"baseline":{},"max_workers":2}
        pipeline.guard_environment=lambda:None;pipeline.publish=lambda **kwargs:None
        fetched=[];batches=[]
        def fetch(row):
            fetched.append(row["pmid"])
            return {"main_full_text_verified":True,"raw_ref":{},"source_sha256":row["pmid"]}
        def pack(root,row,document,upstream,config):
            return [{"task_id":"r3-"+row["pmid"],"stage":"R3"}],[]
        def dispatch(tasks,**kwargs):
            if tasks:batches.append((len(tasks),len(fetched)))
        pipeline.execute_tasks=dispatch
        with patch("metamelanoma.pipeline.Journal") as journal,patch("metamelanoma.pipeline.PublicSources") as provider,patch("metamelanoma.pipeline.pack_fulltext",side_effect=pack):
            journal.return_value.status.return_value={}
            provider.return_value.recover_abstracts.return_value={}
            provider.return_value.fulltext.side_effect=fetch
            pipeline.run()
        self.assertEqual(batches,[(2,2),(2,4),(1,5)])

    def test_requested_chemotherapy_routing_keeps_separate_group_independent(self):
        for pmid,priority in [("1","deferred"),("2","separate")]:
            self.registry.add_articles([citation(pmid)],PHASE)
            payload=graph();payload["treatment_policy"]={"priority":priority}
            self.registry.save_decision(pmid,"R2","decision:"+pmid,"retain","Original treated cohort",payload,{})
        pipeline=Pipeline.__new__(Pipeline);pipeline.root=self.root;pipeline.registry=self.registry
        pipeline.config={"baseline":{},"max_workers":128,"include_deferred_treatments":True,"include_separate_treatments":False}
        pipeline.guard_environment=lambda:None;pipeline.publish=lambda **kwargs:None;pipeline.execute_tasks=lambda *args,**kwargs:None
        fetched=[]
        def fetch(row):
            fetched.append(row["pmid"])
            return {"main_full_text_verified":True,"raw_ref":{},"source_sha256":row["pmid"]}
        with patch("metamelanoma.pipeline.Journal")as journal,patch("metamelanoma.pipeline.PublicSources")as provider,patch("metamelanoma.pipeline.pack_fulltext",return_value=([],[])):
            journal.return_value.status.return_value={};provider.return_value.recover_abstracts.return_value={};provider.return_value.fulltext.side_effect=fetch
            pipeline.run()
        self.assertEqual(fetched,["1"])
        from metamelanoma.prefetch import select
        selected,skipped=select(self.root,pipeline.config)
        self.assertEqual([row["pmid"]for row in selected],["1"])
        self.assertEqual([row["pmid"]for row in skipped],["2"])


if __name__=="__main__":unittest.main()
