"""Current packing regressions: temporary source files only, no clients/journals."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import types
import unittest

import test_scientific_contract as scientific
from metamelanoma import pipeline as p, schema as s, screening as b, validation as v

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'data/proposed_changes/r3_fragment_context_packing'
# The inactive derivative helper is a proposal fixture, never an active producer.
import importlib.util
prototype_spec=importlib.util.spec_from_file_location('footer_prototype_fixture',BASE/'contextual_footer_prototype.py')
prototype=importlib.util.module_from_spec(prototype_spec)
prototype_spec.loader.exec_module(prototype)
derive=prototype.derive

CONFIG = {'R3_output_tokens':16384, 'R3_output_ceiling':32768,
          'provider':'cornell_openai_gateway', 'service_tier':'default'}
PAIRS = {
    '9862627': ['r3-f33c370dee78703737341e97f84b', 'r3-9ec4699bd8663baa6ce1a900cd1b'],
    '15937544': ['r3-b9add4cd617a9277861c7d1803f9', 'r3-543acd1e61b1032e2f9fd358b4e3'],
}


def actual_document(pmid):
    sources = [json.loads((ROOT/'data/current/tasks'/task/'source.json').read_bytes())
               for task in PAIRS[pmid]]
    first = sources[0]
    return ({'pmid':pmid, 'report_id':first['report_id']},
            {'blocks':[block for source in sources for block in source['blocks']],
             'raw_ref':first['blocks'][0]['source_element']['raw_ref'],
             'limitations':first['limitations']}, first['upstream_R2'])


class FragmentContextTests(unittest.TestCase):
    def packed(self, document, upstream=None):
        temporary = TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        root = Path(temporary.name).resolve()
        tasks, gaps = p.pack_fulltext(root, {'pmid':'1','report_id':'r'}, document,
            upstream or {'decision':{'status':'retain'}}, CONFIG)
        sources = [json.loads((root/task['metadata']['source_ref']['path']).read_bytes()) for task in tasks]
        return tasks, gaps, sources

    def test_actual_PMC_HTML_citation_context_repeats_in_every_request(self):
        for pmid in PAIRS:
            citation, doc, upstream = actual_document(pmid)
            original = deepcopy(doc)
            with TemporaryDirectory() as directory:
                root = Path(directory).resolve()
                tasks, gaps = p.pack_fulltext(root, citation, doc, upstream, CONFIG)
                self.assertGreaterEqual(len(tasks), 2); self.assertFalse(gaps)
                expected = [dict(block,is_target=False) for block in doc['blocks']
                            if block.get('document_role') == 'citation']
                target_keys = []
                for task in tasks:
                    source = json.loads((root/task['metadata']['source_ref']['path']).read_bytes())
                    self.assertEqual([x for x in source['blocks'] if x['is_target'] is False],expected)
                    self.assertNotIn('Title:',expected[0]['text'][:6])
                    for block in source['blocks']:
                        if block.get('is_target') is not False:
                            target_keys.append((block['source_id'],block['block_id']))
                    self.assertLessEqual(len(s.canonical(task['body'])),120000)
                expected_keys = [(x['source_id'],x['block_id']) for x in doc['blocks']
                                 if x.get('document_role') != 'citation' and x.get('is_target') is not False]
                self.assertEqual(target_keys,expected_keys)
                self.assertEqual(doc,original)

    def test_context_numeric_result_stays_rejected_but_decision_can_use_context(self):
        source, _, payload = scientific.fixture()
        context = dict(source['blocks'][1],document_role='citation',is_target=False)
        target = {'source_id':'r:main','block_id':'footer','document_role':'main_article',
                  'is_target':True,'planned_only':False,'text':'The authors thank the study staff.'}
        source = b.build_source({'pmid':'1','report_id':'r'},'R3',[context,target],
            fulltext_verified=True,upstream_R2={'decision':{'status':'retain'}})
        span = b.catalog_for(source)['spans'][0]
        payload.update(stage='R3',source_sha256=s.digest(source))
        payload.update(arm_regimens=[],contrast_definitions=[])
        for fact in payload['facts']:fact['contrast_id']=None
        payload['evidence'][0]['span_id'] = span['span_id']
        result = v.validate(payload,source,request_schema=b.request_body(source)['text']['format']['schema'])
        self.assertTrue(result['decision_valid'])
        self.assertEqual(result['counts']['source_checked_facts'],0)
        self.assertEqual(result['counts']['held_facts'],1)
        self.assertEqual(payload['facts'][0]['numbers'][0]['value'],25)

    def test_legacy_title_abstract_context_is_unchanged(self):
        blocks = [{'source_id':'s','block_id':str(i),'text':text,'document_role':'main_article'}
                  for i,text in enumerate(['Title: Melanoma','Abstract: Clinical melanoma trial.',
                                          'Methods. Patients were treated.'])]
        _, gaps, sources = self.packed({'blocks':blocks,'raw_ref':{},'limitations':[]})
        self.assertFalse(gaps);self.assertEqual(len(sources),1)
        self.assertEqual([x['text'] for x in sources[0]['blocks'] if x.get('is_target') is False],
                         ['Title: Melanoma','Abstract: Clinical melanoma trial.'])
        self.assertEqual(sources[0]['blocks'][-1],blocks[-1])

    def test_explicit_non_target_context_without_prefix_is_never_promoted(self):
        blocks = [{'source_id':'s','block_id':'context','text':'Patients received treatment.',
                   'document_role':'main_article','is_target':False}]
        tasks, gaps, sources = self.packed({'blocks':blocks,'raw_ref':{},'limitations':[]})
        self.assertEqual((tasks,gaps,sources),([],[],[]))

    def test_whole_table_unit_and_gap_remain_exact(self):
        small = {'source_id':'s','block_id':'table1','text':'<table><tr><td>0</td><td>25</td></tr></table>',
                 'document_role':'main_article','is_target':True}
        huge = {'source_id':'s','block_id':'table2','text':'x'*150000,
                'document_role':'main_article','is_target':True}
        _, gaps, sources = self.packed({'blocks':[small,huge],'raw_ref':{},'limitations':[]})
        self.assertEqual(sources[0]['blocks'],[small]);self.assertEqual(len(gaps),1)
        self.assertEqual(gaps[0]['block_id'],'table2')
        self.assertIn('not truncated',gaps[0]['reason'])

    def test_fresh_output_override_changes_only_new_task_cap_not_the_historical_floor(self):
        source = b.build_source({'pmid':'1','report_id':'r'},'R3',
            'Twenty-five melanoma patients received treatment.',fulltext_verified=True,
            upstream_R2={'decision':{'status':'retain'}})
        config = {**CONFIG,'R3_fresh_output_tokens':32768}
        original = deepcopy(config)
        with TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            fresh = p.make_task(root,{'pmid':'1','report_id':'r'},source,config)
            legacy = p.make_task(root,{'pmid':'1','report_id':'r'},source,CONFIG)
            self.assertEqual(fresh['body']['max_output_tokens'],32768)
            self.assertEqual(legacy['body']['max_output_tokens'],16384)
            left=deepcopy(fresh['body']);left['max_output_tokens']=16384
            self.assertEqual(left,legacy['body']);self.assertEqual(fresh['task_id'],legacy['task_id'])
            self.assertEqual(fresh['metadata']['source_ref'],legacy['metadata']['source_ref'])
            self.assertEqual(fresh['metadata']['max_output_tokens_ceiling'],32768)
            self.assertEqual(config,original);self.assertEqual(config['R3_output_tokens'],16384)

    def test_saved_registered_16k_task_is_restored_without_fresh_recreation(self):
        source=b.build_source({'pmid':'1','report_id':'r'},'R3',
            'Twenty-five melanoma patients received treatment.',fulltext_verified=True,
            upstream_R2={'decision':{'status':'retain'}})
        with TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            task=p.make_task(root,{'pmid':'1','report_id':'r'},source,CONFIG)
            task['metadata']['article_task_ids']=[task['task_id']]
            path=root/'saved.json';path.write_bytes(s.canonical(task))
            from metamelanoma.io import reference
            class Journal:
                db=types.SimpleNamespace(execute=lambda *args:types.SimpleNamespace(fetchall=lambda:[{'task_id':task['task_id']}]))
                def current_task_ref(self,task_id):return reference(root,path)
                def task(self,task_id):return {'identity':{'task_id':task['task_id'],'stage':'R3','model':task['model'],
                    'body_sha256':s.digest(task['body']),'metadata':task['metadata']}}
            restored=p.registered_article_tasks(root,Journal(),'1')
            self.assertEqual(restored,[task]);self.assertEqual(restored[0]['body']['max_output_tokens'],16384)

    def test_invalid_fresh_output_override_fails_request_guard(self):
        source=b.build_source({'pmid':'1','report_id':'r'},'R3',
            'Twenty-five melanoma patients received treatment.',fulltext_verified=True,
            upstream_R2={'decision':{'status':'retain'}})
        with TemporaryDirectory() as directory:
            for cap in [32769,'32768',False,0]:
                with self.subTest(cap=cap),self.assertRaises(ValueError):
                    p.make_task(Path(directory).resolve(),{'pmid':'1','report_id':'r'},source,
                                {**CONFIG,'R3_fresh_output_tokens':cap})


class ContextualFooterPrototypeTests(unittest.TestCase):
    def fixture(self):
        source,_,sibling = scientific.fixture()
        source = b.build_source({'pmid':'1','report_id':'r'},'R3',source['blocks'],
            fulltext_verified=True,upstream_R2={'decision':{'status':'retain'}})
        sibling.update(stage='R3',source_sha256=s.digest(source))
        footer = {'source_id':'r:main','block_id':'footer','document_role':'main_article',
                  'text':'The authors thank the study staff.','is_target':True,'planned_only':False}
        tail_source = b.build_source({'pmid':'1','report_id':'r'},'R3',[footer],
            fulltext_verified=True,upstream_R2={'decision':{'status':'retain'}})
        tail = deepcopy(sibling)
        tail.update(source_sha256=s.digest(tail_source),facts=[],models=[],entities=[],
                    evidence=[{'evidence_id':'footer','span_id':b.catalog_for(tail_source)['spans'][0]['span_id']}])
        tail['decision']['evidence_ids']=[]
        document={'pmid':'1','report_id':'r','main_full_text_verified':True,
                  'blocks':deepcopy(source['blocks'])+[footer]}
        return tail,tail_source,sibling,source,document

    def test_zero_graph_derivative_is_explicit_and_preserves_originals(self):
        args=self.fixture();original=deepcopy(args)
        result=derive(*args,sibling_request_schema=s.SCHEMA)
        self.assertEqual(args,original)
        self.assertTrue(result['validation']['decision_valid'])
        self.assertFalse(result['is_native_response']);self.assertFalse(result['full_R3_extraction_complete'])
        self.assertEqual(result['new_scientific_facts'],0)
        self.assertEqual([x for x in result['source']['blocks'] if x['is_target']],args[1]['blocks'])
        self.assertTrue(all(x['is_target'] is False for x in result['source']['blocks'][:-1]))
        for key in ('facts','models','entities','treatment_context','field_coverage','limitations'):
            self.assertEqual(result['payload'][key],args[0][key])

    def test_foreign_identity_changed_main_unit_scientific_graph_or_invalid_sibling_rejected(self):
        for change in ('identity','primary_text','new_fact','sibling_anchor'):
            args=list(self.fixture())
            if change=='identity':args[3]['pmid']='2'
            elif change=='primary_text':args[4]['blocks'][-1]['text']='Changed footer'
            elif change=='new_fact':args[0]['facts']=deepcopy(args[2]['facts'])
            else:args[2]['decision']['evidence_ids']=['foreign']
            with self.subTest(change=change),self.assertRaises(ValueError):
                derive(*args,sibling_request_schema=s.SCHEMA)

    def test_two_actual_prototypes_pass_unchanged_whole_validator_without_new_numbers(self):
        audit=json.loads((BASE/'ACTUAL_TWO_FOOTER_PROTOTYPES_AUDIT.json').read_bytes())
        self.assertEqual(len(audit['outputs']),2)
        for ref in audit['outputs']:
            raw=(ROOT/ref['path']).read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),ref['sha256'])
            proposal=json.loads(raw);source=proposal['source'];payload=proposal['payload']
            view=v.validate(payload,source,request_schema=s.report_schema(b.catalog_for(source),source=source))
            self.assertEqual(view,proposal['validation']);self.assertTrue(view['decision_valid'])
            self.assertEqual(view['counts'],{'source_checked_facts':0,'held_facts':0})
            self.assertTrue(proposal['original_native_status_unchanged'])
            self.assertFalse(proposal['is_native_response'])


if __name__ == '__main__':
    unittest.main()
