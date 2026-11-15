from copy import deepcopy
import ast
from pathlib import Path
import unittest
from metamelanoma import schema, screening, normalization as n, validation


def number(value=25, raw='25', role='sample_size', unit='patients', **extra):
    return {'role': role, 'status': 'reported', 'value': value, 'raw_text': raw,
            'unit': unit, 'qualifier': 'equal', 'missing_reason': None, 'evidence_ids': ['e'], **extra}


def fixture():
    source = screening.build_source({'report_id': 'r', 'pmid': '1', 'title': 'Melanoma treatment',
        'abstract': 'Twenty-five patients with melanoma were treated. The hazard ratio for overall survival was 0.7 (95% CI 0.5–0.9). No deaths occurred.'})
    cat = screening.catalog_for(source); span = next(s for s in cat['spans'] if 'Twenty-five' in s['text'])
    p = {'schema_id': schema.SCHEMA_ID, 'report_id': 'r', 'pmid': '1', 'stage': 'R2',
        'source_sha256': schema.digest(source), 'decision': {'status': 'retain', 'reason': 'Actual human melanoma treatment cohort.',
            'reason_code': 'eligible', 'melanoma_subtypes': ['unspecified'], 'actual_human_treatment': 'established',
            'original_study_design': 'established', 'evidence_ids': ['e']},
        'evidence': [{'evidence_id': 'e', 'span_id': span['span_id']}],
        'treatment_context': {'experimental_regimen_category':'unclear',
            'experimental_concurrent_cytotoxic':'unclear','chemotherapy_contexts':[],'evidence_ids':[]},
        'entities': [{'entity_id': 'pop', 'kind': 'population', 'label': 'Melanoma treatment patients',
            'population_scope': 'melanoma', 'parent_id': None, 'evidence_ids': ['e']}], 'models': [],
        'facts': [{'fact_id': 'f', 'domain': 'patient_demographics', 'field': 'treated_patient_count', 'status': 'reported',
            'text': 'Reported treated patients', 'measure': 'participant_count', 'clinical_endpoint_family': 'not_applicable',
            'evidence_origin': 'own_report_results', 'scope': 'observed', 'reported_trial': None,
            'result_population_id': 'pop', 'arm_id': None, 'experimental_arm_id': None, 'comparator_arm_id': None,
            'endpoint_id': None, 'model_id': None, 'cutoff_id': None, 'contrast_type': 'not_applicable',
            'count_context': 'treated', 'link_gaps': [], 'numbers': [number()], 'evidence_ids': ['e']}],
        'field_coverage': [{'domain': d, 'status': 'reviewed' if d == 'patient_demographics' else 'unreviewed',
            'reason': 'Bounded source review', 'evidence_ids': []} for d in schema.DOMAINS], 'limitations': []}
    return source, cat, p


class NumberTests(unittest.TestCase):
    def norm(self, wrapper, quote, fact=None):
        return n.normalize_number(wrapper, evidence=[{'evidence_id': 'e', 'quote': quote}], fact=fact)

    def test_cardinal_decimal_comma_and_middle_dot(self):
        for w, q, v in [(number(), 'Twenty-five patients were treated.', 25),
            (number(.25, '0,25', 'estimate', None), 'The effect was 0,25.', .25),
            (number(1.5, '1·5', 'estimate', None), 'The effect was 1·5.', 1.5)]:
            with self.subTest(q=q): self.assertEqual(self.norm(w, q)['number']['value'], v)

    def test_actual_pilot_modifier_patient_counts_and_explicit_operator_equivalence(self):
        for raw,value in [('Two nonresponding patients',2),('one further nonresponding patient',1)]:
            quote=raw+' demonstrated uptake in known tumour areas.'
            view=self.norm(number(value,raw,'numerator','patients'),quote)
            self.assertEqual(view['arabic_value'],value)
            self.assertEqual(view['source_matches'][0]['shared_unit_proof']['kind'],'explicit_modified_person_noun')
        for raw,qualifier,display in [('> or = 1.5 mm','greater_or_equal','≥1.5'),
                                      ('< or = 1.5 mm','less_or_equal','≤1.5')]:
            view=self.norm(number(1.5,raw,'minimum','mm',qualifier=qualifier),'Breslow thickness '+raw)
            self.assertEqual(view['display_value'],display)
            with self.assertRaises(ValueError):self.norm(number(1.5,raw,'minimum','mm',qualifier='equal'),'Breslow thickness '+raw)
        with self.assertRaises(ValueError):self.norm(number(2,'Two nonresponding patients','numerator','patients'),'Two nonresponding lesions were observed.')

    def test_exact_p_value_sidedness_descriptor_is_not_an_extra_number(self):
        w=number(.0023,'P = .0023, one-sided','p_value',None)
        view=self.norm(w,'Relapse-free survival P = .0023, one-sided.')
        self.assertEqual(view['arabic_value'],.0023)
        self.assertEqual(view['source_matches'][0]['test_sidedness_descriptor'],'one')
        for quote in ['P = .0023, two-sided.','P = .0023. A one-sided P = .02 was elsewhere.']:
            with self.subTest(quote=quote),self.assertRaises(ValueError):self.norm(w,quote)
        with self.assertRaises(ValueError):self.norm({**w,'value':1},'P = .0023, one-sided.')

    def test_temporal_ordinal_is_not_patient_N_or_fraction_component(self):
        view=self.norm(number(4,'fourth month','timepoint','month of therapy'),
            'Discontinuation of treatment due to toxicity was infrequent after the fourth month of therapy.')
        self.assertEqual(view['arabic_value'],4);self.assertEqual(view['source_matches'][0]['rule'],'temporal_ordinal')
        self.assertEqual(self.norm(number(16,'16th day','follow_up','days'),'Assessed on the 16th day.')['arabic_value'],16)
        for w,q in [(number(16,'16th patient'),'The 16th patient recently started treatment.'),
                    (number(4,'fourth','timepoint',None),'The fourth group was tested.'),
                    (number(3,'3 months','timepoint','months'),'The duration was one-third month.')]:
            with self.subTest(q=q),self.assertRaises(ValueError):self.norm(w,q)

    def test_exact_no_complete_or_partial_responses_is_zero_category_count_only(self):
        fact={'scope':'observed','clinical_endpoint_family':'response','field':'melanoma_complete_response','measure':'complete response count'}
        w=number(0,'no complete or partial responses','numerator','patients')
        view=self.norm(w,'In 33 evaluable patients with melanoma, no complete or partial responses were observed.',fact)
        self.assertEqual(view['number']['value'],0);self.assertEqual(view['number']['unit'],'responses')
        self.assertEqual(view['original_wrapper']['unit'],'patients')
        self.assertTrue(view['unit_normalization_proof']['no_rate_or_denominator_inferred'])
        for bad in [{**w,'role':'sample_size'},{**w,'role':'percentage','unit':'%'},{**w,'value':1}]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):self.norm(bad,'No complete or partial responses were observed.',fact)
        for wrong_fact in [{**fact,'field':'overall_response','measure':'ORR'}, {**fact,'scope':'planned'}]:
            with self.subTest(wrong_fact=wrong_fact),self.assertRaises(ValueError):self.norm(w,'No complete or partial responses were observed.',wrong_fact)
        with self.assertRaises(ValueError):self.norm(w,'No partial responses were observed.',fact)

    def test_negative_word_is_atomic(self):
        self.assertEqual(self.norm(number(-5, 'minus five', 'estimate', None), 'The effect was minus five.')['arabic_value'], -5)
        with self.assertRaises(ValueError): self.norm(number(5, '5', 'estimate', None), 'The effect was minus five.')

    def test_fraction_compounds_cannot_expose_one(self):
        for raw in ('one-half', 'one-third'):
            with self.subTest(raw=raw), self.assertRaises(ValueError): self.norm(number(1, '1', 'estimate', None), 'Effect was ' + raw)

    def test_missing_annotations_preserve_reason_and_zero(self):
        for raw in ('NR', 'not estimable', 'not reached', 'N.E.', '-'):
            v = self.norm(number(None, raw, 'median', 'months', status='not_reported'), 'The paper reports its study.')
            self.assertIsNone(v['number']['value']); self.assertEqual(v['display_value'], 'NA')
            self.assertIsNotNone(v['missing_reason'])
        self.assertEqual(self.norm(number(0, '0'), '0 patients had events.')['arabic_value'], 0)

    def test_missing_real_number_never_erased(self):
        with self.assertRaises(ValueError): self.norm(number(13, '13', 'median', 'months', status='not_reported'), 'Median13 months.')
        with self.assertRaises(ValueError): self.norm(number(13,'13','median','months',missing_reason='not_reported'),'Median 13 months.')
        view=self.norm(number(None,None,'median','months',status='not_reported',missing_reason='not_estimable'),'No literal absence marker required for annotation.')
        self.assertEqual(view['missing_reason'],'not_estimable')

    def test_embedded_na_nr_are_not_missing(self):
        for raw, q in [('NA', 'DNA was isolated.'), ('NR', 'NRAS mutations were studied.')]:
            with self.subTest(raw=raw), self.assertRaises(ValueError): self.norm(number(None, raw, 'estimate', None), q)

    def test_source_zero_event_context_is_required(self):
        w = number(0, 'No', 'numerator', 'patients')
        with self.assertRaises(ValueError): self.norm(w, 'No patients discontinued; two patients had objective responses.',
            {'field': 'objective_response_count', 'measure': 'responses'})

    def test_inequality_display_and_unit_contradiction(self):
        self.assertEqual(self.norm(number(2, 'up to 2 years', 'maximum', 'years', qualifier='less_or_equal'), 'Follow-up was up to 2 years.')['display_value'], '≤2')
        with self.assertRaises(ValueError): self.norm(number(3, '3 days', 'median', 'months'), 'Treatment repeated every3days; survival was3months.')

    def test_no_unregistered_percent_fraction_scaling(self):
        with self.assertRaises(ValueError): self.norm(number(.95, '95%', 'confidence_level', 'probability'), '95%CI was reported.')

    def test_explicit_trusted_percent_registration_is_exact(self):
        w = number(.95, '95%', 'confidence_level', 'probability'); ev = [{'evidence_id': 'e', 'quote': 'The 95% CI was reported.'}]
        fact = {'fact_id': 'f', 'field': 'CI_level', 'measure': 'HR'}; proof = {'path': 'data/source.json', 'sha256': 'a' * 64}
        capability = n.register_percent_probability(w, evidence=ev, fact=fact, source_proof_ref=proof, verify_source_proof=lambda r: r == proof)
        v = n.normalize_number(w, evidence=ev, fact=fact, registered_encoding=capability)
        self.assertEqual(v['number']['value'], .95); self.assertEqual(v['number']['unit'], 'probability')
        for value in (.94, .951):
            with self.subTest(value=value), self.assertRaises(ValueError):
                n.register_percent_probability({**w, 'value': value}, evidence=ev, fact=fact, source_proof_ref=proof, verify_source_proof=lambda r: True)
        with self.assertRaises(ValueError): n.normalize_number(w, evidence=ev, fact=fact, registered_encoding={'normalization': 'percent_to_probability'})

    def test_percent_cannot_become_participant_N(self):
        with self.assertRaises(ValueError): self.norm(number(25, '25%'), '25% of patients responded.')

    def test_roman_only_with_phase_stage_grade_context(self):
        self.assertEqual(self.norm(number(2, 'II', 'other', 'phase'), 'A phase II trial.')['arabic_value'], 2)
        with self.assertRaises(ValueError): self.norm(number(2, 'II'), 'GroupII patients.')

    def test_list_unit_and_CI_shorthand(self):
        self.assertEqual(self.norm(number(9, '9 months', 'median', 'months'), 'At 4, 9 and 13 months.')['arabic_value'], 9)
        lower=number(0,'0%','ci_lower','%'); upper=number(13,'13%','ci_upper','%')
        self.assertEqual(self.norm(lower,'95% CI 0–13%',{'numbers':[lower,upper]})['arabic_value'],0)


class ValidationTests(unittest.TestCase):
    def test_recorded_initial_native_schema_is_exact_and_does_not_invent_treatment(self):
        s,c,p=fixture();p.pop('treatment_context');before=deepcopy(p)
        self.assertTrue(validation.validate(p,s,c)['global_errors'])
        v=validation.validate(p,s,c,request_schema=schema.INITIAL_NATIVE_SCHEMA)
        self.assertTrue(v['decision_valid']);self.assertEqual(v['original_payload'],before)
        self.assertNotIn('treatment_context',v['normalized_payload'])
        self.assertEqual(v['treatment_policy']['status'],'not_recorded');self.assertEqual(v['treatment_policy']['priority'],'review')
        bad=deepcopy(schema.INITIAL_NATIVE_SCHEMA);bad['required'].remove('facts')
        self.assertIn('Unrecognized recorded',validation.validate(p,s,c,request_schema=bad)['global_errors'][0])

    def test_null_cutoff_is_unresolved_metadata_and_nonnull_model_conflicts_stay_held(self):
        s,c,p=fixture();f=p['facts'][0];f.update(domain='efficacy_outcomes',field='overall_survival',measure='HR',clinical_endpoint_family='overall_survival',link_gaps=['model'])
        f['numbers']=[number(.7,'0.7','estimate','ratio')]
        p['entities'].append({**deepcopy(p['entities'][0]),'entity_id':'endpoint','kind':'endpoint','label':'Overall survival','population_scope':'not_applicable'})
        f['endpoint_id']='endpoint';before=deepcopy(p);v=validation.validate(p,s,c)
        self.assertEqual(v['counts']['source_checked_facts'],1);self.assertEqual(v['validated_facts'][0]['cutoff_id'],None)
        self.assertEqual(v['validated_facts'][0]['link_gaps'],['model','cutoff'])
        self.assertEqual(v['fact_results'][0]['link_provenance'][0]['origin'],'validator_unresolved_link_annotation')
        self.assertEqual(v['original_payload'],before);self.assertEqual(p,before)
        f['endpoint_id']=None
        self.assertIn('endpoint',validation.validate(p,s,c)['fact_results'][0]['errors'][0])
        f['endpoint_id']='endpoint';f['model_id']='M';f['cutoff_id']='C1'
        for ident in ['C1','C2']:p['entities'].append({**deepcopy(p['entities'][1]),'entity_id':ident,'kind':'cutoff','label':ident})
        p['models']=[{'model_id':'M','family':'Cox','estimand':'Overall survival','analysis_population_id':'pop','endpoint_id':'endpoint','cutoff_id':'C2','arm_ids':[],
            'contrast_type':'prognostic','adjusted_status':'not_reported','evidence_origin':'own_report_results','scope':'observed','variables':[],'evidence_ids':['e']}]
        f['contrast_type']='prognostic';v=validation.validate(p,s,c)
        self.assertIn('cutoff_id conflict',v['fact_results'][0]['errors'][0]);self.assertEqual(v['validated_facts'],[])

    def test_actual_pilot_genre_uncertainty_with_incidental_subtype_comment(self):
        s,c,p=fixture();p['decision'].update(status='uncertain',reason_code='unresolved_report_kind',actual_human_treatment='unclear',original_study_design='unclear',
            reason='Clinical responses to intralesional BCG in melanoma patients are described, but no original treated cohort or study design is identified. Original clinical report versus clinical overview remains unresolved. Cutaneous nodules establish lesion location, not primary melanoma origin.')
        self.assertTrue(validation.validate(p,s,c)['decision_valid'])
        p['decision']['reason']='Original clinical report is available, but primary cutaneous origin cannot be confirmed.'
        self.assertFalse(validation.validate(p,s,c)['decision_valid'])

    def test_negated_subtype_clause_is_not_the_reason_for_true_population_or_design_issue(self):
        cases=[('uncertain','unresolved_population','Original pharmacodynamic study in cytokine-treated humans. The abstract does not establish that any treated participant actually had melanoma. Uncertainty concerns population linkage, not melanoma subtype.'),
            ('exclude','ineligible_design','The supplied abstract is a narrative overview without an original clinical study. Exclusion is based on study design, not unspecified melanoma subtype.'),
            ('exclude','ineligible_treatment','Original treated-human cohort includes skin melanoma and cutaneous melanoma metastases, whose primary origins are unspecified. The documented intervention is pulsed laser therapy, not an eligible drug regimen; immunotherapy is mentioned only as a possible combination.')]
        for status,code,reason in cases:
            s,c,p=fixture();p['decision'].update(status=status,reason_code=code,reason=reason)
            if status=='exclude':p.update(facts=[],models=[],entities=[])
            before=deepcopy(p)
            with self.subTest(reason=reason):self.assertTrue(validation.validate(p,s,c)['decision_valid'])
            self.assertEqual(p,before)
        s,c,p=fixture();p['decision'].update(status='uncertain',reason_code='unresolved_population',reason='Melanoma subtype is not reported.')
        self.assertFalse(validation.validate(p,s,c)['decision_valid'])

    def test_treatment_priority_separate_from_eligibility_and_timing(self):
        s,c,p=fixture()
        for category,concurrent,timings,expected in [
            ('immunotherapy','no',[],'core'),('targeted_therapy','no',['comparator','prior','subsequent'],'core'),
            ('immunotherapy_targeted_therapy','no',[],'core'),('endocrine_combination','no',[],'core'),
            ('immunotherapy','yes',['experimental_concurrent'],'deferred'),
            ('conventional_cytotoxic_chemotherapy','yes',['experimental_concurrent'],'deferred'),
            ('endocrine_only','no',[],'separate'),('unclear','unclear',[],'review')]:
            p['treatment_context']={'experimental_regimen_category':category,'experimental_concurrent_cytotoxic':concurrent,'chemotherapy_contexts':timings,'evidence_ids':['e']}
            v=validation.validate(p,s,c)
            with self.subTest(category=category,concurrent=concurrent):
                self.assertTrue(v['decision_valid']);self.assertEqual(v['treatment_policy']['priority'],expected)
                self.assertFalse(v['treatment_policy']['eligibility_decision_changed'])
        p['treatment_context'].update(experimental_regimen_category='immunotherapy',experimental_concurrent_cytotoxic='no',chemotherapy_contexts=['experimental_concurrent'])
        v=validation.validate(p,s,c);self.assertTrue(v['decision_valid']);self.assertEqual(v['treatment_policy']['status'],'held')
        p['treatment_context'].update(chemotherapy_contexts=[],evidence_ids=['foreign'])
        self.assertEqual(validation.validate(p,s,c)['treatment_policy']['status'],'held')

    def test_valid_Arabic_view_keeps_original(self):
        s,c,p=fixture();before=deepcopy(p);v=validation.validate(p,s,c)
        self.assertTrue(v['decision_valid']);self.assertEqual(v['counts'],{'source_checked_facts':1,'held_facts':0})
        self.assertEqual(p,before);self.assertEqual(v['original_payload'],before)
        self.assertEqual(v['validated_facts'][0]['numbers'][0]['value'],25)
        self.assertFalse(v['full_R3_extraction_complete'])

    def test_one_bad_fact_does_not_quarantine_valid_independent_fact(self):
        s,c,p=fixture();bad=deepcopy(p['facts'][0]);bad['fact_id']='bad';bad['numbers'][0]['value']=26;p['facts'].append(bad)
        v=validation.validate(p,s,c);self.assertEqual(v['counts'],{'source_checked_facts':1,'held_facts':1});self.assertTrue(v['decision_valid'])
        self.assertEqual(v['normalized_payload']['facts'][1],bad)

    def test_generic_and_explicit_special_subtypes_are_not_exclusion(self):
        for subtype in schema.SUBTYPES:
            s,c,p=fixture();p['decision']['melanoma_subtypes']=[subtype]
            with self.subTest(subtype=subtype):self.assertTrue(validation.validate(p,s,c)['decision_valid'])

    def test_subtype_only_unclear_is_rejected(self):
        for status,code,reason in [('uncertain','unresolved_population','No cutaneous subtype is specified.'),
            ('uncertain','source_incomplete','Primary cutaneous origin cannot be confirmed.'),
            ('exclude','ineligible_design','Melanoma subtype is unknown.'),('exclude','ineligible_design','Only uveal melanoma is included.')]:
            s,c,p=fixture();p['decision'].update(status=status,reason_code=code,reason=reason)
            if status=='exclude':p['facts']=[];p['entities']=[]
            with self.subTest(reason=reason):self.assertFalse(validation.validate(p,s,c)['decision_valid'])

    def test_mixed_subtype_only_exclusion_and_uncertainty_are_rejected(self):
        for status, code in [('exclude', 'ineligible_design'), ('uncertain', 'unresolved_population')]:
            s,c,p=fixture()
            p['decision'].update(status=status,reason_code=code,
                reason='Mixed melanoma-subtype population is conflicting information.')
            if status == 'exclude': p['facts']=[];p['entities']=[]
            with self.subTest(status=status):
                self.assertFalse(validation.validate(p,s,c)['decision_valid'])

    def test_treatment_arm_alternatives_and_eligible_RCT_are_actual_population(self):
        for abstract in ('Patients with melanoma received nivolumab or ipilimumab.',
                         'Eligible melanoma patients were randomized to nivolumab or ipilimumab.'):
            s,c,p=fixture();s=screening.build_source({'report_id':'r','pmid':'1','abstract':abstract});c=screening.catalog_for(s)
            p['source_sha256']=schema.digest(s);p['evidence'][0]['span_id']=c['spans'][0]['span_id'];p['facts']=[];p['entities']=[]
            with self.subTest(abstract=abstract):self.assertTrue(validation.validate(p,s,c)['decision_valid'])

    def test_actual_mixed_cohort_count_and_melanoma_outcome_sentences_are_enrollment(self):
        positives=[
            'Patients with melanoma or kidney cancer were treated with pulse IL-2. Eight (8) patients had melanoma and 3 had kidney cancer.',
            'Nine patients with malignant melanoma or soft tissue sarcoma were treated. Three patients with melanoma remain clinically free of metastases. Two patients with melanoma died within a year.']
        negatives=[
            'Patients with melanoma or kidney cancer could enroll. Zero patients had melanoma.',
            'Patients with melanoma or kidney cancer could enroll. If eight patients had melanoma they would receive IL-2.',
            'Patients with melanoma or kidney cancer could enroll. 0 patients had melanoma.']
        for text in positives+negatives:
            s,_,p=fixture();s=screening.build_source({'report_id':'r','pmid':'1','abstract':text});c=screening.catalog_for(s)
            p['source_sha256']=schema.digest(s);p['evidence'][0]['span_id']=c['spans'][0]['span_id'];p['facts']=[];p['entities']=[]
            with self.subTest(text=text):self.assertEqual(validation.validate(p,s,c)['decision_valid'],text in positives)

    def test_actual_parenthesized_melanoma_regressions_and_diagnosis_comparison(self):
        cases=[('Patients with melanoma or renal carcinoma were treated. Nine patients (7%) with metastatic melanoma achieved complete regression and 14 patients (10%) had partial regression.',True),
            ('Patients with renal carcinoma or melanoma were treated. Higher peak creatinine values occurred in patients with renal carcinoma (v melanoma).',True),
            ('Patients with renal carcinoma or melanoma could enroll. Higher creatinine values would occur in patients with renal carcinoma (v melanoma).',False)]
        for text,expected in cases:
            s,_,p=fixture();s=screening.build_source({'report_id':'r','pmid':'1','abstract':text});c=screening.catalog_for(s);p['source_sha256']=schema.digest(s)
            p['evidence'][0]['span_id']=c['spans'][0]['span_id'];p.update(facts=[],models=[],entities=[])
            with self.subTest(text=text):self.assertEqual(validation.validate(p,s,c)['decision_valid'],expected)

    def test_uncertain_human_linkage_reason_code_preserves_native_ambiguity(self):
        s,c,p=fixture();p['decision'].update(status='uncertain',reason_code='no_actual_treated_human_link',actual_human_treatment='unclear',original_study_design='unclear',
            reason='The title claims clinical results, but the abstract describes animals and does not establish a treated human melanoma dataset.')
        before=deepcopy(p);v=validation.validate(p,s,c);self.assertTrue(v['decision_valid']);self.assertEqual(v['original_payload'],before)
        p['decision']['actual_human_treatment']='established';self.assertFalse(validation.validate(p,s,c)['decision_valid'])

    def test_non_melanoma_and_human_cell_lines_cannot_supply_positive_scope(self):
        for text in ('Non-melanoma skin cancer was treated.','Human melanoma cell lines were treated in vitro.'):
            s,c,p=fixture();s=screening.build_source({'report_id':'r','pmid':'1','abstract':text});c=screening.catalog_for(s)
            p['source_sha256']=schema.digest(s);p['evidence'][0]['span_id']=c['spans'][0]['span_id']
            with self.subTest(text=text):self.assertFalse(validation.validate(p,s,c)['decision_valid'])

    def test_context_value_cannot_borrow_irrelevant_target_evidence(self):
        s,c,p=fixture();s['blocks'][1]['is_target']=False;s['blocks'][0]['text']='Melanoma treatment results:0responses.';c=screening.catalog_for(s);p['source_sha256']=schema.digest(s)
        p['evidence']=[{'evidence_id':'e','span_id':c['spans'][1]['span_id']},{'evidence_id':'target','span_id':c['spans'][0]['span_id']}];p['facts'][0]['numbers'][0]['evidence_ids']=['e','target']
        self.assertEqual(validation.validate(p,s,c)['counts']['held_facts'],1)

    def test_eligibility_alternatives_do_not_prove_actual_melanoma_enrollment(self):
        s,c,p=fixture();s=screening.build_source({'report_id':'r','pmid':'1','abstract':
            'Patients with melanoma or other solid tumors were eligible and received treatment. We enrolled 30 patients; melanoma results will be reported separately.'})
        c=screening.catalog_for(s);p['source_sha256']=schema.digest(s);p['evidence'][0]['span_id']=c['spans'][0]['span_id']
        p['facts']=[];p['entities']=[]
        v=validation.validate(p,s,c);self.assertFalse(v['decision_valid'])
        p['decision'].update(status='uncertain',reason_code='unresolved_population',reason='Actual melanoma enrollment is unresolved; subtype is not the issue.')
        self.assertTrue(validation.validate(p,s,c)['decision_valid'])

    def test_foreign_source_or_catalog_blocks_all_scientific_promotion(self):
        s,c,p=fixture();p['source_sha256']='a'*64;v=validation.validate(p,s,c);self.assertTrue(v['global_errors']);self.assertEqual(v['validated_facts'],[])
        s,c,p=fixture();c['spans'][0]['text']='forged';self.assertTrue(validation.validate(p,s,c)['global_errors'])

    def test_missing_model_and_foreign_population_are_per_fact_errors(self):
        for key,value in [('model_id','absent'),('result_population_id','absent')]:
            s,c,p=fixture();p['facts'][0][key]=value
            with self.subTest(key=key):self.assertEqual(validation.validate(p,s,c)['counts']['held_facts'],1)

    def test_blank_abstract_does_not_authorize_absence_exclusion(self):
        s,c,p=fixture();p['facts']=[];p['entities']=[];p['decision'].update(status='exclude',reason_code='scientific_abstract_unavailable',reason='Abstract unavailable.')
        self.assertFalse(validation.validate(p,s,c)['decision_valid'])

    def test_R3_retained_and_unclear_but_never_excluded_upstream(self):
        for status in ('retain','uncertain','unclear'):
            s=screening.build_source({'report_id':'r','pmid':'1'},'R3','Melanoma patients treated.',fulltext_verified=True,upstream_R2={'decision':{'status':status}})
            self.assertEqual(s['upstream_R2']['decision']['status'],status)
        with self.assertRaises(ValueError):screening.build_source({'report_id':'r','pmid':'1'},'R3','fulltext',fulltext_verified=True,upstream_R2={'decision':{'status':'exclude'}})

    def test_request_is_one_high_native_source_only_request(self):
        s,c,p=fixture();b=screening.request_body(s);self.assertEqual(b['model'],'gpt-6.1-sol');self.assertEqual(b['reasoning'],{'effort':'high'});self.assertFalse(b['store'])
        with self.assertRaises(ValueError):screening.request_body(screening.build_source({'report_id':'r','pmid':'1','abstract':'x'*130000}))

    def test_explicit_default_or_flex_changes_only_service_tier(self):
        s,_,_=fixture();default=screening.request_body(s);flex=screening.request_body(s,service_tier='flex')
        self.assertEqual(default['service_tier'],'default');self.assertEqual(flex['service_tier'],'flex')
        flex['service_tier']='default';self.assertEqual(flex,default)
        for value in ('auto','priority','batch',None):
            with self.subTest(value=value),self.assertRaises(ValueError):screening.request_body(s,service_tier=value)

    def test_active_scientific_modules_have_no_legacy_imports(self):
        base=Path(schema.__file__).parent
        for name in ('schema','normalization','validation','screening'):
            tree=ast.parse((base/(name+'.py')).read_text())
            imports=[n.module or''for n in ast.walk(tree)if isinstance(n,ast.ImportFrom)]
            imports += [a.name for n in ast.walk(tree)if isinstance(n,ast.Import)for a in n.names]
            self.assertFalse(any('metacutaneous'in m or'metasamplesize'in m for m in imports))

    def test_wire_source_text_occurs_only_once_and_paragraph_offsets_are_exact(self):
        import json
        s=screening.build_source({'report_id':'r','pmid':'1','title':'Melanoma',
            'abstract':'METHODS: Twenty-five patients.\nRESULTS: No deaths.'})
        body=screening.request_body(s);data=json.loads(body['input'])
        self.assertNotIn('blocks',data['source']);self.assertEqual(body['input'].count('METHODS: Twenty-five patients.'),1)
        c=data['source_span_catalog'];abstract=s['blocks'][1]['text']
        for span in c['spans']:
            if span['block_id']=='abstract':self.assertEqual(span['text'],abstract[span['char_start']:span['char_end']])

    def test_missing_CI_level_is_held_without_default_or_edit(self):
        s,c,p=fixture();f=p['facts'][0];f['numbers']=[number(.5,'0.5','ci_lower',None),number(.9,'0.9','ci_upper',None)]
        v=validation.validate(p,s,c);self.assertEqual(v['counts']['held_facts'],1)
        self.assertNotIn('confidence_level',[n['role']for n in v['original_payload']['facts'][0]['numbers']])

    def test_trusted_validator_registers_only_explicit_exact_probability_units(self):
        s,c,p=fixture();p['facts'][0]['numbers']=[number(.95,'95%','confidence_level','probability')]
        v=validation.validate(p,s,c);self.assertEqual(v['counts']['source_checked_facts'],1)
        wrapper=v['validated_facts'][0]['numbers'][0];self.assertEqual(wrapper['value'],.95);self.assertEqual(wrapper['unit'],'probability')
        self.assertTrue(v['fact_results'][0]['normalization_provenance'][0]['registered_encoding_proof'])
        bad=deepcopy(p);bad['facts'][0]['numbers'][0]['value']=.94
        self.assertEqual(validation.validate(bad,s,c)['counts']['held_facts'],1)

    def test_model_dependency_error_does_not_erase_independent_count(self):
        s,c,p=fixture();f=deepcopy(p['facts'][0]);f.update(fact_id='effect',model_id='m');p['facts'].append(f)
        p['models']=[{'model_id':'m','family':None,'estimand':None,'analysis_population_id':'pop',
            'endpoint_id':None,'cutoff_id':None,'arm_ids':[],'contrast_type':'single_arm','adjusted_status':'unadjusted',
            'evidence_origin':'own_report_results','scope':'observed',
            'variables':[{'name':'age','role':'adjustment','scope':'observed','evidence_ids':['e']}],'evidence_ids':['e']}]
        v=validation.validate(p,s,c);self.assertEqual(v['counts'],{'source_checked_facts':1,'held_facts':1})
        self.assertEqual(v['model_results'][0]['status'],'held');self.assertEqual(v['original_payload']['models'],p['models'])

    def test_repeated_roles_cannot_be_silently_collapsed(self):
        s,c,p=fixture();p['facts'][0]['numbers'].append(deepcopy(p['facts'][0]['numbers'][0]));v=validation.validate(p,s,c)
        self.assertEqual(v['counts']['held_facts'],1);self.assertEqual(len(v['original_payload']['facts'][0]['numbers']),2)

    def test_coherent_HR_CI_and_source_supported_subgroup_preserve_missing_modelN(self):
        s,c,p=fixture();s['blocks'][1]['text'] += ' A Cox model adjusted for age in all melanoma patients included the low marker subgroup.'
        c=screening.catalog_for(s);p['source_sha256']=schema.digest(s);p['evidence'][0]['span_id']=c['spans'][1]['span_id']
        p['entities'].extend([{'entity_id':'child','kind':'population','label':'Low marker melanoma subgroup','population_scope':'melanoma','parent_id':'pop','evidence_ids':['e']},
            {'entity_id':'os','kind':'endpoint','label':'Overall survival','population_scope':'not_applicable','parent_id':None,'evidence_ids':['e']}])
        p['models']=[{'model_id':'m','family':'Cox','estimand':None,'analysis_population_id':'pop','endpoint_id':'os','cutoff_id':None,'arm_ids':[],
            'contrast_type':'prognostic','adjusted_status':'adjusted','evidence_origin':'own_report_results','scope':'observed',
            'variables':[{'name':'age','role':'adjustment','scope':'observed','evidence_ids':['e']}],'evidence_ids':['e']}]
        f=p['facts'][0];f.update(domain='efficacy_outcomes',field='OS_HR',measure='HR',clinical_endpoint_family='overall_survival',
            result_population_id='child',endpoint_id='os',model_id='m',contrast_type='prognostic',count_context='model_analysis',link_gaps=['cutoff'])
        f['numbers']=[number(.7,'0.7','estimate',None),number(.5,'0.5','ci_lower',None),number(.9,'0.9','ci_upper',None),
            number(95,'95%','confidence_level','%'),number(None,None,status='not_reported',missing_reason='not_reported')]
        v=validation.validate(p,s,c);self.assertEqual(v['counts']['source_checked_facts'],1)
        self.assertIsNone(v['validated_facts'][0]['numbers'][-1]['value'])
        self.assertEqual(v['validated_facts'][0]['result_population_id'],'child');self.assertEqual(v['validated_models'][0]['analysis_population_id'],'pop')
        bad=deepcopy(p);bad['entities'][1]['parent_id']=None
        self.assertEqual(validation.validate(bad,s,c)['counts']['held_facts'],1)


if __name__=='__main__':unittest.main()
