from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import shutil
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
import clinical_evidence as clinical


def fixture():
    citation={'pmid':'123','report_id':'report-'+'1'*24,'title':'Melanoma trial','year':2026}
    entity=lambda ident,kind,label:{'entity_id':ident,'kind':kind,'label':label,'population_scope':'melanoma',
                                  'parent_id':None,'evidence_ids':['E1']}
    number={'role':'estimate','status':'reported','value':0.8,'raw_text':'0.8','unit':'ratio','qualifier':'equal','missing_reason':None,'evidence_ids':['E1']}
    fact={'fact_id':'F1','domain':'efficacy_outcomes','field':'overall_survival_HR','status':'reported',
          'text':'Overall survival in melanoma patients','measure':'HR','clinical_endpoint_family':'overall_survival',
          'evidence_origin':'own_report_results','scope':'observed','reported_trial':None,'result_population_id':'P1',
          'arm_id':None,'experimental_arm_id':None,'comparator_arm_id':None,'endpoint_id':'O1','model_id':'M1',
          'cutoff_id':None,'contrast_type':'prognostic','count_context':'not_applicable','link_gaps':['cutoff'],
          'numbers':[number],'evidence_ids':['E1']}
    payload={'schema_id':'melanoma-clinical-review','report_id':citation['report_id'],'pmid':'123','stage':'R2','source_sha256':'a'*64,
             'decision':{'status':'retain'},'entities':[entity('P1','population','Melanoma patients'),entity('O1','endpoint','Overall survival')],
             'models':[{'model_id':'M1','family':'Cox','estimand':'Overall survival association','analysis_population_id':'P1','endpoint_id':'O1','cutoff_id':None,
                        'arm_ids':[],'contrast_type':'prognostic','adjusted_status':'unadjusted','evidence_origin':'own_report_results','scope':'observed','variables':[],'evidence_ids':['E1']}],
             'facts':[fact],'evidence':[{'evidence_id':'E1','span_id':'S1','quote':'Melanoma patients had overall survival HR 0.8.',
                                       'source_id':'PMC-source','block_id':'b1','is_target':True,'planned_only':False,'document_role':'main_article'}],
             'field_coverage':[],'limitations':[]}
    review={'pmid':'123','stage':'R2','status':'retain','reason':'Eligible treatment study','payload':payload,
            'source_ref':{'path':'data/private/native.json','sha256':'b'*64},'reviewed_at':'2026-11-02T00:00:00+00:00'}
    return {'citation':citation,'R2':review,'R3':None}


class Tests(unittest.TestCase):
    def test_structured_contrast_resolves_pair_and_preserves_actual_outcome_arm(self):
        a=fixture();p=a['R2']['payload'];f=p['facts'][0]
        for ident,label in [('A','Nivolumab plus ipilimumab'),('B','Nivolumab or pembrolizumab')]:
            p['entities'].append({'entity_id':ident,'kind':'arm','label':label,'population_scope':'not_applicable','parent_id':None,'evidence_ids':['E1']})
        p['contrast_definitions']=[{'contrast_id':'C','contrast_type':'treatment_comparison','experimental_arm_id':'A','reference_arm_id':'B','single_arm_id':None,'population_id':'P1','endpoint_id':'O1','cutoff_id':None,'evidence_ids':['E1']}]
        f.update(contrast_id='C',contrast_type='treatment_comparison')
        out=clinical.project_articles([a]);co=out['articles'][0]['comparisons'][0]
        self.assertEqual((co['intervention_arm_id'],co['comparator_arm_id']),('A','B'))
        self.assertEqual(co['kind'],'treatment_comparison')
        f.update(arm_id='B',experimental_arm_id='A',comparator_arm_id='B',contrast_type='single_arm',measure='median OS')
        f['numbers'][0].update(role='median',value=169,raw_text='169 days',unit='days')
        out=clinical.project_articles([a]);co=out['articles'][0]['comparisons'][0];row=out['articles'][0]['quantitative_results'][0]
        self.assertEqual(co['kind'],'arm_specific_result')
        self.assertEqual((co['intervention_arm_id'],co['comparator_arm_id'],co['outcome_arm_id']),('A','B','B'))
        self.assertEqual(row['arm']['entity_id'],'B');self.assertEqual(row['result_relation'],'arm_specific')
        self.assertEqual(row['original_fact'],f);self.assertFalse(row['pooling_eligible'])
        f['comparator_arm_id']='A'
        with self.assertRaisesRegex(ValueError,'directed contrast'):clinical.project_articles([a])

    def test_export_materializes_shared_definitions_without_altering_numerical_records(self):
        p=clinical.project_articles([fixture()]);before=deepcopy(p)
        output=clinical.materialize_regimens(p)
        self.assertEqual(p,before)
        for a,b in zip(p['articles'],output['articles']):
            self.assertEqual(a['quantitative_results'],b['quantitative_results'])
            for old,new in zip(a['comparisons'],b['comparisons']):
                self.assertEqual(old,{k:v for k,v in new.items() if k not in {'comparator_regimen','intervention_regimen','outcome_regimen'}})
                self.assertEqual(new['comparator_regimen']['source_binding']['comparison_id'],old['comparison_id'])

    def row(self,a):return clinical.project_articles([a])['articles'][0]['quantitative_results'][0]
    def test_own_clinical_graph_preserves_values_sources_and_partial_flags(self):
        a=fixture();before=deepcopy(a);out=clinical.project_articles([a]);row=out['articles'][0]['quantitative_results'][0]
        self.assertEqual(a,before);self.assertTrue(row['main_result_eligible']);self.assertEqual(row['estimate']['value'],.8)
        self.assertIsNone(row['confidence_level']['value']);self.assertIsNone(row['ci_lower']['value'])
        self.assertTrue(all(row[k]is False for k in clinical.FLAGS));self.assertFalse(out['pooling_eligible'])
        self.assertNotIn('data/private',json.dumps(out));self.assertIn('Melanoma patients had',json.dumps(out))
    def test_mixed_other_nonhuman_unknown_and_explicit_rcc_outcomes_are_details_only(self):
        for scope in ['mixed_cancers','other_cancer','nonhuman','unclear']:
            a=fixture();a['R2']['payload']['entities'][0]['population_scope']=scope;self.assertFalse(self.row(a)['main_result_eligible'])
        a=fixture();a['R2']['payload']['facts'][0]['text']='Overall survival in RCC patients';self.assertFalse(self.row(a)['main_result_eligible'])
    def test_mixed_melanoma_histologies_are_not_mixed_cancer_totals(self):
        for label in ['Patients with mixed histologies of melanoma',
                      'Melanoma of mixed histologies in enrolled patients',
                      'Melanoma with mixed histology in enrolled patients']:
            with self.subTest(label=label):
                a=fixture();a['R2']['payload']['entities'][0]['label']=label;before=deepcopy(a)
                row=self.row(a)
                self.assertTrue(row['main_result_eligible']);self.assertEqual(a,before)
                self.assertEqual(row['population']['label'],label)
                a['R2']['payload']['entities'][0]['population_scope']='mixed_cancers'
                self.assertFalse(self.row(a)['main_result_eligible'])
        for label in ['Patients with mixed histologies including melanoma',
                      'Patients with mixed histologies of melanoma and lung cancer']:
            with self.subTest(label=label):
                a=fixture();a['R2']['payload']['entities'][0]['label']=label
                self.assertFalse(self.row(a)['main_result_eligible'])
    def test_scope_peer_metastatic_organ_unicode_negation_endpoint_and_count_cases(self):
        a=fixture();a['R2']['payload']['entities'][0]['label']='Melanoma patients with lung metastases';self.assertTrue(self.row(a)['main_result_eligible'])
        a=fixture();p=a['R2']['payload'];p['entities'][0]['label']='Non‑melanoma patients';p['evidence'][0]['quote']='Non‑melanoma patients had overall survival HR 0.8.';self.assertFalse(self.row(a)['main_result_eligible'])
        a=fixture();a['R2']['payload']['entities'][1]['label']='Overall survival in RCC patients';self.assertFalse(self.row(a)['main_result_eligible'])
        a=fixture();p=a['R2']['payload'];p['entities'][0]['label']='Human melanoma cell lines';f=p['facts'][0];f['count_context']='treated';f['numbers'][0].update(role='sample_size',value=16,raw_text='16',unit='patients')
        self.assertEqual(clinical.project_articles([a])['articles'][0]['sample_size_records'],[])
    def test_cited_planned_pk_immune_and_simulation_do_not_become_clinical_effects(self):
        changes=[lambda p:p['facts'][0].update(evidence_origin='cited_other_report'),lambda p:p['facts'][0].update(scope='planned'),
                 lambda p:p['models'][0].update(family='population pharmacokinetic'),lambda p:p['facts'][0].update(measure='MFI'),
                 lambda p:p['facts'][0].update(text='Simulated overall survival'),lambda p:p['entities'][0].update(label='Human melanoma cell lines')]
        for change in changes:
            a=fixture();change(a['R2']['payload']);self.assertFalse(self.row(a)['main_result_eligible'])
    def test_explicit_ratio_and_survival_median_labels_are_display_aliases_only(self):
        cases=[('hazard_ratio','overall_survival','Overall survival','estimate',.8,'HR'),
               ('Median overall survival','overall_survival','Overall survival','median',24,'median'),
               ('median OS','overall_survival','Overall survival','estimate',24,'median'),
               ('median progression-free survival','progression_free_survival','Progression-free survival','median',8,'median')]
        for measure,family,label,role,value,alias in cases:
            with self.subTest(measure=measure):
                a=fixture();p=a['R2']['payload'];f=p['facts'][0]
                f.update(measure=measure,clinical_endpoint_family=family,text=label+' in melanoma patients');p['entities'][1]['label']=label
                f['numbers'][0].update(role=role,value=value,raw_text=str(value),unit='months' if alias=='median' else 'ratio')
                before=deepcopy(f);row=self.row(a)
                self.assertTrue(row['main_result_eligible']);self.assertEqual(row['display_measure'],alias)
                self.assertEqual(row['measure_verbatim'],measure);self.assertEqual(row['original_fact'],before)
                self.assertEqual(row['estimate']['value'],value);self.assertIsNone(row['analysis_n']['value'])
                self.assertFalse(row['pooling_eligible'])
    def test_display_aliases_preserve_scope_holds_and_do_not_reinterpret_log_ratios(self):
        for measure in ['log hazard ratio','median overall survival difference','median OS ratio']:
            a=fixture();a['R2']['payload']['facts'][0]['measure']=measure
            self.assertFalse(self.row(a)['main_result_eligible'])
        for change in [lambda p:p['facts'][0].update(evidence_origin='cited_other_report'),
                       lambda p:p['facts'][0].update(scope='planned'),
                       lambda p:p['entities'][0].update(population_scope='mixed_cancers')]:
            a=fixture();a['R2']['payload']['facts'][0]['measure']='hazard_ratio';change(a['R2']['payload'])
            self.assertFalse(self.row(a)['main_result_eligible'])
        a=fixture();a['R2']['payload']['facts'][0].update(measure='median OS',clinical_endpoint_family='response')
        self.assertFalse(self.row(a)['main_result_eligible'])
    def test_model_population_mismatch_and_foreign_model_cannot_supply_an_effect(self):
        a=fixture();p=a['R2']['payload'];parent=deepcopy(p['entities'][0]);parent['entity_id']='P2';parent['population_scope']='mixed_cancers';p['entities'].append(parent);p['models'][0]['analysis_population_id']='P2'
        self.assertFalse(self.row(a)['main_result_eligible'])
        p['facts'][0]['model_id']='missing'
        with self.assertRaisesRegex(ValueError,'model'):self.row(a)
    def test_response_category_does_not_become_orr_or_infer_denominator(self):
        a=fixture();p=a['R2']['payload'];f=p['facts'][0];f.update(field='complete_response',text='Complete response in six patients',measure='percentage',clinical_endpoint_family='response')
        p['entities'][1]['label']='Complete response';f['numbers'][0].update(role='percentage',value=37.5,raw_text='37.5%',unit='percent')
        f['numbers'].append({**deepcopy(f['numbers'][0]),'role':'denominator','value':16,'raw_text':'16','unit':'patients'})
        row=self.row(a);self.assertEqual(row['display_measure'],'CR');self.assertIsNone(row['denominator']['value'])
        self.assertEqual(row['source_reported_numbers'][1]['value'],16);self.assertIsNone(row['analysis_n']['value'])
    def test_actual_reported_response_aliases_preserve_source_values_and_units(self):
        cases=[('773589','Objective clinical response',28,6,21,
                'Patients receiving the combination as primary treatment',
                'The effects of adriamycin were compared to a combination program of methyl-CCNU and imidozole carboxamide (DTIC) in 44 patients with disseminated malignant melanoma. There were objective clinical responses in 6 of 21 patients with the combination of DTIC and methyl-CCNU who received this program as primary treatment and none in 23 patients receiving adriamycin as primary treatment.'),
               ('1000520','objective response rate',25,1,4,'Response-evaluable melanoma subgroup',
                'melanoma, 25% (one of four patients)'),
               ('1099501','objective_response_rate',20,None,84,'Response-evaluable melanoma patients',
                'An objective response rate of 20% was observed in 84 evaluable melanoma patients.')]
        for pmid,measure,percentage,numerator,denominator,population,quote in cases:
            with self.subTest(pmid=pmid):
                a=fixture();a['citation']['pmid']=pmid;a['R2']['pmid']=pmid;p=a['R2']['payload'];p['pmid']=pmid
                p['models']=[];p['entities'][0]['label']=population;p['entities'][1]['label']='Objective response';p['evidence'][0]['quote']=quote
                f=p['facts'][0];f.update(field='objective_response_rate',text='Reported objective response in the melanoma population',measure=measure,
                                        clinical_endpoint_family='response',model_id=None,contrast_type='single_arm')
                template=deepcopy(f['numbers'][0]);f['numbers']=[{**template,'role':'percentage','value':percentage,'raw_text':str(percentage),'unit':'%'}]
                if numerator is not None:f['numbers'].append({**template,'role':'numerator','value':numerator,'raw_text':str(numerator),'unit':'patients'})
                f['numbers'].append({**template,'role':'denominator','value':denominator,'raw_text':str(denominator),'unit':'patients'})
                before=deepcopy(f);row=self.row(a)
                self.assertTrue(row['main_result_eligible']);self.assertEqual(row['display_measure'],'ORR')
                self.assertEqual(row['measure_verbatim'],measure);self.assertEqual(row['original_fact'],before)
                self.assertEqual(row['estimate']['value'],percentage);self.assertEqual(row['estimate']['unit'],'%')
                self.assertIsNone(row['analysis_n']['value']);self.assertIsNone(row['denominator']['value'])
                self.assertFalse(row['pooling_eligible'])
    def test_response_alias_does_not_promote_wrong_scope_or_compute_a_rate_from_counts(self):
        def example():
            a=fixture();p=a['R2']['payload'];p['models']=[];p['entities'][1]['label']='Objective response'
            f=p['facts'][0];f.update(field='objective_response',text='Objective response in melanoma patients',measure='objective response rate',
                                    clinical_endpoint_family='response',model_id=None)
            f['numbers'][0].update(role='percentage',value=25,raw_text='25%',unit='%');return a
        for change in [lambda p:p['entities'][0].update(population_scope='mixed_cancers'),
                       lambda p:p['entities'][0].update(label='Non‑melanoma patients'),
                       lambda p:p['entities'][1].update(label='Objective response in RCC patients'),
                       lambda p:p['facts'][0].update(evidence_origin='cited_other_report'),
                       lambda p:p['facts'][0].update(scope='planned')]:
            a=example();change(a['R2']['payload']);self.assertFalse(self.row(a)['main_result_eligible'])
        a=example();f=a['R2']['payload']['facts'][0];f['numbers'][0].update(role='numerator',value=1,raw_text='one',unit='patients');f['count_context']='event_count'
        out=clinical.project_articles([a])['articles'][0];self.assertFalse(out['quantitative_results'][0]['main_result_eligible'])
        self.assertNotIn('display_measure',out['quantitative_results'][0]);self.assertEqual(out['sample_size_records'],[])
        self.assertEqual(out['quantitative_results'][0]['source_reported_numbers'][0]['value'],1)
    def test_dose_descriptor_does_not_become_safety_risk_and_author_surname_is_preserved(self):
        a=fixture();a['citation']['authors']=['Yang Derek Z'];f=a['R2']['payload']['facts'][0]
        f.update(domain='safety_outcomes',field='patients_requiring_dose_reduction',text='Three patients required dose reduction to 0.0025%',measure='percentage',clinical_endpoint_family='adverse_events')
        f['numbers'][0].update(role='numerator',value=3,raw_text='Three',unit='patients')
        f['numbers'].append({**deepcopy(f['numbers'][0]),'role':'estimate','value':.0025,'raw_text':'0.0025%','unit':'percent'})
        record=clinical.project_articles([a])['articles'][0];row=record['quantitative_results'][0]
        self.assertEqual(record['first_author_surname'],'Yang');self.assertEqual(row['display_measure'],'participant_count');self.assertEqual(row['estimate']['value'],3)
        self.assertEqual(len(row['source_reported_numbers']),2);self.assertEqual(len(row['reported_numbers']),1)
    def test_explicit_treated_context_is_separate_and_safety_counts_are_not_n(self):
        a=fixture();p=a['R2']['payload'];f=deepcopy(p['facts'][0]);f.update(fact_id='F2',domain='patient_demographics',field='treated_population',text='Sixteen patients were treated',count_context='treated',model_id=None)
        f['numbers'][0].update(role='sample_size',value=16,raw_text='Sixteen',unit='patients');p['facts'].append(f)
        out=clinical.project_articles([a])['articles'][0];self.assertEqual(len(out['sample_size_records']),1);self.assertEqual(out['sample_size_records'][0]['sample_context_role'],'treated')
        f['fact_id']='F3';f['domain']='safety_outcomes';f['text']='Patients requiring dose reduction';f['clinical_endpoint_family']='adverse_events';f['count_context']='event_count';f['numbers'][0].update(role='numerator',value=3,raw_text='Three')
        p['facts']=[f];out=clinical.project_articles([a])['articles'][0];self.assertEqual(out['sample_size_records'],[]);self.assertEqual(out['quantitative_results'][0]['display_measure'],'participant_count')
    def test_statistical_replicates_never_create_patient_context(self):
        a=fixture();f=a['R2']['payload']['facts'][0];f.update(field='bootstrap_replicates',text='1000 bootstrap resamples',count_context='randomized')
        f['numbers'][0].update(role='sample_size',value=1000,raw_text='1000',unit='patients')
        out=clinical.project_articles([a])['articles'][0];self.assertEqual(out['sample_size_records'],[]);self.assertFalse(out['quantitative_results'][0]['main_result_eligible'])
    def test_review_namespaces_and_effective_r3_status_preserve_r2_data(self):
        a=fixture();a['R3']=deepcopy(a['R2']);a['R3'].update(stage='R3',status='exclude');a['R3']['payload'].update(stage='R3',facts=[],models=[],entities=[],evidence=[])
        out=clinical.project_articles([a])['articles'][0];self.assertFalse(out['current_main_eligible']);self.assertEqual(len(out['quantitative_results']),1)
        a['R3']=deepcopy(a['R2']);a['R3']['stage']='R3';a['R3']['payload']['stage']='R3';out=clinical.project_articles([a])['articles'][0]
        self.assertEqual(len({r['result_id']for r in out['quantitative_results']}),2)
    def test_export_writes_only_extension_and_does_not_open_registry_or_change_baseline(self):
        with TemporaryDirectory()as temp:
            root=Path(temp);p=root/'website/dist/data/studies.json';p.parent.mkdir(parents=True);p.write_text('exact scientific baseline')
            repo=Path(__file__).resolve().parents[2]
            for relative in ['config/treatment_registry.json', 'website/scripts/treatment_normalization.cjs', 'website/scripts/build_drug_type_review.cjs', *[
                'website/dist/'+name+'.js' for name in ('treatment_registry','treatment_resolver','treatment_groups','regimen_definitions','regimen_source_rules')]]:
                target=root/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(repo/relative,target)
            before=p.read_bytes();receipt=clinical.export_clinical_evidence(root,articles=[fixture()]);self.assertEqual(p.read_bytes(),before)
            self.assertFalse((root/'data/current/articles.sqlite3').exists());self.assertEqual(receipt['result_count'],1)
            self.assertEqual(json.loads((root/clinical.PUBLIC).read_text())['articles'][0]['pmid'],'123')


if __name__=='__main__':unittest.main()
