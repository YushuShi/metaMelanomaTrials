from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from metamelanoma.fulltext_export import project_fulltext
from metamelanoma.io import atomic_json, canonical, digest
from metamelanoma.source_preference import apply, effective_record, _compatible
from test_fulltext_export import export_fixture


class SourceSelectionTest(unittest.TestCase):
    def test_reviewed_preference_keeps_the_original_record_and_is_repeatable(self):
        baseline,ref,review,report = export_fixture()
        payload = project_fulltext(baseline,baseline_ref=ref,phase_id='test',records=[review],reports=[report])
        wrappers = payload['articles'][0]['records']
        original = [deepcopy(w['record']) for w in wrappers]
        rows = payload['clinical_evidence']['articles'][0]['quantitative_results']
        old,new = [next(r for r in rows if r['quantitative_record']['id']=='hr' and r['review_stage']==stage) for stage in ['R2','R3']]
        key = new['evidence_ids'][0]
        anchors = payload['clinical_evidence']['evidence_registry']
        anchors[key] = {'source_id':new['report_id']+':main:fixture','block_id':'b00023','supporting_quote':'Overall survival HR 0.8.'}
        binding = {'section':'effects','main':'R3:hr','abstract':['R2:hr'],'blocks':['b00023'],
            'values':{'estimate':0.8},'row_hashes':{w['stage']+':hr':digest(canonical(w['record']['effects'][0])) for w in wrappers}}
        finding={'pmid':'123','field':'Overall survival','source_b':'Results give an HR of 0.8.','source_reference':'abstract, b00023',
                 'main_text_side':'source_b','bindings':[binding]}
        with TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            (root/'config').mkdir()
            atomic_json(root/'config/complementary_paper_conflicts.json',{'paper_conflicts':[finding]})
            apply(root,payload)
            self.assertFalse(old['main_result_eligible'])
            self.assertEqual(new['estimate']['value'],0.8)
            self.assertEqual(effective_record(wrappers[1])['effects'][0]['estimate'],0.8)
            self.assertFalse(effective_record(wrappers[0])['effects'])
            once = canonical(payload)
            apply(root,payload)
            self.assertEqual(canonical(payload),once)
            self.assertEqual([w['record'] for w in wrappers],original)
            # A model proposal without a verified source decision cannot overwrite the GPT field.
            atomic_json(root/'config/complementary_paper_conflicts.json',{'paper_conflicts':[]})
            apply(root,payload)
            self.assertNotIn('source_preference',new)
            self.assertEqual(new['quantitative_record']['estimate'],original[1]['effects'][0]['estimate'])

    def test_endpoint_sites_and_purposes_stay_distinct(self):
        base={'id':'pfs','endpoint':'PFS','kind':'median'}
        self.assertFalse(_compatible(base,{**base,'id':'intracranial_pfs'},'survival',[]))
        self.assertFalse(_compatible({'id':'n','count_purpose':'randomized'}, {'id':'n','count_purpose':'treated'},'sample_sizes',[]))
