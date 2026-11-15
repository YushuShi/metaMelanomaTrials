"""Result-specific disease scope stays separate from article eligibility."""
from copy import deepcopy
import unittest
from test_clinical_evidence import fixture, clinical


class MelanomaScopeTests(unittest.TestCase):
    def row(self, article):
        return clinical.project_articles([article])['articles'][0]['quantitative_results'][0]

    def test_foreign_actual_arm_model_or_endpoint_overrides_generic_melanoma_population(self):
        for case in ('arm', 'nonhuman_arm', 'model', 'endpoint', 'fact'):
            with self.subTest(case=case):
                article=fixture();payload=article['R2']['payload'];fact=payload['facts'][0]
                if case in ('arm','nonhuman_arm'):
                    payload['entities'].append({'entity_id':'A','kind':'arm','label':'NSCLC cohort' if case=='arm' else 'Human melanoma cell lines','population_scope':'not_applicable','parent_id':None,'evidence_ids':['E1']})
                    fact.update(arm_id='A',measure='median',contrast_type='single_arm')
                elif case=='model':payload['models'][0]['estimand']='Overall survival in RCC patients'
                elif case=='endpoint':payload['entities'][1]['label']='NSCLC progression-free survival'
                else:fact['text']='NSCLC outcome from a study also enrolling melanoma patients'
                before=deepcopy(article);row=self.row(article)
                self.assertFalse(row['main_result_eligible']);self.assertEqual(row['original_fact'],fact);self.assertEqual(article,before)

    def test_mixed_article_keeps_explicit_melanoma_result_not_generic_pooled_result(self):
        article=fixture();article['citation']['title']='Abemaciclib for NSCLC or melanoma brain metastases'
        self.assertTrue(self.row(article)['main_result_eligible'])
        article['R2']['payload']['entities'][0]['label']='All enrolled patients'
        self.assertFalse(self.row(article)['main_result_eligible'])

    def test_existing_typed_melanoma_count_qualification_is_not_reinterpreted_from_mixed_quote(self):
        article=fixture();article['citation']['title']='Abemaciclib for NSCLC or melanoma'
        payload=article['R2']['payload'];fact=payload['facts'][0]
        fact.update(domain='patient_demographics',field='enrolled_population',text='All enrolled patients',count_context='enrolled',model_id=None)
        fact['numbers'][0].update(role='sample_size',value=51,raw_text='51',unit='patients')
        payload['evidence'][0]['quote']='51 patients were enrolled: 28 with NSCLC and 23 with melanoma.'
        for label,n,expected in [('All enrolled patients',51,1),('NSCLC cohort',28,0),('Melanoma cohort',23,1)]:
            payload['entities'][0]['label']=label
            fact['numbers'][0].update(value=n,raw_text=str(n))
            out=clinical.project_articles([article])['articles'][0]
            self.assertEqual(len(out['sample_size_records']),expected)

    def test_lung_metastases_remain_melanoma_and_nonhuman_or_mixed_counts_do_not(self):
        article=fixture();article['R2']['payload']['entities'][0]['label']='Melanoma patients with lung metastases'
        self.assertTrue(self.row(article)['main_result_eligible'])
        for label in ('Human melanoma cell lines','Mixed melanoma and NSCLC cohort','Non‑melanoma patients'):
            article['R2']['payload']['entities'][0]['label']=label
            self.assertFalse(self.row(article)['main_result_eligible'])

    def test_excluded_other_cancer_and_explicit_separated_subgroup_are_not_foreign_results(self):
        article=fixture()
        article['R2']['payload']['entities'][0]['label']='Melanoma patients; no NSCLC included'
        self.assertTrue(self.row(article)['main_result_eligible'])
        article['citation']['title']='Trial in melanoma or NSCLC'
        article['R2']['payload']['entities'][0]['label']='Melanoma subset of a solid-tumor trial'
        self.assertTrue(self.row(article)['main_result_eligible'])

    def test_scope_veto_does_not_promote_previous_model_parent_qualification_hold(self):
        article=fixture();payload=article['R2']['payload'];population=payload['entities'][0]
        population['parent_id']='Parent'
        parent={**deepcopy(population),'entity_id':'Parent','parent_id':None,'label':'Melanoma trial cohort'}
        payload['entities'].append(parent);payload['models'][0]['analysis_population_id']='Parent'
        self.assertFalse(self.row(article)['main_result_eligible'])
        payload['evidence'].append({**deepcopy(payload['evidence'][0]),'evidence_id':'Other'})
        parent['evidence_ids']=['Other']
        self.assertFalse(self.row(article)['main_result_eligible'])

    def test_mislabelled_nonhuman_arm_cannot_supply_a_patient_count(self):
        article=fixture();payload=article['R2']['payload'];fact=payload['facts'][0]
        payload['entities'].append({'entity_id':'A','kind':'arm','label':'Human melanoma cell lines','population_scope':'not_applicable','parent_id':None,'evidence_ids':['E1']})
        fact.update(domain='patient_demographics',field='treated_population',text='Treated cohort',arm_id='A',count_context='treated',model_id=None)
        fact['numbers'][0].update(role='sample_size',value=23,raw_text='23',unit='patients')
        self.assertEqual(clinical.project_articles([article])['articles'][0]['sample_size_records'],[])

    def test_nonhuman_or_nonmelanoma_endpoint_cannot_borrow_melanoma_population(self):
        article=fixture()
        for label in ('Mouse melanoma xenograft overall survival','Non-melanoma progression-free survival'):
            article['R2']['payload']['entities'][1]['label']=label
            self.assertFalse(self.row(article)['main_result_eligible'])
        article['R2']['payload']['entities'][1]['label']='Melanoma overall survival'
        self.assertTrue(self.row(article)['main_result_eligible'])

    def test_count_population_not_assay_or_other_cohort_narrative_governs_scope(self):
        cases=[('Study 2 metastatic melanoma subgroup','Study 2 included 5 patients with metastatic melanoma and 16 with renal cell carcinoma.',5),
               ('Melanoma patients with vaccination-site T-cell findings','T-cell lines isolated from these melanoma patients showed in-vitro activity.',2),
               ('Patients with malignant melanoma in the mixed-cancer study','Seven of 31 patients had melanoma.',7),
               ('Patients identified as receiving nivolumab','449 patients with advanced melanoma received nivolumab.',449)]
        for label,text,n in cases:
            with self.subTest(label=label):
                article=fixture();payload=article['R2']['payload'];payload['entities'][0]['label']=label
                payload['entities'].append({'entity_id':'unrelated','kind':'population','label':'NSCLC cultures in another experiment','population_scope':'other_cancer','parent_id':None,'evidence_ids':['E1']})
                payload['evidence'][0]['quote']='Patients with advanced melanoma were enrolled.'
                fact=payload['facts'][0];fact.update(domain='patient_demographics',field='enrolled_population',text=text,count_context='enrolled',model_id=None)
                fact['numbers'][0].update(role='sample_size',value=n,raw_text=str(n),unit='patients')
                self.assertEqual(len(clinical.project_articles([article])['articles'][0]['sample_size_records']),1)
        article=fixture();payload=article['R2']['payload'];payload['entities'][0]['label']='Safety population: patients receiving study drug'
        payload['evidence'][0]['quote']='Patients with melanoma received study drug; squamous cell carcinoma was listed as an adverse event.'
        fact=payload['facts'][0];fact.update(domain='patient_demographics',field='safety_population',text='Cancer antigens and assays are discussed elsewhere.',count_context='safety',model_id=None)
        fact['numbers'][0].update(role='sample_size',value=287,raw_text='287',unit='patients')
        self.assertEqual(len(clinical.project_articles([article])['articles'][0]['sample_size_records']),1)

    def test_actual_27646942_melanoma_counts_survive_same_quote_NSCLC_comparison(self):
        quote=('Incidence was similar in patients with melanoma and non-small-cell lung cancer '
               '(overall, 26 of 532 [5%] v nine of 209 [4%]; monotherapy, 15 of 417 v five of 152; '
               'combination, 11 of 115 v four of 57).')
        for n in (532,417,115):
            article=fixture();payload=article['R2']['payload'];payload['entities'][0]['label']='Patients with melanoma, primary origin unspecified'
            payload['evidence'][0]['quote']=quote
            fact=payload['facts'][0];fact.update(domain='safety_outcomes',field='pneumonitis_incidence_by_malignancy',text='Melanoma patients compared with non-small-cell lung cancer.',count_context='treated',model_id=None)
            fact['numbers'][0].update(role='sample_size',value=n,raw_text=str(n),unit='patients')
            samples=clinical.project_articles([article])['articles'][0]['sample_size_records']
            self.assertEqual([s['n']['value']for s in samples],[n])

    def test_patient_counts_preserve_exact_existing_actual_arm_and_leave_unassigned_total_null(self):
        article=fixture();payload=article['R2']['payload'];original=payload['facts'][0]
        for ident,label in [('mono','Anti-PD-1 monotherapy'),('combo','Anti-PD-1 plus anti-CTLA-4')]:
            payload['entities'].append({'entity_id':ident,'kind':'arm','label':label,'population_scope':'not_applicable','parent_id':None,'evidence_ids':['E1']})
        payload['facts']=[]
        for n,arm in [(532,None),(417,'mono'),(115,'combo')]:
            fact=deepcopy(original);fact.update(fact_id='N'+str(n),domain='safety_outcomes',field='melanoma_treated_population',text='Melanoma patient count',count_context='treated',model_id=None,arm_id=arm)
            fact['numbers'][0].update(role='sample_size',value=n,raw_text=str(n),unit='patients');payload['facts'].append(fact)
        before=deepcopy(article);samples=clinical.project_articles([article])['articles'][0]['sample_size_records']
        by_n={s['n']['value']:s for s in samples}
        self.assertIsNone(by_n[532]['arm_id']);self.assertIsNone(by_n[532]['arm'])
        for n,arm in [(417,'mono'),(115,'combo')]:
            s=by_n[n];self.assertTrue(s['arm_id'].endswith('-'+arm));self.assertEqual(s['arm'],next(e for e in payload['entities']if e['entity_id']==arm))
            self.assertEqual(s['original_fact']['arm_id'],arm);self.assertEqual(s['sample_context_role'],'treated')
        self.assertEqual(article,before)


if __name__=='__main__':unittest.main()
