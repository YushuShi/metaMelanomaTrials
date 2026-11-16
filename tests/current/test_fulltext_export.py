from copy import deepcopy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma import quantitative as q, schema
from metamelanoma.fulltext_export import project_fulltext, publication_inputs, publish, _check_publication_predecessor
from metamelanoma.io import atomic_json, reference
from metamelanoma.quantitative_export import project_pilot
from metamelanoma.screening import build_source, catalog_for
from test_quantitative import fixture, count, effect


def export_fixture():
    source, raw, evidence = fixture()
    source['report_id'] = raw['report_id'] = 'report-' + 'a' * 24
    raw['source_sha256'] = schema.digest(source)
    raw['sample_sizes'] = [count('n1', 107, 'a', evidence), count('n2', 50, 'b', evidence)]
    raw['effects'] = [effect(evidence)]
    validation = q.validate(raw, source)
    assert validation['valid'], validation
    r2 = {'task_id': 'r2-task', 'source': source, 'validation': validation}
    citation = {'pmid': '123', 'report_id': source['report_id'], 'title': 'A melanoma trial'}
    baseline = project_pilot({'phase_id': 'r2', 'articles': [{'citation': citation}]}, [r2])
    source3 = build_source(citation, 'R3', source['blocks'][-1]['text'] + ' The model adjusted for age. Anti-PD-1 alternatives were nivolumab or pembrolizumab.',
        fulltext_verified=True, upstream_R2=validation['record'])
    evidence3 = [catalog_for(source3)['spans'][0]['span_id']]
    raw3 = deepcopy(raw)
    raw3.update(stage='R3', source_sha256=schema.digest(source3),
        r2_links=[{'section': 'effects', 'r2_id': 'hr', 'r3_id': 'hr', 'relation': 'same', 'evidence': evidence3}],
        study_details={'population_description': 'Melanoma patients', 'design_description': 'Randomized trial',
            'evidence': evidence3, 'adjustments': []})
    for row in [raw3['decision'], raw3['study'], *raw3['populations'], *raw3['arms'], *raw3['sample_sizes'], *raw3['effects']]:
        row['evidence'] = evidence3
    validation3 = q.validate(raw3, source3)
    assert validation3['valid'], validation3
    ref = {'path': 'fixture.json', 'sha256': 'f' * 64, 'bytes': 1}
    result = {'task_id': 'r3-task', 'source': source3, 'validation': validation3,
        'artifact_ref': ref, 'R2_artifact_ref': ref, 'source_proof_ref': ref,
        'R2_record': deepcopy(validation['record'])}
    report = {'pmid': '123', 'task_id': 'r3-task', 'entered': True, 'technical_state': 'complete',
        'report_complete': True, 'eligibility_finished': True, 'attempt_count': 1}
    return baseline, ref, result, report


class FulltextExportTests(unittest.TestCase):
    def project(self, baseline, ref, result, report):
        return project_fulltext(baseline, baseline_ref=ref, phase_id='r3-test',
            records=[] if result is None else [result], reports=[report])

    def linked_entities(self, result):
        record = result['validation']['record']
        for section, ident in [('populations', 'pop'), ('arms', 'a'), ('arms', 'b')]:
            record['r2_links'].append({'section': section, 'r2_id': ident, 'r3_id': ident,
                'relation': 'supplement', 'evidence': record['decision']['evidence']})

    def test_linked_population_expansion_and_missing_dose_choose_r3_display(self):
        baseline, ref, result, report = export_fixture()
        self.linked_entities(result)
        record = result['validation']['record']
        record['populations'][0]['label'] = 'Melanoma including cutaneous and mucosal melanoma'
        record['arms'][0]['nodes'][0]['dose'] = '3 mg/kg'
        record['effects'][0]['ci_lower'] = record['effects'][0]['ci_upper'] = 'NA'
        before = deepcopy(baseline)
        payload = self.project(baseline, ref, result, report)
        rows = payload['clinical_evidence']['articles'][0]['quantitative_results']
        main = [r for r in rows if r['main_result_eligible']]
        self.assertEqual(len(main), 1)
        self.assertEqual(main[0]['review_stage'], 'R3')
        self.assertEqual(main[0]['ci_lower']['value'], .5)
        self.assertEqual({s['review_stage'] for s in main[0]['display_supplements']}, {'R2'})
        self.assertEqual(baseline, before)

    def test_refinement_needs_population_and_arm_links(self):
        for missing in ('populations', 'arms'):
            baseline, ref, result, report = export_fixture(); self.linked_entities(result)
            record = result['validation']['record']
            record['populations'][0]['label'] = 'Metastatic melanoma'
            record['arms'][0]['nodes'][0]['dose'] = '3 mg/kg'
            record['r2_links'] = [r for r in record['r2_links'] if r['section'] != missing]
            rows = self.project(baseline, ref, result, report)['clinical_evidence']['articles'][0]['quantitative_results']
            self.assertEqual(sum(r['main_result_eligible'] for r in rows), 2)

    def test_known_scope_model_cutoff_dose_or_sequence_changes_do_not_refine(self):
        for change in ('scope', 'model', 'cutoff', 'dose', 'time', 'sequence', 'negation'):
            baseline, ref, result, report = export_fixture(); self.linked_entities(result)
            record = result['validation']['record']
            record['populations'][0]['label'] = 'Metastatic melanoma'
            prior = baseline['articles'][0]['records'][0]['record']
            if change == 'scope': record['populations'][0]['scope'] = 'subgroup'
            if change == 'model': record['effects'][0]['model'] = 'AFT'
            if change == 'cutoff': prior['effects'][0]['cutoff'] = '2024'; record['effects'][0]['cutoff'] = '2025'
            if change == 'dose': prior['arms'][0]['nodes'][0]['dose'] = '3 mg/kg'; record['arms'][0]['nodes'][0]['dose'] = '10 mg/kg'
            if change == 'time': prior['effects'][0]['time'] = 12; record['effects'][0]['time'] = 24
            if change == 'negation': record['populations'][0]['label'] = 'No melanoma patients'
            if change == 'sequence':
                arm = record['arms'][0]; leaf = deepcopy(arm['nodes'][0]); leaf['id'] = 'later'; leaf['name'] = 'ipilimumab'
                arm['nodes'].extend([leaf, {'id': 'sequence', 'kind': 'SEQUENTIAL', 'children': [arm['root_id'], 'later'], 'name': 'NA', 'dose': 'NA', 'route': 'NA', 'schedule': 'NA'}]); arm['root_id'] = 'sequence'
            result['R2_record'] = deepcopy(prior)
            with self.subTest(change=change):
                rows = self.project(baseline, ref, result, report)['clinical_evidence']['articles'][0]['quantitative_results']
                self.assertEqual(sum(r['main_result_eligible'] for r in rows), 2)

    def test_class_refinement_requires_named_or_source_and_curated_matching_targets(self):
        catalog = json.loads((Path(__file__).resolve().parents[2] / 'config/drug_catalog.json').read_text())
        for change in ('valid', 'AND', 'wrong_target', 'missing_catalog', 'absent_arm_evidence'):
            baseline, ref, result, report = export_fixture(); self.linked_entities(result)
            prior = baseline['articles'][0]['records'][0]['record']
            prior['arms'][0]['nodes'][0].update(kind='class', name='anti-PD-1')
            result['R2_record'] = deepcopy(prior)
            record = result['validation']['record']; arm = record['arms'][0]
            leaf = deepcopy(arm['nodes'][0]); leaf.update(id='alternative', name='ipilimumab' if change == 'wrong_target' else 'pembrolizumab')
            arm['nodes'].extend([leaf, {'id': 'alternatives', 'kind': 'AND' if change == 'AND' else 'OR',
                'children': [arm['root_id'], 'alternative'], 'name': 'NA', 'dose': 'NA', 'route': 'NA', 'schedule': 'NA'}]); arm['root_id'] = 'alternatives'
            if change == 'absent_arm_evidence': arm['evidence'] = []
            payload = project_fulltext(baseline, baseline_ref=ref, phase_id='r3', reports=[report], records=[result],
                drug_catalog={} if change == 'missing_catalog' else catalog)
            rows = [r for r in payload['clinical_evidence']['articles'][0]['quantitative_results'] if r['main_result_eligible']]
            with self.subTest(change=change):
                self.assertEqual(len(rows), 1 if change == 'valid' else 2)
                if change == 'valid': self.assertEqual(rows[0]['review_stage'], 'R3')

    def test_exact_duplicates_group_but_both_source_records_and_r2_counts_survive(self):
        baseline, ref, result, report = export_fixture()
        before = deepcopy((baseline, result))
        payload = self.project(baseline, ref, result, report)
        article = payload['clinical_evidence']['articles'][0]
        self.assertEqual(sum(r['main_result_eligible'] for r in article['quantitative_results']), 1)
        self.assertEqual(len(article['quantitative_results']), 2)
        self.assertEqual(payload['articles'][0]['records'][0], baseline['articles'][0]['records'][0])
        self.assertEqual(payload['about_progress']['stages']['R2'], baseline['about_progress']['stages']['R2'])
        self.assertEqual((baseline, result), before)
        self.assertTrue(all(not r['pooling_eligible'] for r in article['quantitative_results']))

    def test_only_missing_fields_supplement_with_source_provenance(self):
        baseline, ref, result, report = export_fixture()
        old = baseline['clinical_evidence']['articles'][0]['quantitative_results'][0]
        # Simulate a validated R2 with an unavailable interval, retaining its source object.
        for key in ('ci_lower', 'ci_upper'):
            old[key].update(value=None, status='not_reported', raw_text=None, qualifier='not_reported')
        payload = self.project(baseline, ref, result, report)
        row = payload['clinical_evidence']['articles'][0]['quantitative_results'][0]
        self.assertEqual((row['ci_lower']['value'], row['ci_upper']['value']), (.5, .98))
        self.assertIsNone(row['raw_source_record']['ci_lower']['value'])
        self.assertEqual({s['field'] for s in row['display_supplements']}, {'ci_lower', 'ci_upper'})
        self.assertEqual(row['ci_lower']['evidence_ids'], payload['clinical_evidence']['articles'][0]['quantitative_results'][1]['ci_lower']['evidence_ids'])

    def test_numeric_conflict_remains_two_source_values(self):
        baseline, ref, result, report = export_fixture()
        result['validation']['record']['effects'][0]['estimate'] = .8
        payload = self.project(baseline, ref, result, report)
        rows = payload['clinical_evidence']['articles'][0]['quantitative_results']
        self.assertEqual([r['estimate']['value'] for r in rows], [.7, .8])
        self.assertTrue(all(r['main_result_eligible'] and r['extraction_conflict'] for r in rows))

    def test_explicit_conflict_is_preserved_even_when_numbers_agree(self):
        baseline, ref, result, report = export_fixture()
        result['validation']['record']['r2_links'][0]['relation'] = 'conflict'
        rows = self.project(baseline, ref, result, report)['clinical_evidence']['articles'][0]['quantitative_results']
        self.assertTrue(all(r['main_result_eligible'] and r['extraction_conflict'] for r in rows))

    def test_wrong_dose_population_or_endpoint_link_does_not_merge(self):
        for change in ('dose', 'population', 'endpoint'):
            baseline, ref, result, report = export_fixture()
            record = result['validation']['record']
            if change == 'dose': record['arms'][0]['nodes'][0]['dose'] = '10 mg/kg'
            if change == 'population': record['populations'][0]['label'] = 'Different melanoma subgroup'
            if change == 'endpoint': record['effects'][0]['endpoint'] = 'PFS'
            with self.subTest(change=change):
                rows = self.project(baseline, ref, result, report)['clinical_evidence']['articles'][0]['quantitative_results']
                self.assertEqual(sum(r['main_result_eligible'] for r in rows), 2)

    def test_without_explicit_row_link_no_numeric_guessing(self):
        baseline, ref, result, report = export_fixture()
        result['validation']['record']['r2_links'] = []
        rows = self.project(baseline, ref, result, report)['clinical_evidence']['articles'][0]['quantitative_results']
        self.assertEqual(sum(r['main_result_eligible'] for r in rows), 2)

    def test_ambiguous_link_does_not_hide_an_entire_valid_screening_decision(self):
        baseline, ref, result, report = export_fixture()
        result['validation']['record']['r2_links'].append(deepcopy(result['validation']['record']['r2_links'][0]))
        payload = self.project(baseline, ref, result, report)
        self.assertEqual(payload['about_progress']['stages']['R3']['screening_finished'], 1)
        self.assertEqual(sum(r['main_result_eligible'] for r in payload['clinical_evidence']['articles'][0]['quantitative_results']), 2)

    def test_completed_r3_exclusion_or_unclear_hides_main_preserving_r2(self):
        for status in ('exclude', 'unclear'):
            baseline, ref, result, report = export_fixture()
            result['validation']['record']['decision'].update(status=status, reason='Full-text decision')
            payload = self.project(baseline, ref, result, report)
            article = payload['clinical_evidence']['articles'][0]
            self.assertEqual(article['current_screening_status'], status)
            self.assertFalse(article['current_main_eligible'])
            self.assertFalse(any(r['main_result_eligible'] for r in article['quantitative_results']))
            self.assertEqual(payload['articles'][0]['records'][0]['record']['decision']['status'], 'retain')
            self.assertEqual(payload['about_progress']['stages']['R3'][status if status == 'unclear' else 'excluded'], 1)

    def test_pending_response_leaves_r2_visible_and_is_not_clinically_unclear(self):
        baseline, ref, result, report = export_fixture()
        report.update(technical_state='running', report_complete=False, eligibility_finished=False)
        payload = self.project(baseline, ref, None, report)
        self.assertTrue(payload['clinical_evidence']['articles'][0]['current_main_eligible'])
        progress = payload['about_progress']['stages']['R3']
        self.assertEqual((progress['entered'], progress['screening_finished'], progress['unclear']), (1, 0, 0))

    def test_r3_can_resolve_r2_unclear_without_rewriting_it(self):
        baseline, ref, result, report = export_fixture()
        prior = baseline['articles'][0]['records'][0]['record']
        prior['decision']['status'] = 'unclear'
        result['R2_record'] = deepcopy(prior)
        baseline['clinical_evidence']['articles'][0].update(current_screening_status='unclear', current_main_eligible=False)
        payload = self.project(baseline, ref, result, report)
        self.assertTrue(payload['clinical_evidence']['articles'][0]['current_main_eligible'])
        self.assertEqual(payload['articles'][0]['records'][0]['record']['decision']['status'], 'unclear')

    def test_source_coverage_is_not_the_same_as_finished_main_eligibility(self):
        baseline, ref, result, report = export_fixture()
        report['report_complete'] = False
        payload = self.project(baseline, ref, result, report)
        self.assertEqual(payload['about_progress']['stages']['R3']['screening_finished'], 1)
        self.assertEqual(payload['fulltext_assessment']['main_article_extraction_finished'], 1)
        self.assertEqual(payload['fulltext_assessment']['full_report_extraction_finished'], 0)

    def test_foreign_r2_or_excluded_report_or_unvalidated_response_is_rejected(self):
        for change in ('prior', 'excluded', 'invalid', 'unentered', 'false_complete'):
            baseline, ref, result, report = export_fixture()
            if change == 'prior': result['R2_record']['decision']['reason'] = 'Changed record'
            if change == 'excluded': baseline['articles'][0]['records'][0]['record']['decision']['status'] = 'exclude'
            if change == 'invalid': result['validation']['valid'] = False
            if change == 'unentered': report['entered'] = False
            if change == 'false_complete': report['technical_state'] = 'running'
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.project(baseline, ref, result, report)

    def test_browser_accepts_r3_projection_and_detail_fields_without_duplicate_main_rows(self):
        baseline, ref, result, report = export_fixture()
        payload = self.project(baseline, ref, result, report)
        script = """const p=JSON.parse(require('fs').readFileSync(0,'utf8'));
const c=require('./website/dist/quantitative_extraction.js');c.checked(p);
const merged=c.merge([],{},p);const a=require('./website/dist/about_article_progress.js');
if(!a.render(p.about_progress).includes('R3 · Full text'))throw Error('R3 progress missing');
const html=c.render(merged.studies[0]);if(!html.includes('Study characteristics'))throw Error('R3 study details missing');
if(merged.studies[0].details.quantitative_results.filter(r=>r.main_result_eligible).length!==1)throw Error('Duplicate main result');"""
        output = subprocess.run(['node', '-e', script], input=json.dumps(payload), text=True,
            capture_output=True, cwd=Path(__file__).resolve().parents[2], timeout=30)
        self.assertEqual(output.returncode, 0, output.stderr)

    def test_frozen_snapshot_refs_are_checked_without_writer_or_model_calls(self):
        baseline, _, result, report = export_fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            def saved(name, value):
                target = root / name; atomic_json(target, value); return reference(root, target)
            base_ref = saved('r2_publication.json', baseline)
            prior_ref = saved('r2_result.json', {'validated': {'valid': True, 'record': result['R2_record']}})
            source_ref = saved('source.json', result['source'])
            proof_ref = saved('proof.json', {'pmid': '123', 'main_article_complete': True,
                'source_report_coverage_complete': False, 'source_ref': source_ref, 'R2_artifact_ref': prior_ref})
            result_ref = saved('r3_result.json', {'pmid': '123', 'stage': 'R3', 'validated': result['validation'],
                'task_id': result['task_id'], 'source_ref': source_ref})
            result.update(artifact_ref=result_ref, R2_artifact_ref=prior_ref, source_proof_ref=proof_ref,
                whole_source_packet=True, report_complete=False)
            report['report_complete'] = False
            snapshot = {'R2_publication_ref': base_ref, 'records': [result], 'reports': [report],
                'plan': {'phase_id': 'r3'}, 'plan_ref': {'path': 'plan'}, 'status': {'as_of': 'now'}, 'event_head': {'seq': 10}}
            with patch('metamelanoma.fulltext_reextraction.snapshot', return_value=snapshot):
                payload = publication_inputs(root, {'path': 'plan'})
                self.assertEqual(payload['about_progress']['stages']['R3']['retained'], 1)
                self.assertEqual(payload['fulltext_assessment']['full_report_extraction_finished'], 0)
                atomic_json(root / 'proof.json', {'main_article_complete': False})
                with self.assertRaises(ValueError): publication_inputs(root, {'path': 'plan'})

    def test_stale_or_different_phase_publication_cannot_regress_progress(self):
        baseline, ref, result, report = export_fixture()
        current = self.project(baseline, ref, result, report)
        current['fulltext_assessment']['publication_snapshot'] = {'event_head': {'seq': 11}}
        previous = json.dumps(current).encode()
        _check_publication_predecessor(previous, deepcopy(current))
        stale = deepcopy(current)
        stale['fulltext_assessment']['publication_snapshot']['event_head']['seq'] = 10
        with self.assertRaises(ValueError): _check_publication_predecessor(previous, stale)
        wrong = deepcopy(current); wrong['fulltext_assessment']['phase_id'] = 'other'
        with self.assertRaises(ValueError): _check_publication_predecessor(previous, wrong)
        report.update(technical_state='running', report_complete=False, eligibility_finished=False)
        missing = self.project(baseline, ref, None, report)
        missing['fulltext_assessment']['publication_snapshot'] = {'event_head': {'seq': 12}}
        with self.assertRaises(ValueError): _check_publication_predecessor(previous, missing)

    def test_publication_executes_browser_contract_and_archives_previous_bytes(self):
        baseline, _, result, report = export_fixture()
        repo = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            for rel in ['config/treatment_registry.json', 'config/sample_size_link_reviews.json', 'config/comparison_result_reviews.json', 'website/scripts/treatment_map_defaults.cjs', 'website/scripts/regimen_projection.cjs', 'website/scripts/treatment_normalization.cjs', 'website/scripts/build_drug_type_review.cjs', 'website/scripts/treatment_map.cjs', 'website/scripts/treatment_map_model.cjs', 'website/scripts/treatment_map_cohorts.cjs', 'website/scripts/treatment_map_membership.cjs', 'website/scripts/treatment_map_evidence.cjs', 'src/metamelanoma/treatment_map.py', *[
                'website/dist/' + name + '.js' for name in ('regimen_definitions', 'treatment_groups',
                    'treatment_registry', 'treatment_resolver', 'regimen_source_rules', 'clinical_evidence', 'statistical_math', 'confidence_intervals', 'quantitative_extraction', 'trial_identifiers', 'trial_registry', 'treatment_map', 'treatment_map_analysis', 'treatment_map_effects', 'treatment_map_charts', 'treatment_map_planning')]]:
                destination = root / rel; destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(repo / rel, destination)
            public = root / 'website/dist/data/quantitative_extraction.json'
            public.parent.mkdir(parents=True)
            (root / 'data/current').mkdir(parents=True)
            atomic_json(public, baseline)
            before = public.read_bytes(); baseline_ref = reference(root, public)
            payload = self.project(baseline, baseline_ref, result, report)
            payload['fulltext_assessment']['publication_snapshot'] = {'event_head': {'seq': 10}}
            receipt = publish(root, payload)
            self.assertEqual(receipt['counts']['R3']['screening_finished'], 1)
            freshness = json.loads((root / receipt['evidence_freshness']['public_ref']['path']).read_text())
            self.assertIsNone(freshness['last_information_fetch_at'])
            self.assertNotEqual(freshness['last_information_fetch_at'], payload['as_of'])
            archive = root / receipt['previous_publication_ref']['path']
            self.assertEqual(archive.read_bytes(), before)
            saved = json.loads(public.read_text())
            self.assertEqual(public.read_bytes(), schema.canonical(saved))
            self.assertEqual(saved['articles'][0]['records'][0], baseline['articles'][0]['records'][0])
            self.assertEqual(sum(r['main_result_eligible'] for r in saved['clinical_evidence']['articles'][0]['quantitative_results']), 1)
            self.assertEqual(saved['clinical_evidence']['content_sha256'], schema.digest({key: saved['clinical_evidence'][key] for key in ('articles', 'evidence_registry')}))
            pending = deepcopy(report); pending.update(technical_state='running', report_complete=False, eligibility_finished=False)
            stale = self.project(baseline, baseline_ref, None, pending)
            stale['fulltext_assessment']['publication_snapshot'] = {'event_head': {'seq': 9}}
            published = public.read_bytes()
            with self.assertRaises(ValueError): publish(root, stale)
            self.assertEqual(public.read_bytes(), published)


if __name__ == '__main__':
    unittest.main()
