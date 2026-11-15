import unittest
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import tempfile
from unittest.mock import patch

from metamelanoma import quantitative as q
from metamelanoma.quantitative_export import project_pilot, selected_n, combine_complete_cohort, r3_routing, _publication_snapshot
from metamelanoma.io import atomic_json, reference
from metamelanoma.screening import build_source, catalog_for


class PilotExportTests(unittest.TestCase):
    def fixture(self, pmid='123'):
        citation = {'pmid': pmid, 'report_id': 'report-' + 'a' * 21 + pmid,
            'title': 'Trial of melanoma treatment', 'abstract': '157 melanoma patients were randomized: 107 received A and 50 received B. HR 0.7 (95% CI 0.5–0.9).'}
        source = build_source(citation)
        evidence = [catalog_for(source)['spans'][-1]['span_id']]
        r = q.empty_record(source)
        r['decision'] = {'status': 'retain', 'reason_code': 'eligible', 'reason': 'Human melanoma treatment trial', 'evidence': evidence}
        r['populations'] = [{'id': 'p', 'scope': 'overall', 'label': 'Melanoma patients', 'parent_id': 'NA', 'melanoma_only': 'yes', 'cutoff': 'NA', 'evidence': evidence}]
        r['arms'] = [{'id': a, 'population_id': 'p', 'label': a, 'root_id': a+'1',
            'nodes': [{'id': a+'1', 'kind': 'drug', 'name': a, 'children': [], 'dose': 'NA', 'route': 'NA', 'schedule': 'NA'}], 'evidence': evidence} for a in ('A', 'B')]
        r['sample_sizes'] = [{'id': a+'n', 'population_id': 'p', 'arm_id': a, 'result_id': 'NA', 'count_purpose': 'randomized', 'n': n, 'cutoff': 'NA', 'method': 'reported', 'component_ids': [], 'disjoint': 'yes', 'complete': 'yes', 'evidence': evidence} for a, n in [('A', 107), ('B', 50)]]
        r['effects'] = [{'id': 'hr', 'population_id': 'p', 'endpoint_definition': 'OS', 'cutoff': 'NA', 'origin': 'own_report', 'evidence': evidence,
            'intervention_arm_id': 'A', 'reference_arm_id': 'B', 'endpoint': 'OS', 'measure': 'HR', 'estimate': .7, 'ci_lower': .5, 'ci_upper': .9, 'ci_level': 95,
            'analysis_n': 'NA', 'adjusted': 'NA', 'model': 'NA', 'p_value': 'NA', 'p_test': 'NA', 'p_sidedness': 'NA'}]
        plan = {'phase_id': 'test', 'articles': [{'citation': citation}], 'sampling': {}}
        result = {'task_id': 'test-task', 'source': source, 'validation': {'valid': True, 'global_errors': [], 'issues': [], 'record': r}}
        return plan, result

    def test_arm_sum_supplies_total_without_mutating_reported_results(self):
        plan, result = self.fixture(); before = deepcopy(result)
        payload = project_pilot(plan, [result]); row = payload['clinical_evidence']['articles'][0]['quantitative_results'][0]
        self.assertEqual(row['analysis_n']['value'], 157)
        self.assertEqual(row['sample_size_basis'], 'sum_randomized')
        self.assertEqual(payload['scope_pmids'], ['123'])
        self.assertEqual(result, before)
        self.assertFalse(row['pooling_eligible'])

    def test_global_total_not_given_to_an_arm_or_subset_contrast(self):
        _, result = self.fixture(); r = result['validation']['record']; effect = r['effects'][0]
        r['sample_sizes'] = [{**r['sample_sizes'][0], 'arm_id': 'NA', 'n': 999}]
        r['arms'].append({**r['arms'][0], 'id': 'C'})
        self.assertEqual(selected_n(effect, r, collection='effects')[0], 'NA')
        self.assertEqual(selected_n({'population_id':'p','arm_id':'A','analysis_n':'NA','id':'median','cutoff':'NA'}, r, collection='survival')[0], 'NA')

    def test_conflicting_arm_counts_are_not_added(self):
        _, result = self.fixture(); r = result['validation']['record']
        r['sample_sizes'].append({**r['sample_sizes'][0], 'id': 'conflict', 'n': 108})
        self.assertEqual(selected_n(r['effects'][0], r, collection='effects')[:2], ('NA', 'conflicting'))

    def test_subgroup_and_cutoff_counts_stay_separate(self):
        _, result = self.fixture(); r = result['validation']['record']
        for s in r['sample_sizes']: s['population_id'] = 'subgroup'
        self.assertEqual(selected_n(r['effects'][0], r, collection='effects')[0], 'NA')
        for s in r['sample_sizes']: s['population_id'] = 'p'; s['cutoff'] = 'earlier'
        self.assertEqual(selected_n(r['effects'][0], r, collection='effects')[0], 'NA')

    def test_incomplete_or_duplicate_pilot_cannot_publish(self):
        plan, result = self.fixture()
        for records in ([], [result,result]):
            with self.assertRaises(ValueError): project_pilot(plan, records)

    def test_exclusion_is_counted_but_never_shown_as_eligible(self):
        plan, result = self.fixture(); result['validation']['record']['decision']['status'] = 'exclude'
        p = project_pilot(plan,[result]); a=p['clinical_evidence']['articles'][0]
        self.assertEqual(p['about_progress']['stages']['R2']['excluded'],1)
        self.assertFalse(a['current_main_eligible'])
        self.assertTrue(all(not x['main_result_eligible'] for x in a['quantitative_results']))

    def test_foreign_population_rows_never_enter_main_display(self):
        plan, result = self.fixture(); result['validation']['record']['populations'][0]['melanoma_only']='no'
        a = project_pilot(plan,[result])['clinical_evidence']['articles'][0]
        self.assertTrue(all(not x['main_result_eligible'] for x in a['quantitative_results']))
        self.assertEqual(a['sample_size_records'],[])

    def test_arm_response_keeps_its_n_and_arm_with_source_comparison(self):
        plan, result = self.fixture(); r = result['validation']['record']
        r['binary'] = [{**{k:r['effects'][0][k] for k in ('population_id','cutoff','origin','evidence')},
            'id':'response-B','arm_id':'B','endpoint':'ORR','endpoint_definition':'Objective response',
            'numerator':'NA','denominator':'NA','percentage':20,'ci_lower':'NA','ci_upper':'NA',
            'ci_level':95,'assessment_time':'NA','time_unit':'NA','response_criteria':'NA',
            'safety_attribution':'NA'}]
        a = project_pilot(plan,[result])['clinical_evidence']['articles'][0]
        row = next(x for x in a['quantitative_results'] if x['variable']=='ORR')
        self.assertEqual(row['analysis_n']['value'],50)
        self.assertIsNone(row['denominator']['value'])
        self.assertEqual(row['arm']['entity_id'],'B')
        self.assertEqual(row['experimental_arm']['entity_id'],'A')
        self.assertEqual(row['comparator_arm']['entity_id'],'B')
        self.assertEqual(row['result_relation'],'arm_specific')

    def test_derived_ci_is_never_listed_as_source_reported(self):
        plan, result = self.fixture(); r = result['validation']['record']
        r['derivations'] = [{'section':'effects','id':'hr','field':'ci','method':'derived_two_sided_Wald'}]
        row = project_pilot(plan,[result])['clinical_evidence']['articles'][0]['quantitative_results'][0]
        self.assertTrue(row['ci_lower']['derived'])
        self.assertTrue(row['ci_upper']['derived'])
        self.assertNotIn('ci_lower',{x['role'] for x in row['source_reported_numbers']})
        self.assertNotIn('ci_upper',{x['role'] for x in row['source_reported_numbers']})

    def test_single_group_counts_keep_treatment_searchable_without_outcome(self):
        plan, result = self.fixture(); r = result['validation']['record']
        r['effects'] = []; r['arms'] = r['arms'][:1]
        r['sample_sizes'] = r['sample_sizes'][:1]
        r['study']['comparison_structure'] = 'single_group'
        a = project_pilot(plan,[result])['clinical_evidence']['articles'][0]
        self.assertEqual(a['quantitative_results'], [])
        c = a['comparisons'][0]
        self.assertEqual(c['kind'], 'single_arm')
        self.assertEqual(c['outcome_arm_id'], 'A')
        self.assertEqual(c['intervention_native_regimen']['arm_id'], 'A')
        self.assertEqual(c['result_ids'], [])
        self.assertTrue(c['comparison_filter_eligible'])
        r['sample_sizes'][0]['arm_id'] = 'NA'
        c = project_pilot(plan,[result])['clinical_evidence']['articles'][0]['comparisons'][0]
        self.assertNotIn('outcome_arm_id', c)

    def test_arm_counts_do_not_invent_comparative_reference_direction(self):
        plan, result = self.fixture(); r = result['validation']['record']
        r['effects'] = []; r['study']['comparison_structure'] = 'comparative'
        a = project_pilot(plan,[result])['clinical_evidence']['articles'][0]
        self.assertEqual(a['comparisons'], [])

    def test_complete_cohort_preserves_exact_disjoint_phases_and_one_about_total(self):
        parent, old = self.fixture('123'); continuation, new = self.fixture('456')
        new['validation']['record']['decision']['status'] = 'unclear'
        combined, records = combine_complete_cohort(parent, continuation, {'article_pmids': ['456', '123']}, [old], [new])
        payload = project_pilot(combined, records)
        self.assertEqual(payload['scope_kind'], 'complete_r2_cohort')
        self.assertEqual(payload['scope_pmids'], ['456', '123'])
        counts = payload['about_progress']['stages']['R2']
        self.assertEqual((counts['entered'], counts['screening_finished'], counts['retained'], counts['unclear']), (2, 2, 1, 1))
        for plan, cohort, before, after in [
            (parent, {'article_pmids':['123']}, [old], [old]),
            (continuation, {'article_pmids':['123','456','789']}, [old], [new]),
            (continuation, {'article_pmids':['123','456']}, [], [new]),
            (continuation, {'article_pmids':['123','456']}, [old], [old]),
        ]:
            with self.assertRaises(ValueError): combine_complete_cohort(parent, plan, cohort, before, after)

    def test_r3_routing_excludes_exclusions_and_preserved_publication_holds(self):
        entries, records = [], []
        for pmid, decision in [('123','retain'),('456','unclear'),('789','exclude'),('999','retain')]:
            plan, result = self.fixture(pmid); result['validation']['record']['decision']['status'] = decision
            if pmid == '999': plan['articles'][0]['citation']['publication_hold'] = 'Retracted source'
            entries.extend(plan['articles']); records.append(result)
        plan = {'phase_id':'test','articles':entries,'sampling':{}}
        route = r3_routing(plan, records)
        self.assertEqual([r['pmid'] for r in route['candidates']], ['123','456'])
        self.assertFalse(route['R3_dispatch_enabled'])
        self.assertTrue(route['full_text_verification_required'])
        held = next(a for a in project_pilot(plan, records)['clinical_evidence']['articles'] if a['pmid']=='999')
        self.assertFalse(held['current_main_eligible'])
        self.assertEqual(held['publication_hold'], 'Retracted source')
        self.assertTrue(all(not r['main_result_eligible'] for r in held['quantitative_results']))
        records[0]['validation']['valid'] = False
        with self.assertRaises(ValueError): r3_routing(plan, records)

    def test_only_recorded_missing_abstract_holds_may_remain_outside_clinical_counts(self):
        parent, old = self.fixture('123'); continuation, new = self.fixture('456')
        cohort = {'article_pmids':['123','456']}; hold = {'pmid':'456','reason':'Awaiting primary abstract availability check'}
        with self.assertRaisesRegex(ValueError, 'available abstract'):
            combine_complete_cohort(parent, continuation, cohort, [old], [], source_holds=[hold])
        continuation['articles'][0]['citation']['abstract'] = ''
        combined, records = combine_complete_cohort(parent, continuation, cohort, [old], [], source_holds=[hold])
        payload = project_pilot(combined, records)
        self.assertEqual(payload['scope_kind'], 'r2_cohort_with_source_holds')
        self.assertEqual(payload['scope_pmids'], ['123'])
        self.assertEqual(payload['authorized_scope_pmids'], ['123','456'])
        self.assertEqual(payload['source_availability_holds'], [hold])
        counts = payload['about_progress']['stages']['R2']
        self.assertEqual((counts['entered'], counts['screening_finished'], counts['unclear']), (1,1,0))
        with self.assertRaises(ValueError):
            combine_complete_cohort(parent, continuation, cohort, [old], [], source_holds=[])

    def test_optional_pending_publication_counts_attempted_articles_without_clinical_decisions(self):
        parent, old = self.fixture('123'); continuation, new = self.fixture('456')
        cohort={'article_pmids':['123','456']}
        pending=[{'pmid':'456','task_id':'prepared-task','state':'running','entered':True,'attempt_count':1}]
        with self.assertRaisesRegex(ValueError,'explicit allow_pending'):
            combine_complete_cohort(parent,continuation,cohort,[old],[],pending_reports=pending)
        combined,records=combine_complete_cohort(parent,continuation,cohort,[old],[],pending_reports=pending,allow_pending=True)
        payload=project_pilot(combined,records); counts=payload['about_progress']['stages']['R2']
        self.assertEqual((counts['entered'],counts['screening_finished'],counts['retained'],counts['unclear']),(2,1,1,0))
        self.assertEqual(payload['scope_kind'],'r2_cohort_in_progress')
        self.assertEqual(payload['scope_pmids'],['123'])
        self.assertEqual(payload['pending_reports'],pending)
        self.assertEqual([r['pmid'] for r in r3_routing(combined,records)['candidates']],['123'])
        for state in ('held_unknown_send','validation_hold','provider_hold','held_integrity'):
            p=[{**pending[0],'state':state}]
            plan,rows=combine_complete_cohort(parent,continuation,cohort,[old],[],pending_reports=p,allow_pending=True)
            self.assertEqual(project_pilot(plan,rows)['about_progress']['stages']['R2']['unclear'],0)
        with self.assertRaises(ValueError):
            combine_complete_cohort(parent,continuation,cohort,[old],[],pending_reports=[{**pending[0],'state':'imagined'}],allow_pending=True)

    def test_publication_snapshot_is_read_only_and_never_acquires_writer_lease(self):
        from metamelanoma import reextraction
        plan,result=self.fixture();plan['phase_id']='fixture-phase'
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();(root/'data/current').mkdir(parents=True)
            atomic_json(root/'plan.json',plan); plan_ref=reference(root,'plan.json')
            atomic_json(root/'source.json',result['source'])
            atomic_json(root/'record.json',{'task_id':'done','pmid':'123','stage':'R2','source_ref':reference(root,'source.json'),'validated':result['validation']})
            result_ref=reference(root,'record.json')
            authority={'phase_id':plan['phase_id'],'plan_ref':plan_ref,'producer_files':[],'source_or_request_holds':[]}
            atomic_json(root/f'data/current/reextraction/{plan["phase_id"]}/authority.json',authority)
            dbpath=root/reextraction.DB_PATH
            with sqlite3.connect(dbpath) as db:
                db.executescript('CREATE TABLE reextraction_phases(phase_id TEXT,authority_json TEXT);CREATE TABLE reextraction_tasks(task_id TEXT,phase_id TEXT,pmid TEXT,task_ref_json TEXT,state TEXT,result_ref_json TEXT,next_retry REAL);CREATE TABLE reextraction_attempts(task_id TEXT,record_json TEXT);CREATE TABLE reextraction_events(seq INTEGER,event_hash TEXT,payload TEXT);')
                db.execute('INSERT INTO reextraction_phases VALUES(?,?)',(plan['phase_id'],json.dumps(authority)))
                db.execute('INSERT INTO reextraction_tasks VALUES(?,?,?,?,?,?,?)',('done',plan['phase_id'],'123','{}','complete',json.dumps(result_ref),None))
                for pmid,state,record in [('456','running',{}),('789','pending',None),('999','not_sent',{'result':{'sent':False}})]:
                    db.execute('INSERT INTO reextraction_tasks VALUES(?,?,?,?,?,?,?)',(pmid,plan['phase_id'],pmid,'{}',state,None,None))
                    if record is not None:db.execute('INSERT INTO reextraction_attempts VALUES(?,?)',(pmid,json.dumps(record)))
            before=dbpath.read_bytes()
            with patch.object(reextraction,'_plan',return_value=(plan,[])),patch.object(reextraction.PilotJournal,'__init__',side_effect=AssertionError('Writer lease attempted')):
                _,_,records,pending,snapshot=_publication_snapshot(root,plan_ref)
            self.assertEqual(len(records),1);self.assertTrue(snapshot['read_only'])
            self.assertEqual({p['pmid']:p['entered'] for p in pending},{'456':True,'789':False,'999':False})
            self.assertEqual(dbpath.read_bytes(),before)


if __name__ == '__main__': unittest.main()
