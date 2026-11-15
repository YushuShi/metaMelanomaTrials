from copy import deepcopy
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from metamelanoma import schema, screening, validation
from metamelanoma.adjudication import apply_closed_subset
from metamelanoma.io import atomic_json, reference
from test_scientific_contract import fixture


class SourceSubsetIngestionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        module = Path(__file__).resolve().parents[2]/'src/metamelanoma/adjudication.py'
        target = self.root/'src/metamelanoma/adjudication.py'
        target.parent.mkdir(parents=True)
        shutil.copyfile(module, target)
        r2, _, payload = fixture()
        self.source = screening.build_source({'report_id':'r','pmid':'1'}, 'R3',
            [{'source_id':'r:main', 'block_id':'b1', 'text':r2['blocks'][1]['text'],
              'is_target':True, 'document_role':'main_article', 'planned_only':False}],
            fulltext_verified=True, upstream_R2=payload)
        payload.update(stage='R3', source_sha256=schema.digest(self.source))
        payload['evidence'][0]['span_id'] = screening.catalog_for(self.source)['spans'][0]['span_id']
        self.view = validation.validate(payload, self.source,
            request_schema=schema.report_schema(screening.catalog_for(self.source), source=self.source))
        self.assertTrue(self.view['decision_valid'])
        self.assertEqual(self.view['counts']['held_facts'], 0)
        self.source_ref = self.save('original_source.json', self.source)
        native_ref = self.save('native_view.json', {'source':self.source_ref,'validation':self.view})
        raw = self.root/'primary.xml'; raw.write_text('Literal primary source')
        self.raw_ref = reference(self.root, 'primary.xml')
        document = {'raw_ref':self.raw_ref, 'blocks':deepcopy(self.source['blocks'])}
        self.db = sqlite3.connect(':memory:')
        self.db.execute('CREATE TABLE sources(pmid,source_json,verified)')
        self.registry = SimpleNamespace(db=self.db, source=lambda *args:document,
            save_fragment=Mock(), mark_attempt=Mock())
        self.task = {'task_id':'r3-test', 'stage':'R3', 'model':'gpt-6-luna',
            'metadata':{'pmid':'1', 'source_ref':self.source_ref}}
        self.proposal = {'is_native_response':False, 'source':deepcopy(self.source),
            'payload':deepcopy(payload), 'validation':deepcopy(self.view),
            'original_native_validation':deepcopy(self.view), 'lineage':{
                'original_task_id':'r3-test', 'original_source_ref':self.source_ref,
                'original_native_view_ref':native_ref, 'raw_source_ref':self.raw_ref}}
        self.review = self.save('peer.json', {'status':'reviewed'})
        self.scope = self.save('scope.json', ['1'])

    def tearDown(self):
        self.db.close(); self.temp.cleanup()

    def save(self, name, value):
        atomic_json(self.root/name, value)
        return reference(self.root, name)

    def apply(self):
        with patch('metamelanoma.adjudication.aggregate_fragments', return_value=True):
            return apply_closed_subset(self.root, self.registry, self.task,
                self.save('proposal.json', self.proposal), self.review, self.scope)

    def test_exact_graph_has_explicit_derived_provenance_and_no_pooling_claim(self):
        result = self.apply()
        self.assertEqual(result['accepted_facts'], 1)
        qualified = self.registry.save_fragment.call_args.args[5]
        self.assertFalse(qualified['is_native_response'])
        self.assertFalse(qualified['pooling_eligible'])
        self.assertFalse(qualified['full_R3_extraction_complete'])
        self.assertEqual(qualified['facts'], self.view['validated_facts'])

    def test_scope_is_finite(self):
        self.scope = self.save('scope.json', ['2'])
        with self.assertRaisesRegex(ValueError, 'finite'): self.apply()
        self.registry.save_fragment.assert_not_called()

    def test_original_target_cannot_be_relabeled_context(self):
        self.proposal['source']['blocks'][0]['is_target'] = False
        with self.assertRaisesRegex(ValueError, 'target roles'): self.apply()
        self.registry.save_fragment.assert_not_called()

    def test_foreign_context_cannot_be_added(self):
        self.proposal['source']['blocks'].append({'source_id':'elsewhere','block_id':'b2',
            'text':'Other article', 'is_target':False})
        with self.assertRaisesRegex(ValueError, 'primary source unit'): self.apply()
        self.registry.save_fragment.assert_not_called()

    def test_same_primary_context_is_non_target_and_keeps_numeric_graph(self):
        context = {'source_id':'r:main','block_id':'b2','text':'Additional study methods.',
            'is_target':True,'document_role':'main_article','planned_only':False}
        document = {'raw_ref':self.raw_ref,'blocks':[*self.source['blocks'],context]}
        self.registry.source = lambda *args: document
        self.proposal['source']['blocks'].append({**context,'is_target':False})
        self.proposal['payload']['source_sha256'] = schema.digest(self.proposal['source'])
        self.proposal['validation'] = validation.validate(self.proposal['payload'],self.proposal['source'],
            request_schema=schema.report_schema(screening.catalog_for(self.proposal['source']),
                source=self.proposal['source']))
        self.assertTrue(self.apply()['article_screening_finished'])
        qualified = self.registry.save_fragment.call_args.args[5]
        self.assertEqual(qualified['facts'], self.view['validated_facts'])

    def test_forged_accepted_graph_cannot_promote_a_held_number(self):
        self.proposal['original_native_validation']['validated_facts'] = []
        with self.assertRaisesRegex(ValueError, 'validation lineage'): self.apply()
        self.registry.save_fragment.assert_not_called()

    def test_numeric_value_change_fails_whole_validator(self):
        self.proposal['payload']['facts'][0]['numbers'][0]['value'] = 26
        with self.assertRaisesRegex(ValueError, 'unchanged validator'): self.apply()
        self.registry.save_fragment.assert_not_called()

    def test_new_exclusion_keeps_prior_graph_privately_and_canonical_graph_empty(self):
        prior = {k:deepcopy(self.view['validated_'+k]) for k in ('facts','models','entities')}
        self.proposal.update(prior_graph_kept_private_for_new_exclusion=True,previous_accepted_graph=prior)
        for key in prior:self.proposal['payload'][key]=[]
        self.proposal['payload']['decision'].update(status='exclude',reason_code='ineligible_design',
            reason='This fixture tests canonical exclusion and private evidence preservation.')
        self.proposal['validation']=validation.validate(self.proposal['payload'],self.source,
            request_schema=schema.report_schema(screening.catalog_for(self.source),source=self.source))
        result=self.apply()
        self.assertEqual(self.registry.save_fragment.call_args.args[5]['facts'],[])
        record=json.loads((self.root/result['artifact']['path']).read_text())
        self.assertEqual(record['previous_accepted_graph'],prior)
        self.assertTrue(record['prior_graph_kept_private_for_new_exclusion'])

    def test_new_exclusion_cannot_drop_prior_accepted_graph(self):
        for key in ('facts','models','entities'):self.proposal['payload'][key]=[]
        self.proposal['payload']['decision'].update(status='exclude',reason_code='ineligible_design')
        self.proposal['validation']=validation.validate(self.proposal['payload'],self.source,
            request_schema=schema.report_schema(screening.catalog_for(self.source),source=self.source))
        with self.assertRaisesRegex(ValueError,'private preservation'):self.apply()
        self.registry.save_fragment.assert_not_called()


if __name__ == '__main__': unittest.main()
