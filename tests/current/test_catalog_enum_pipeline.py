"""Current request, immutable repair and registered article-plan regressions."""
from copy import deepcopy
import importlib
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import test_catalog_enum_schema as contracts
from metamelanoma import schema as s, screening as b, pipeline as p
from metamelanoma import accounting as a, transport as t, gateway as g
from metamelanoma.io import atomic_json, canonical, digest, reference

package = 'metamelanoma'


def legacy_request_body(*args, **kwargs):
    """Reconstruct the exact prior request contract using the current source builder."""
    body=b.request_body(*args, **kwargs)
    body['instructions']=b.LEGACY_PROMPT
    body['text']['format']['schema']=deepcopy(s.SCHEMA)
    return body


def source():
    result = b.build_source({'pmid':'1','report_id':'r'}, 'R3',
        'Twenty-five patients with melanoma were treated. The hazard ratio for overall survival was 0.7 (95% CI 0.5–0.9). No deaths occurred.',
        fulltext_verified=True, upstream_R2={'report_id':'r','decision':{'status':'unclear','reason':'Abstract linkage unresolved'}})
    result['prior_clinical_facts'] = {'evidence':[{'evidence_id':'old','span_id':'span-prior-R2-context'}]}
    return result


class RequestAndPipelineTests(unittest.TestCase):
    def test_last_sent32k_keeps_input_high_model_and_cap_and_changes_only_reviewed_contract(self):
        src = source(); parent = legacy_request_body(src,max_output_tokens=32768)
        revised = b.catalog_enum_repair_body(parent,src)
        self.assertEqual(revised['max_output_tokens'],32768)
        self.assertEqual(revised['input'],parent['input']); self.assertEqual(revised['reasoning'],{'effort':'high'})
        copy = deepcopy(revised); copy['instructions'] = parent['instructions']
        for key in ('report_id','pmid','stage','source_sha256'):
            copy['text']['format']['schema']['properties'][key] = parent['text']['format']['schema']['properties'][key]
        copy['text']['format']['schema']['$defs']['evidence']['properties']['span_id'] = {'type':'string'}
        self.assertEqual(copy,parent)
        self.assertEqual(revised['instructions'],parent['instructions'].replace(b._OLD_R3_SENTENCE,b._NEW_R3_SENTENCE))

    def test_arbitrary_parent_prompt_input_model_or_schema_change_rejected(self):
        src=source(); parent=legacy_request_body(src)
        for key in ('instructions','input','model','schema'):
            bad=deepcopy(parent)
            if key=='schema':bad['text']['format']['schema']['required'].remove('decision')
            else:bad[key]+=' changed'
            with self.subTest(key=key),self.assertRaises(ValueError):b.catalog_enum_repair_body(bad,src)

    def test_enum_has_only_current_catalog_ids_and_does_not_mutate_shared_string_schema(self):
        src=source(); before=deepcopy(s.S); global_schema=deepcopy(s.SCHEMA)
        body=b.request_body(src); ids=body['text']['format']['schema']['$defs']['evidence']['properties']['span_id']['enum']
        self.assertEqual(ids,[x['span_id']for x in b.catalog_for(src)['spans']])
        self.assertNotIn('span-prior-R2-context',ids); self.assertEqual(s.S,before); self.assertEqual(s.SCHEMA,global_schema)
        other=source(); other['pmid']='2'; second=b.request_body(other)
        self.assertEqual(second['text']['format']['schema']['properties']['pmid']['enum'],['2'])
        self.assertEqual(body['text']['format']['schema']['properties']['pmid']['enum'],['1'])

    def test_fulltext_may_resolve_upstream_unclear_without_mutating_its_record(self):
        src=source(); catalog=b.catalog_for(src); payload=deepcopy(contracts.fixtures.fixture()[2])
        payload.update(stage='R3',source_sha256=s.digest(src)); payload['evidence'][0]['span_id']=catalog['spans'][0]['span_id']
        payload.update(arm_regimens=[],contrast_definitions=[])
        for fact in payload['facts']:fact['contrast_id']=None
        prior=deepcopy(src['upstream_R2'])
        result=contracts.v.validate(payload,src,request_schema=b.request_body(src)['text']['format']['schema'])
        self.assertTrue(result['decision_valid']); self.assertEqual(payload['decision']['status'],'retain')
        self.assertEqual(src['upstream_R2'],prior); self.assertEqual(prior['decision']['status'],'unclear')

    def test_140k_wire_is_gateway_typed_repair_only_native_transport_stays120k(self):
        from test_runtime import task
        value=task(stage='R3'); value['body']['input']='x'*121000
        value['metadata'].update(phase_id=a.PHASE_ID,provider='cornell_openai_gateway',wire_ceiling_bytes=140000,
            enum_repair={'kind':'current_sent_catalog_span_enum_only','old_body_sha256':'0'*64})
        with self.assertRaises(ValueError):a.validate_task(value)
        self.assertGreater(len(a.validate_task(value,wire_ceiling_bytes=a.reviewed_wire_ceiling(value))),120000)
        with TemporaryDirectory()as folder:
            root=Path(folder).resolve()
            with self.assertRaises(ValueError):t.NativeTransport(root=root).wire_for_task(value)
            self.assertGreater(len(g.GatewayTransport(root=root,expected_endpoint='https://fixture.cornell.edu/v1/responses').wire_for_task(value)),120000)
        for change in ('native','untyped','over140'):
            bad=deepcopy(value)
            if change=='native':bad['metadata']['provider']='openai'
            elif change=='untyped':bad['metadata'].pop('enum_repair')
            else:bad['body']['input']='x'*141000
            with self.subTest(change=change),self.assertRaises(ValueError):a.quote(bad)

    def test_fresh_packs_remain120k_and_whole_source_units_stay_exact(self):
        with TemporaryDirectory()as folder:
            root=Path(folder).resolve(); blocks=[{'source_id':'s','block_id':'one','text':'Whole table header; N25; response2.'},
                {'source_id':'s','block_id':'huge','text':'x'*150000}]
            tasks,gaps=p.pack_fulltext(root,{'pmid':'1','report_id':'r'},{'blocks':blocks,'raw_ref':{},'limitations':[]},
                {'decision':{'status':'unclear'}},{'R3_output_tokens':16384,'R3_output_ceiling':32768,'provider':'cornell_openai_gateway','service_tier':'default'})
            self.assertEqual(len(tasks),1); self.assertEqual(gaps[0]['block_id'],'huge')
            import json
            src=json.loads((root/tasks[0]['metadata']['source_ref']['path']).read_bytes())
            self.assertEqual(src['blocks'][0]['text'],blocks[0]['text']); self.assertLessEqual(len(a.canonical(tasks[0]['body'])),120000)
            self.assertNotIn('enum_repair',tasks[0]['metadata'])

    def test_revision_staging_keeps_original_task_json_and_calls_amend_before_executor(self):
        with TemporaryDirectory()as folder:
            root=Path(folder).resolve(); src=source(); ref=root/'source.json'; atomic_json(ref,src)
            parent=legacy_request_body(src); original={'task_id':'same-task','stage':'R3','model':parent['model'],'body':parent,
                'metadata':{'source_ref':reference(root,ref),'provider':'cornell_openai_gateway'}}
            path=root/'data/current/tasks/same-task/task.json'; atomic_json(path,original); saved=path.read_bytes()
            revised=deepcopy(original); revised['body']=b.catalog_enum_repair_body(parent,src)
            revised['metadata'].update(enum_repair={'kind':'current_sent_catalog_span_enum_only','old_body_sha256':s.digest(parent)},wire_ceiling_bytes=120000)
            events=[]; approval={'path':'authority.json','sha256':'0'*64,'bytes':1}
            def amend(task,authority):
                revision=root/'data/current/tasks/same-task/revisions'/s.digest(task)/'task.json'
                self.assertTrue(revision.exists()); self.assertEqual(path.read_bytes(),saved)
                self.assertEqual(revision.read_bytes(),canonical(task))
                self.assertEqual(authority,approval); events.append('amend')
            pipeline=p.Pipeline.__new__(p.Pipeline);pipeline.root=root;pipeline.tasks={};pipeline.journal=SimpleNamespace(amend_task=amend)
            pipeline.config={'catalog_enum_repair_ref':approval,'max_workers':1,'max_attempts':3,'not_after_utc':'2030-01-01T00:00:00+00:00'}
            pipeline.on_result=lambda *args:None;pipeline.progress=lambda *args:None;pipeline.gate=lambda *args:True
            pipeline.transport=None;pipeline.rate_limits=None;pipeline.publish=lambda **kwargs:None
            with patch.object(p,'execute',side_effect=lambda *args,**kwargs:events.append('execute')or{'phase':'finished'}):pipeline.execute_tasks([revised])
            self.assertEqual(events,['amend','execute']);self.assertEqual(path.read_bytes(),saved)

    def test_gate_allows_only_the_journal_checked16_to32_cap_variant(self):
        from test_runtime import task
        financial=importlib.import_module(package+'.gateway_accounting')
        with TemporaryDirectory()as folder:
            root=Path(folder).resolve();src=source();raw=root/'raw.xml';raw.write_bytes(b'fixture raw')
            config={'models':s.MODELS,'provider':'cornell_openai_gateway','service_tier':'default',
                    'R3_output_tokens':16384,'R3_output_ceiling':32768,'catalog_enum_repair_ref':{'fixture':'approval'}}
            base=p.make_task(root,{'pmid':'1','report_id':'r'},src,config)
            base['metadata'].update(enum_repair={'kind':'current_sent_catalog_span_enum_only','old_body_sha256':'0'*64},
                wire_ceiling_bytes=120000,raw_source_ref=reference(root,raw))
            variant=deepcopy(base);variant['body']['max_output_tokens']=32768
            pipeline=p.Pipeline.__new__(p.Pipeline);pipeline.root=root;pipeline.config=config;pipeline.allowed={'1'};pipeline.guard_environment=lambda:None
            with patch.object(financial,'validate_amended_task')as guard:
                pipeline.gate(variant)
                self.assertTrue(guard.call_args.kwargs['allow_output_cap_variant'])
                bad=deepcopy(variant);bad['body']['instructions']+=' changed'
                with self.assertRaises(PermissionError):pipeline.gate(bad)
            self.assertEqual(base['body']['max_output_tokens'],16384)

    def test_registered_whole_article_restores_original_group_order_and_rejects_missing_sibling(self):
        import json
        with TemporaryDirectory()as folder:
            root=Path(folder).resolve();tasks={};refs={}
            for name in ['part2','part1']:
                task={'task_id':name,'stage':'R3','model':s.MODELS['R3'],'body':{'input':'original '+name},
                      'metadata':{'pmid':'1','article_task_ids':['part1','part2']}}
                tasks[name]=task;path=root/(name+'.json');atomic_json(path,task);refs[name]=reference(root,path)
            class Journal:
                def __init__(self):self.ids=['part2','part1'];self.db=SimpleNamespace(execute=lambda*q:SimpleNamespace(fetchall=lambda:[{'task_id':k}for k in self.ids]))
                def current_task_ref(self,task_id):return refs[task_id]
                def task(self,task_id):
                    t=tasks[task_id]
                    return {'identity':{'task_id':task_id,'stage':'R3','model':t['model'],'body_sha256':s.digest(t['body']),'metadata':t['metadata']}}
            journal=Journal();restored=p.registered_article_tasks(root,journal,'1')
            self.assertEqual([t['task_id']for t in restored],['part1','part2'])
            self.assertEqual(restored,[tasks['part1'],tasks['part2']])
            partial=SimpleNamespace(fragments=lambda ids:[{'task_id':'part1','status':'retain'}],
                save_decision=lambda *args: self.fail('Partial article must not become a completed decision'))
            self.assertFalse(p.aggregate_fragments(partial,restored[0]))
            journal.ids=['part1']
            with self.assertRaises(p.PipelineHeld):p.registered_article_tasks(root,journal,'1')

    def test_registered_article_path_never_fetches_or_repacks_its_source_groups(self):
        citation={'pmid':'1','report_id':'r','doi':None,'pmcid':None}
        existing=[{'task_id':'part1','stage':'R3','metadata':{'source_gaps':[]}},
                  {'task_id':'part2','stage':'R3','metadata':{'source_gaps':[]}}]
        registry=SimpleNamespace(candidates=lambda phase,stage:[citation]if stage=='R3'else[],
            latest=lambda *args:{'payload':{'treatment_policy':{'priority':'core'}}},fragments=lambda ids:[],snapshot=lambda:{})
        with TemporaryDirectory()as folder:
            pipeline=p.Pipeline.__new__(p.Pipeline);pipeline.root=Path(folder).resolve();pipeline.registry=registry
            pipeline.config={'max_workers':2};pipeline.journal=SimpleNamespace(status=lambda:{},db=SimpleNamespace(execute=lambda query:[]))
            pipeline.open_execution_route=lambda:None;pipeline.publish=lambda **kwargs:None;sent=[]
            pipeline.execute_tasks=lambda tasks,**kwargs:sent.extend(t['task_id']for t in tasks)
            with patch.object(p,'registered_article_tasks',return_value=existing),patch.object(p,'PublicSources')as client,\
                    patch.object(p,'pack_fulltext',side_effect=AssertionError('Existing source must not be repacked')),\
                    patch.object(p,'atomic_json'),patch(package+'.prefetch.verified_cached_documents',return_value={}):
                client.return_value.recover_abstracts.return_value={};pipeline.run()
                client.return_value.fulltext.assert_not_called()
            self.assertEqual(sent,['part1','part2'])


if __name__=='__main__':unittest.main()
