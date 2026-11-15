"""Pure scientific fixtures; no HTTP, keys, journals, Registry or production writes."""
from copy import deepcopy
import importlib
from pathlib import Path
import sys,types,unittest

import test_scientific_contract as fixture

from metamelanoma import eligibility_repair as m
s=m.schema;b=m.screening;v=m.validation


def example():
    source,_,payload=fixture.fixture()
    source=b.build_source({'pmid':'1','report_id':'r'},'R3',source['blocks'],
        fulltext_verified=True,upstream_R2={'decision':{'status':'unclear','reason':'Title/abstract linkage unresolved'}})
    payload.update(stage='R3',source_sha256=s.digest(source))
    span=next(x for x in b.catalog_for(source)['spans']if 'Twenty-five' in x['text'])
    payload['evidence'][0]['span_id']=span['span_id']
    payload['decision']['evidence_ids']=['old-R2:foreign']
    original=v.validate(payload,source,request_schema=s.SCHEMA)
    compact={key:deepcopy(payload[key])for key in ('schema_id','report_id','pmid','stage','source_sha256','decision','treatment_context')}
    compact['decision']['evidence_ids']=[span['span_id']]
    compact['evidence']=[{'evidence_id':span['span_id'],'span_id':span['span_id']}]
    return source,original,compact


class CompactEligibilityTests(unittest.TestCase):
    def test_schema_contains_only_identity_and_three_requested_fields(self):
        source,_,compact=example();schema=m.request_schema(source)
        self.assertEqual(set(schema['properties']),{'schema_id','report_id','pmid','stage','source_sha256','decision','treatment_context','evidence'})
        self.assertTrue(s.check(compact,schema))
        bad=deepcopy(compact);bad['facts']=[]
        with self.assertRaises(ValueError):m.validate_output(bad,source)

    def test_exact_source_ids_only_and_reference_equality(self):
        source,_,compact=example();self.assertTrue(m.validate_output(compact,source))
        for change in ('span','evidence','decision','treatment','identity'):
            bad=deepcopy(compact)
            if change=='span':bad['evidence'][0]['span_id']='prior-R2:span'
            elif change=='evidence':bad['evidence'][0]['evidence_id']='prior-R2:ev'
            elif change=='decision':bad['decision']['evidence_ids']=['prior-R2:ev']
            elif change=='treatment':bad['treatment_context']['evidence_ids']=['prior-R2:ev']
            else:bad['pmid']='2'
            with self.subTest(change=change),self.assertRaises(ValueError):m.validate_output(bad,source)

    def test_two_different_owned_ids_cannot_be_paired(self):
        source,_,compact=example();bad=deepcopy(compact)
        bad['evidence'][0]['evidence_id']=b.catalog_for(source)['spans'][0]['span_id']
        with self.assertRaises(ValueError):m.validate_output(bad,source)

    def test_exact_last_input_options_and_source_catalog_are_preserved(self):
        source,_,_=example();parent=b.request_body(source,max_output_tokens=32768)
        body=m.request_body(source,parent_body=parent)
        self.assertEqual(body['input'],parent['input']);self.assertEqual(body['max_output_tokens'],8192)
        for key in set(parent)-{'instructions','max_output_tokens','text'}:self.assertEqual(body[key],parent[key])
        self.assertEqual(body['reasoning'],{'effort':'high'});self.assertEqual(body['service_tier'],'default')

    def test_foreign_source_and_unapproved_route_options_rejected(self):
        source,_,_=example();parent=b.request_body(source)
        for key in ('input','model','reasoning','service_tier'):
            bad=deepcopy(parent)
            if key=='input':bad[key]='{}'
            elif key=='reasoning':bad[key]={'effort':'low'}
            else:bad[key]='foreign'
            with self.subTest(key=key),self.assertRaises(ValueError):m.request_body(source,parent_body=bad)
        for cap in (16384,False,'8192'):
            with self.assertRaises(ValueError):m.request_body(source,parent_body=parent,max_output_tokens=cap)

    def test_revision_keeps_source_and_logical_task_id_while_narrowing_output(self):
        source,_,_=example();body=b.request_body(source,max_output_tokens=32768)
        task={'task_id':'same-id','stage':'R3','model':s.MODELS['R3'],'body':body,
            'metadata':{'pmid':'1','report_id':'r','source_ref':{'path':'original-source.json','sha256':'a'*64},
                'enum_repair':{'kind':'old'},'wire_ceiling_bytes':140000,'max_output_tokens_ceiling':32768}}
        before=deepcopy(task);revised=m.make_revised_task(task,body,source)
        self.assertEqual(task,before);self.assertEqual(revised['task_id'],task['task_id'])
        self.assertEqual(revised['metadata']['source_ref'],task['metadata']['source_ref'])
        self.assertEqual(revised['metadata']['max_output_tokens_ceiling'],8192)
        self.assertNotIn('enum_repair',revised['metadata']);m.validate_task_body(revised,source,parent_body=body)
        revised['body']['instructions']+=' changed'
        with self.assertRaises(ValueError):m.validate_task_body(revised,source,parent_body=body)

    def test_valid_decision_closed_subset_keeps_every_prior_accepted_object(self):
        source,original,compact=example();before=deepcopy(original)
        self.assertFalse(original['decision_valid']);self.assertEqual(original['counts']['source_checked_facts'],1)
        result=m.derive_closed_subset(compact,source,original)
        self.assertEqual(original,before);self.assertTrue(result['validation']['decision_valid'])
        for key in ('facts','models','entities'):
            self.assertEqual(result['payload'][key],original['validated_'+key])
            self.assertEqual(result['previous_accepted_graph'][key],original['validated_'+key])
        self.assertFalse(result['is_native_response']);self.assertFalse(result['clinical_verified'])
        self.assertFalse(result['pooling_eligible']);self.assertFalse(result['full_R3_extraction_complete'])

    def test_previously_held_number_cannot_be_promoted_by_new_decision(self):
        source,original,compact=example();raw=deepcopy(original['original_payload'])
        raw['facts'][0]['numbers'][0]['value']=99
        original=v.validate(raw,source,request_schema=s.SCHEMA)
        self.assertEqual(original['counts']['held_facts'],1)
        result=m.derive_closed_subset(compact,source,original)
        self.assertEqual(result['payload']['facts'],[]);self.assertEqual(result['deferred_original_fact_ids'],['f'])
        self.assertEqual(result['original_native_payload']['facts'][0]['numbers'][0]['value'],99)
        self.assertEqual(result['qualified']['source_checked_counts']['held_facts'],1)
        self.assertEqual(result['qualified']['validation_issues']['fact_results'],original['fact_results'])

    def test_unused_bad_native_evidence_and_coverage_do_not_poison_the_closed_subset(self):
        source,original,compact=example();raw=deepcopy(original['original_payload'])
        raw['evidence'].extend([{'evidence_id':'unused','span_id':'foreign'},
                                {'evidence_id':'unused','span_id':'foreign'}])
        raw['field_coverage'][0]['evidence_ids']=['prior-R2:bad']
        original=v.validate(raw,source,request_schema=s.SCHEMA)
        self.assertEqual(original['counts']['source_checked_facts'],1)
        self.assertTrue(original['field_coverage_errors'])
        result=m.derive_closed_subset(compact,source,original)
        self.assertEqual(result['payload']['facts'],original['validated_facts'])
        self.assertNotIn('unused',[e['evidence_id']for e in result['payload']['evidence']])
        self.assertEqual(result['payload']['field_coverage'][0]['status'],'unreviewed')
        self.assertEqual(result['payload']['field_coverage'][0]['evidence_ids'],[])
        self.assertEqual(result['original_coverage_rows_held_for_bad_references'],[raw['field_coverage'][0]])
        self.assertEqual(result['qualified']['validation_issues']['coverage'],original['field_coverage_errors'])

    def test_new_unsupported_retention_fails_unchanged_scientific_guard(self):
        source,original,compact=example()
        source['blocks'][0]['text']='Acknowledgments: the authors thank the editorial staff.'
        old=deepcopy(original['original_payload']);old['source_sha256']=s.digest(source)
        original=v.validate(old,source,request_schema=s.SCHEMA)
        compact['source_sha256']=s.digest(source)
        only_title=b.catalog_for(source)['spans'][0]['span_id']
        compact['evidence']=[{'evidence_id':only_title,'span_id':only_title}]
        compact['decision']['evidence_ids']=[only_title]
        with self.assertRaises(ValueError):m.derive_closed_subset(compact,source,original)

    def test_exclusion_has_empty_canonical_graph_but_retains_all_prior_private_objects(self):
        source,original,compact=example();compact['decision'].update(status='exclude',reason_code='ineligible_design',
            reason='A review report is excluded from original research eligibility.')
        result=m.derive_closed_subset(compact,source,original)
        self.assertTrue(result['prior_graph_kept_private_for_new_exclusion'])
        for key in ('facts','models','entities'):
            self.assertEqual(result['payload'][key],[])
            self.assertEqual(result['previous_accepted_graph'][key],original['validated_'+key])
        self.assertTrue(result['no_deletion_of_prior_evidence'])


if __name__=='__main__':unittest.main()
