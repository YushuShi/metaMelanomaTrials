import copy
import unittest

from metamelanoma import schema, quantitative as q
from metamelanoma.screening import build_source, catalog_for
from metamelanoma.complementary_resolution import (ResolutionContext, _possible_collision, _explicit_n,
                                                    _unique_numerator, _explicit_severe_zero,
                                                    _responder_denominator, _scale_probability_interval)
from test_complementary_contract import fixture, finding, rebind


def clinical_fixture(abstract):
    packet,payload=fixture()
    source=build_source({'report_id':'pmid:123','pmid':'123','title':'Melanoma trial','abstract':abstract})
    catalog=catalog_for(source)
    evidence=[catalog['spans'][-1]['span_id']]
    target=packet['targets'][0]
    record=q.empty_record(source)
    record['populations']=[{'id':'p','scope':'overall','label':'Melanoma patients','parent_id':'NA',
                            'melanoma_only':'yes','cutoff':'NA','evidence':evidence}]
    target.update(source_span_ids=evidence,record=record,source_sha256=record['source_sha256'])
    packet.update(source=source,source_catalog=catalog,source_documents=[
        {'stage':'R2','source_sha256':schema.digest(source),'span_ids':evidence}])
    rebind(packet,payload)
    return packet,payload


class ResolutionTests(unittest.TestCase):
    def test_confirmation_reconciles_operation_but_checks_clinical_content(self):
        packet, _ = fixture()
        ctx = ResolutionContext(packet)
        item = finding(packet, action='addition')
        self.assertEqual(ctx.resolve(item)['status'], 'confirmed')
        item['value_json'] = '49'
        self.assertIsNone(ctx.resolve(item))
        item = finding(packet)
        item['target']['row_id'] = 'foreign'
        self.assertIsNone(ctx.resolve(item))

    def test_invalid_payload_and_nonliteral_quote_are_unresolved(self):
        packet, _ = fixture()
        ctx = ResolutionContext(packet)
        for change in [{'value_json':'bad-json'}, {'expected_value_json':None},
                       {'evidence':[{'span_id':'impossible','quote':'short'}]}]:
            item = finding(packet)
            item.update(change)
            self.assertIsNone(ctx.resolve(item))
        item = finding(packet)
        item['evidence'][0]['quote'] = 'The ratio was 0.75.'
        self.assertIsNone(ctx.resolve(item))

    def test_repaired_ci_requires_own_row_companion_bound_and_level(self):
        packet, payload = fixture()
        row = packet['targets'][0]['record']['effects'][0]
        row['ci_upper'] = 'NA'
        rebind(packet, payload)
        ctx = ResolutionContext(packet)
        item = finding(packet, section='effects', row='hr', path='/effects/0/ci_upper',
                       action='correction', expected='NA', value=.98)
        item['evidence'][0]['quote'] = 'The overall survival hazard ratio was 0.70 (95% CI 0.50-0.98).'
        result = ctx.resolve(item)
        self.assertEqual(result['edits'], [{'field_path':'/effects/0/ci_upper', 'before':'NA', 'after':.98}])
        self.assertIn('0.50–0.98', result['evidence'][0]['quote'])
        self.assertEqual(row['ci_upper'],'NA')
        item['evidence'][0]['quote'] = 'Median progression-free survival was 1.38 months (95% CI 1.02–1.97).'
        item['value_json'] = '1.97'
        self.assertIsNone(ctx.resolve(item))

    def test_unscoped_bound_not_attached_to_nearby_hazard_ratio(self):
        packet, _ = fixture()
        item = finding(packet, section='effects', row='hr', path='/effects/0/p_value',
                       action='correction', expected='NA', value='<0.05')
        item['evidence'][0]['quote'] = 'P<0.05 by logrank test.'
        result = ResolutionContext(packet).resolve(item)
        self.assertIsNone(result)

    def test_missing_target_document_does_not_rewrite_abstract(self):
        packet, payload = fixture()
        packet['source_documents'][0]['stage'] = 'R3'
        rebind(packet, payload)
        self.assertIsNone(ResolutionContext(packet).resolve(finding(packet)))

    def test_new_documented_observation_saved_in_published_words(self):
        packet, _ = fixture()
        record = packet['targets'][0]['record']
        content = copy.deepcopy(record['sample_sizes'][0])
        content.update(id='n2', count_purpose='outcome_analysis', n=25)
        item = finding(packet, section='sample_sizes', row='n2', path='/sample_sizes/-',
                       action='addition', expected=None, value=content, relation='new_scope')
        item['evidence'][0]['quote'] = 'Twenty-five patients responded.'
        # The passage has the response numerator, not the number analysed. No
        # structured denominator may be created even if the parser found 25.
        result = ResolutionContext(packet).resolve(item)
        if result:
            self.assertEqual(result['note'], 'Twenty-five patients responded.')
            self.assertFalse(result['edits'])
        copy_of_original = copy.deepcopy(record)
        item = finding(packet, section='effects', row='hr', path='/effects/0/endpoint_definition',
                       action='confirmed',expected='overall survival',value='overall survival')
        self.assertEqual(ResolutionContext(packet).resolve(item)['status'], 'confirmed')
        self.assertEqual(record, copy_of_original)

    def test_unique_integer_requires_compatible_endpoint_and_rounding(self):
        row = {'endpoint':'ORR', 'percentage':34, 'denominator':50}
        self.assertTrue(_unique_numerator(row,17,'The objective response rate was 34%.'))
        self.assertFalse(_unique_numerator(row,18,'The objective response rate was 34%.'))
        self.assertFalse(_unique_numerator(row,17,'Thirty-four percent had stable disease.'))
        self.assertFalse(_unique_numerator(dict(row,denominator=1000),340,'The objective response rate was 34%.'))

    def test_whole_cohort_count_and_explicit_zero_are_purpose_specific(self):
        packet, _ = fixture()
        record = packet['targets'][0]['record']
        row = dict(record['sample_sizes'][0],n='NA')
        self.assertTrue(_explicit_n(record,row,50,'A total of 50 patients were treated.'))
        self.assertFalse(_explicit_n(record,row,50,'A total of 50 patients were enrolled.'))
        self.assertFalse(_explicit_n(record,row,50,'50 patients were treated at the lower dose.'))
        record['arms']=[{'id':'a'}]
        row={'population_id':'p','arm_id':'a','safety_attribution':'all_cause','assessment_time':'NA',
             'endpoint':'AE_grade_3_4'}
        self.assertTrue(_explicit_severe_zero(record,row,'numerator',0,
                                             'No grade 3 or 4 adverse events were reported in any patient.'))
        self.assertFalse(_explicit_severe_zero(record,row,'numerator',0,'Severe adverse events were not evaluated.'))
        self.assertFalse(_explicit_severe_zero(record,row,'numerator',0,
                                              'No grade 3 or 4 adverse events were reported in phase I.'))

    def test_new_marker_group_preserves_threshold_in_same_source_paragraph(self):
        packet,_=clinical_fixture('Using a 1% PD-L1 cutoff, 18 samples were positive and 10 samples were negative. '
                                  'Relapse occurred in 5 of 18 positive patients and 4 of 10 negative patients.')
        item=finding(packet,section='populations',row='new',path='/populations/-',action='addition',
                     expected=None,value={'id':'new','scope':'subgroup','parent_id':'p','melanoma_only':'yes',
                                          'label':'PD-L1 negative at 1% threshold'},relation='new_scope')
        item['evidence'][0]['quote']='Relapse occurred in 5 of 18 positive patients and 4 of 10 negative patients.'
        result=ResolutionContext(packet).resolve(item)
        self.assertEqual(result['status'],'supplement')
        self.assertIn('Using a 1% PD-L1 cutoff',result['note'])
        self.assertTrue(all(e['quote'] in packet['source']['blocks'][-1]['text'] for e in result['evidence']))

    def test_frequency_refinement_can_separate_route_from_schedule(self):
        packet,payload=clinical_fixture('Subjects received 840mg once daily by mouth in 28-day cycles until disease progression.')
        target=packet['targets'][0]
        target['record']['arms']=[{'id':'a','population_id':'p','label':'Ibrutinib',
                                   'nodes':[{'schedule':'once daily'}], 'evidence':target['source_span_ids']}]
        rebind(packet,payload)
        item=finding(packet,section='arms',row='a',path='/arms/0/nodes/0/schedule',action='addition',
                     expected='once daily',value='once daily in 28-day cycles until disease progression')
        self.assertEqual(ResolutionContext(packet).resolve(item)['status'],'amended')
        item['value_json']='"once daily in 14-day cycles until disease progression"'
        self.assertIsNone(ResolutionContext(packet).resolve(item))

    def test_self_contained_new_study_observation_rejects_unrelated_extracts(self):
        packet,_=clinical_fixture('Thirteen patients had a response. Sixty patients were treated.')
        item=finding(packet,section='sample_sizes',row='new',path='/sample_sizes/-',action='addition',
                     expected=None,value={'id':'new','count_purpose':'treated','n':60},relation='new_scope')
        item['evidence'][0]['quote']='Sixty patients were treated.'
        self.assertEqual(ResolutionContext(packet).resolve(item)['note'],'Sixty patients were treated.')
        item['evidence'][0]['quote']='Thirteen patients had a response.'
        self.assertIsNone(ResolutionContext(packet).resolve(item))

    def test_converts_paired_bounds_only_with_a_matching_point_and_level(self):
        row={'percentage':24,'ci_lower':.13,'ci_upper':.36,'ci_level':90}
        proof=[{'span_id':'s','quote':'ORR was 24% (90% CI=0.13, 0.36).'}]
        path='/binary/0/ci_lower'
        out=_scale_probability_interval('binary',row,path,'ci_lower',.13,13,proof)
        self.assertEqual([e['after'] for e in out['edits']],[13,36])
        self.assertIsNone(_scale_probability_interval('binary',dict(row,percentage=23),path,'ci_lower',.13,13,proof))
        self.assertIsNone(_scale_probability_interval('binary',dict(row,ci_level=95),path,'ci_lower',.13,13,proof))
        self.assertIsNone(_scale_probability_interval('effects',row,path,'ci_lower',.13,13,proof))
        self.assertIsNone(_scale_probability_interval('binary',row,path,'ci_lower',.13,13,
                          [{'span_id':'s','quote':'24% (90% CI=0.13%, 0.36%)'}]))

    def test_dor_removes_broad_fallback_only_when_fewer_responders_are_proven(self):
        binary={'endpoint':'ORR','arm_id':'a','population_id':'p','denominator':83,'percentage':12}
        row={'endpoint':'DOR','analysis_n':'NA','arm_id':'a','population_id':'p'}
        display={'status':'fallback','count_purpose':'treated','n':83,'count_ids':['n-treated']}
        path='/survival/0/display_n'
        quote=[{'span_id':'s','quote':'The median duration of response for the CR and PRs was 46.7 weeks.'}]
        out=_responder_denominator({'binary':[binary]},row,path,display,quote)
        self.assertEqual(out['edits'],[{'field_path':path+'/n','before':83,'after':'NA'}])
        self.assertIsNone(_responder_denominator({'binary':[dict(binary,percentage=100)]},row,path,display,quote))
        self.assertIsNone(_responder_denominator({'binary':[dict(binary,arm_id='another')]},row,path,display,quote))
        self.assertIsNone(_responder_denominator({'binary':[binary]},dict(row,analysis_n=10),path,display,quote))

    def test_collision_preserves_disagreement_between_two_values(self):
        a = {'endpoint':'ORR', 'population_id':'p', 'arm_id':'a', 'percentage':30}
        b = dict(a, percentage=48)
        self.assertTrue(_possible_collision('binary', a, [b]))
        self.assertFalse(_possible_collision('binary', a, [dict(b, arm_id='b')]))


if __name__ == '__main__':
    unittest.main()
