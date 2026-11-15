"""Current source-catalog schema regressions; no network or production writes."""
from copy import deepcopy
import unittest

from metamelanoma import schema as s, validation as v
import test_scientific_contract as fixtures

LEGACY_SCHEMA_SHA256 = '3e748b153ca238f9b328746ed08caf0f38ec66b1c477cf643944ffe2b648cfc2'
INITIAL_SCHEMA_SHA256 = '7d6d134fed707e902b4ced855ca5e7b651685dbffbd0a0833974b93085989fa4'

class CatalogEnumTests(unittest.TestCase):
    def setUp(self): self.source,self.catalog,self.payload=fixtures.fixture()
    def test_legacy_schema_and_initial_contract_remain_exact(self):
        self.assertEqual(s.digest(s.report_schema()), LEGACY_SCHEMA_SHA256)
        self.assertEqual(s.digest(s.INITIAL_NATIVE_SCHEMA), INITIAL_SCHEMA_SHA256)
        for contract in (s.SCHEMA,s.INITIAL_NATIVE_SCHEMA):self.assertEqual(s.native_schema(deepcopy(contract),catalog=self.catalog,source=self.source),contract)
        old=deepcopy(self.payload);old.pop('treatment_context')
        result=v.validate(old,self.source,request_schema=s.INITIAL_NATIVE_SCHEMA)
        self.assertTrue(result['decision_valid']); self.assertEqual(result['counts']['source_checked_facts'],1)
    def test_enum_is_the_only_schema_delta_and_globals_not_mutated(self):
        contract=s.report_schema(self.catalog,source=self.source);expected=deepcopy(s.SCHEMA)
        expected['$defs']['evidence']['properties']['span_id']={'type':'string','enum':[x['span_id']for x in self.catalog['spans']]}
        for key in ('report_id','pmid','stage'):expected['properties'][key]={'type':'string','enum':[self.source[key]]}
        expected['properties']['source_sha256']={'type':'string','enum':[s.digest(self.source)]}
        self.assertEqual(contract,expected);self.assertEqual(s.digest(s.SCHEMA), LEGACY_SCHEMA_SHA256)
        self.assertEqual(s.native_schema(contract,catalog=self.catalog,source=self.source),contract)
    def test_root_defs_enum_is_enforced_recursively(self):
        contract=s.report_schema(self.catalog,source=self.source);self.assertTrue(s.check(self.payload,contract))
        bad=deepcopy(self.payload);bad['evidence'][0]['span_id']='span-foreign'
        with self.assertRaisesRegex(ValueError,'invalid enum'):s.check(bad,contract)
        result=v.validate(bad,self.source,request_schema=contract)
        self.assertFalse(result['decision_valid']);self.assertIn('invalid enum',result['global_errors'][0]);self.assertEqual(result['counts']['source_checked_facts'],0)
    def test_literal_valid_payload_keeps_all_scientific_guard_results(self):
        legacy=v.validate(self.payload,self.source,request_schema=s.SCHEMA)
        bound=v.validate(self.payload,self.source,request_schema=s.report_schema(self.catalog,source=self.source))
        legacy.pop('native_schema_sha256');bound.pop('native_schema_sha256')
        self.assertEqual(bound,legacy);self.assertTrue(bound['decision_valid']);self.assertEqual(bound['counts']['source_checked_facts'],1)
    def test_wrong_missing_or_changed_catalog_rejected(self):
        contract=s.report_schema(self.catalog,source=self.source)
        with self.assertRaises(ValueError):s.native_schema(contract)
        wrong=deepcopy(self.catalog);wrong['spans'][0]['span_id']='span-other'
        with self.assertRaises(ValueError):s.native_schema(contract,catalog=wrong,source=self.source)
        result=v.validate(self.payload,self.source,catalog=wrong,request_schema=contract)
        self.assertFalse(result['decision_valid']);self.assertTrue(result['global_errors'])
    def test_no_other_schema_relaxation_or_extra_enum_allowed(self):
        contract=s.report_schema(self.catalog,source=self.source)
        for change in ('extra_span','missing_required','number_anything','foreign_enum','removed_type'):
            bad=deepcopy(contract)
            if change=='extra_span':bad['$defs']['evidence']['properties']['span_id']['enum'].append('span-foreign')
            elif change=='missing_required':bad['required'].remove('decision')
            elif change=='number_anything':bad['$defs']['number']['properties']['value']={}
            elif change=='foreign_enum':bad['properties']['decision']['properties']['reason']['enum']=['a']
            else:bad['$defs']['evidence']['properties']['span_id'].pop('type')
            with self.subTest(change=change),self.assertRaises(ValueError):s.native_schema(bad,catalog=self.catalog,source=self.source)
    def test_empty_duplicate_and_nonstrings_fail_closed(self):
        for ids in ([],['a','a'],['a',None],['a','']):
            with self.subTest(ids=ids),self.assertRaises(ValueError):s.report_schema({'source_sha256':s.digest(self.source),'spans':[{'span_id':x}for x in ids]},source=self.source)
    def test_exact_source_identity_is_required_and_checked_at_each_root_leaf(self):
        with self.assertRaises(ValueError):s.report_schema(self.catalog)
        changed=deepcopy(self.source);changed['pmid']='2'
        with self.assertRaises(ValueError):s.report_schema(self.catalog,source=changed)
        contract=s.report_schema(self.catalog,source=self.source)
        for key in ('report_id','pmid','stage','source_sha256'):
            bad=deepcopy(self.payload);bad[key]='foreign'
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'invalid enum'):s.check(bad,contract)
            altered=deepcopy(contract);altered['properties'][key]={'type':'string','enum':['foreign']}
            with self.subTest(key=key),self.assertRaises(ValueError):s.native_schema(altered,catalog=self.catalog,source=self.source)

    def test_numerical_and_scope_guards_are_not_bypassed(self):
        bad=deepcopy(self.payload);bad['facts'][0]['numbers'][0]['value']=99
        result=v.validate(bad,self.source,request_schema=s.report_schema(self.catalog,source=self.source))
        self.assertTrue(result['decision_valid']);self.assertEqual(result['counts']['source_checked_facts'],0)
        self.assertFalse(result['clinical_verified']);self.assertFalse(result['pooling_eligible']);self.assertFalse(result['full_R3_extraction_complete'])

if __name__=='__main__':unittest.main()
