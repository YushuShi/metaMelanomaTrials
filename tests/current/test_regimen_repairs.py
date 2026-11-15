"""Finite actual-source and mutation negatives for PMID31580492 link repair."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma import regimen_repairs as repair
from metamelanoma.io import canonical, digest

ROOT = Path(__file__).resolve().parents[2]


class RegimenRepairTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Replays the real cached primary article, recorded request and native
        # output. It has no provider, Registry or accounting capability.
        with patch('sqlite3.connect',side_effect=AssertionError('No database access')) as db, \
             patch('urllib.request.urlopen',side_effect=AssertionError('No network')) as network:
            cls.proposal = repair.prepare(ROOT)
            db.assert_not_called(); network.assert_not_called()
        cls.original = cls.proposal['original_native_validation']['original_payload']

    def test_actual_eight_links_and_all_other_payload_objects_are_exact(self):
        before = canonical(self.original)
        candidate = repair.repair_links(self.original)
        self.assertEqual(candidate,self.proposal['candidate_payload'])
        expected = deepcopy(self.original)
        for fact in expected['facts']:
            if fact['fact_id'] in repair.RECIPES:
                fact['comparator_arm_id'] = 'A2'
        self.assertEqual(candidate,expected)
        self.assertEqual(canonical(self.original),before)
        for row in self.proposal['repairs']:
            self.assertEqual(row['original_links'],{'arm_id':'A2','experimental_arm_id':'A1','comparator_arm_id':'A1'})
            self.assertEqual(row['corrected_links'],{'arm_id':'A2','experimental_arm_id':'A1','comparator_arm_id':'A2'})
            self.assertTrue(row['numbers_unchanged'])

    def test_actual_current_guard_keeps_all_old_facts_and_exact_other_five_holds(self):
        old = self.proposal['original_native_validation']
        view = self.proposal['validation']
        self.assertEqual(old['counts'],{'source_checked_facts':11,'held_facts':13})
        self.assertEqual(view['counts'],{'source_checked_facts':19,'held_facts':5})
        accepted = {f['fact_id']:f for f in view['validated_facts']}
        for fact in old['validated_facts']:
            self.assertEqual(accepted[fact['fact_id']],fact)
        self.assertEqual(view['validated_entities'],old['validated_entities'])
        self.assertEqual(view['validated_models'],old['validated_models'])
        held = {r['fact_id'] for r in view['fact_results'] if r['status'] != 'source_checked'}
        self.assertEqual(held,repair.REMAIN_HELD)

    def test_every_witness_owns_exact_original_primary_target_offsets(self):
        source = self.proposal['source']
        blocks = {b['block_id']:b for b in source['blocks']}
        witnesses = [r['supporting_anchor'] for r in self.proposal['repairs']]
        witnesses += self.proposal['context_anchors']
        for anchor in witnesses:
            block = blocks[anchor['block_id']]
            self.assertTrue(block['is_target'])
            self.assertEqual(anchor['text'],block['text'][anchor['char_start']:anchor['char_end']])
            self.assertEqual(anchor['block_sha256'],digest(block['text'].encode()))
            self.assertEqual(anchor['raw_element_sha256'],block['raw_element_sha256'])
        self.assertIn('did not formally compare',witnesses[-1]['text'])
        self.assertIn('nivolumab or pembrolizumab',self.proposal['context_anchors'][0]['text'])

    def test_derivative_cannot_claim_native_whole_or_pooled_completion(self):
        q = self.proposal['qualified_payload']
        self.assertFalse(q['is_native_response'])
        self.assertEqual(q['record_kind'],'reviewed_nonnative_fact_link_repair')
        for flag in ['clinical_verified','pooling_eligible','whole_source_coverage_complete','full_R3_extraction_complete']:
            self.assertFalse(q[flag])
        self.assertEqual(self.proposal['new_model_requests'],0)
        self.assertTrue(self.proposal['requires_independent_review'])

    def test_exact_proposal_verifies_without_mutating_the_bound_record(self):
        before=canonical(self.proposal)
        self.assertEqual(repair.verify(ROOT,self.proposal),self.proposal['qualified_payload'])
        self.assertEqual(canonical(self.proposal),before)

    def test_numeric_or_nonallowlisted_link_change_is_rejected(self):
        for field in ['number','other_link','contrast']:
            candidate = repair.repair_links(self.original)
            fact = next(f for f in candidate['facts'] if f['fact_id']=='F7')
            if field == 'number':fact['numbers'][0]['value'] = 0
            elif field == 'other_link':fact['experimental_arm_id'] = 'A2'
            else:fact['contrast_type'] = 'single_arm'
            with self.assertRaisesRegex(ValueError,'Only the eight'):
                repair.verify_candidate(self.original,candidate)

    def test_foreign_article_duplicate_fact_or_different_original_pattern_rejected(self):
        for change in ['pmid','duplicate','link']:
            payload = deepcopy(self.original)
            if change == 'pmid':payload['pmid'] = '1'
            elif change == 'duplicate':payload['facts'].append(deepcopy(payload['facts'][0]))
            else:next(f for f in payload['facts'] if f['fact_id']=='F7')['arm_id']='A1'
            with self.assertRaises(ValueError):repair.repair_links(payload)

    def test_modified_primary_passage_is_not_an_owned_witness(self):
        source = deepcopy(self.proposal['source'])
        block = next(b for b in source['blocks'] if b['block_id']=='b00016')
        block['text'] = block['text'].replace('36%','38%')
        eid,bid,literal,_ = repair.RECIPES['F7']
        with self.assertRaises(ValueError):
            repair._anchor(source,self.proposal['original_native_validation']['evidence'],eid,bid,literal)

    def test_proposal_numeric_or_anchor_tampering_fails_full_reconstruction(self):
        for change in ['number','anchor']:
            proposal = deepcopy(self.proposal)
            if change == 'number':proposal['qualified_payload']['facts'][0]['numbers'][0]['value']=999
            else:proposal['repairs'][0]['supporting_anchor']['char_start']+=1
            with self.assertRaisesRegex(ValueError,'complete finite'):
                repair.verify(ROOT,proposal)

    def test_original_native_file_hash_change_refuses_before_any_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); destination=root/repair.NATIVE['path'];destination.parent.mkdir(parents=True)
            destination.write_bytes((ROOT/repair.NATIVE['path']).read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'changed'):
                repair.prepare(root)

    def test_alias_secret_and_boolean_byte_references_fail_before_read(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); target=root/'body.json';target.write_text('{}')
            (root/'alias.json').symlink_to(target)
            for path in ['alias.json','.env','credentials/body.json']:
                with self.assertRaises(ValueError):repair._load(root,{'path':path,'sha256':'0'*64,'bytes':2})
            with patch.object(repair,'reference',side_effect=AssertionError('No read for invalid bytes')):
                with self.assertRaises(ValueError):repair._load(root,{'path':'body.json','sha256':'0'*64,'bytes':True})


if __name__=='__main__':
    unittest.main()
