"""Consequential source scope rules, not generated-number mirror tests."""
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from metamelanoma.clinical_classification import RecordContext, build, write, direct, labels, stage_mentions
from metamelanoma.io import canonical, digest


def context(populations, *, setting='advanced', subtype='NA', braf='NA', previous='NA', quote='', arms=(), identifiers=()):
    raw={'pmid':'123','report_id':'report-123','source_sha256':'a'*64,'stage':'R3',
         'study':{'setting':setting,'melanoma_subtype':subtype,'braf':braf,'previous_systemic':previous,'evidence':['s'],'identifiers':list(identifiers)},
         'populations':populations,'arms':list(arms)}
    binding=digest(canonical({'task_id':'task','record':raw}));prefix='CE-'+binding[:24]+'-'
    registry={prefix+'s':{'source_id':'report-123:fulltext','block_id':'methods','supporting_quote':quote}}
    for p in populations:
        for ident in p.get('evidence',[]):registry[prefix+ident]={'source_id':'report-123:fulltext','block_id':p['id'],'supporting_quote':p.get('quote',quote)}
    for a in arms:
        for ident in a.get('evidence',[]):registry[prefix+ident]={'source_id':'report-123:fulltext','block_id':a['id'],'supporting_quote':a.get('quote',quote)}
    return RecordContext(raw,binding,registry),registry


def pop(ident,label,parent='NA',quote=None):
    return {'id':ident,'label':label,'scope':'overall' if parent=='NA' else 'subgroup','parent_id':parent,'melanoma_only':'yes','evidence':['p-'+ident],**({'quote':quote} if quote else {})}


def q(ctx,population='p',arm=None,reference=None):
    raw={'id':'e1','population_id':population,'arm_id':arm or 'NA'}
    if reference:raw.update(intervention_arm_id=arm,reference_arm_id=reference)
    return {'pmid':'123','report_id':'report-123','result_id':ctx.prefix+'F-e1','population_id':ctx.prefix+population,
            'review_binding_sha256':ctx.binding,'source_input_sha256':'a'*64,'review_stage':'R3','quantitative_record':raw}


class ClinicalClassificationTest(unittest.TestCase):
    def test_disease_stage_major_substage_ranges_and_nonstage_negatives(self):
        for wording,want in [('Stage III',{'iii'}),('Clinical stage IIIB-D',{'iii'}),('AJCC stage IIIB/IIIC',{'iii'}),
                             ('IIIB-D subgroup',{'iii'}),('Stage IIIA through IIID',{'iii'}),('Stage IIIB-D or IV',{'iii','iv'}),
                             ('Resected stage IIIB, IIIC, or IV',{'iii','iv'}),('Stage III (unresectable) or IV',{'iii','iv'}),
                             ('Stage at diagnosis: III',{'iii'}),
                             ('Stages II-IV',{'ii','iii','iv'}),('Stage 3B',{'iii'}),('Stage I and II',{'i','ii'})]:
            self.assertEqual(labels('stage',wording),want,wording)
        for wording in ['Phase III trial','Phase IIIb cohort','Metastatic melanoma','Clark levels III-V','Adjuvant melanoma','BRAF V600E']:
            self.assertEqual(labels('stage',wording),set(),wording)

    def test_stage_siblings_mixed_parent_unknown_and_edition_are_scoped(self):
        text='Patients with stage IIIB, IIIC or IV melanoma according to AJCC seventh edition were enrolled.'
        pops=[pop('all','Stage III/IV melanoma'),pop('iii','Stage IIIB/C melanoma','all'),
              pop('iv','Stage IV melanoma','all'),pop('desc','Response-evaluable subgroup','iii'),pop('unknown','Stage unknown','iii')]
        ctx,_=context(pops,quote=text)
        self.assertEqual(ctx.result(q(ctx,'all'))['fields']['stage']['status'],'mixed')
        for ident,want in [('iii','iii'),('iv','iv'),('desc','iii')]:
            v=ctx.result(q(ctx,ident))['fields']['stage'];self.assertEqual(v['categories'],[want]);self.assertEqual(v['status'],'supported')
            self.assertIn('ajcc seventh edition',v['details']['staging_edition_wording'])
        self.assertEqual(ctx.result(q(ctx,'unknown'))['fields']['stage']['status'],'NA')
        ctx,_=context([pop('p','Stage III melanoma')],quote='Patients with metastatic melanoma entered this phase III trial.')
        self.assertEqual(ctx.result(q(ctx))['fields']['stage']['status'],'NA')
        ctx,_=context([pop('p','Unresectable stage III or metastatic melanoma')],quote='Patients with unresectable stage III or metastatic melanoma were enrolled.')
        v=ctx.result(q(ctx))['fields']['stage'];self.assertEqual(v['status'],'NA');self.assertEqual(v['reason'],'inseparable_other_population_without_explicit_stage')

    def test_count_only_stage_population_gets_own_exact_sample_binding(self):
        ctx,registry=context([pop('p','Clinical stage III nodal melanoma')],quote='Patients with clinical stage III nodal melanoma were enrolled.')
        sample={'id':'s2','population_id':'p','arm_id':'NA','n':30}
        ctx.raw['sample_sizes']=[sample]
        binding=digest(canonical({'task_id':'task','record':ctx.raw}));prefix='CE-'+binding[:24]+'-'
        registry={prefix+k[len(ctx.prefix):]:v for k,v in registry.items()}
        row={'sample_record_id':prefix+'N-s2','population_id':prefix+'p','arm_id':None,'pmid':'123','report_id':'report-123',
             'review_stage':'R3','review_binding_sha256':binding,'source_input_sha256':'a'*64,'quantitative_record':sample}
        payload={'articles':[{'pmid':'123','records':[{'task_id':'task','record':ctx.raw}]}],
                 'clinical_evidence':{'content_sha256':'c'*64,'articles':[{'pmid':'123','quantitative_results':[],'sample_size_records':[row]}],'evidence_registry':registry}}
        before=canonical(payload);out=build(payload,source_file_sha256=digest(before));entry=out['samples'][row['sample_record_id']]
        self.assertNotIn('result_id',entry);self.assertEqual(out['results'],{})
        self.assertEqual(out['profiles'][entry['profile_id']]['fields']['stage']['categories'],['iii'])
        self.assertEqual(entry['raw_sample_id'],'s2');self.assertEqual(canonical(payload),before)
        self.assertEqual(canonical(out),canonical(build(payload,source_file_sha256=digest(before))))
        for field,value in [('sample_record_id',prefix+'N-other'),('population_id',prefix+'other'),('arm_id',prefix+'wrong')]:
            bad=deepcopy(payload);bad['clinical_evidence']['articles'][0]['sample_size_records'][0][field]=value
            with self.assertRaises(ValueError):build(bad,source_file_sha256='bad')

    def test_resected_stage_iv_is_adjuvant_not_active_metastatic(self):
        text='Patients with completely resected stage IV melanoma received adjuvant nivolumab.'
        ctx,_=context([pop('p','Completely resected stage IV')],setting='adjuvant',quote=text)
        fields=ctx.result(q(ctx))['fields']
        self.assertEqual(fields['setting']['categories'],['adjuvant_resected'])
        self.assertEqual(fields['advanced_line']['reason'],'not_applicable_to_exclusively_neoadjuvant_or_adjuvant_population')
        # Stage alone never establishes a setting.
        ctx,_=context([pop('p','Stage IV melanoma')],setting='NA',quote='Patients had stage IV melanoma.')
        self.assertEqual(ctx.result(q(ctx))['fields']['setting']['status'],'NA')

    def test_incomplete_resection_never_becomes_complete_adjuvant_setting(self):
        for wording,proof in [('Adjuvant after incomplete resection','Patients with incomplete resection received adjuvant therapy.'),
                              ('Adjuvant for incompletely resected melanoma','Patients with incompletely resected melanoma received adjuvant therapy.'),
                              ('Adjuvant therapy','Patients with incomplete resection received adjuvant therapy.')]:
            value=direct('setting',wording,[('CE-x-s',proof)])
            self.assertEqual(value['status'],'NA');self.assertEqual(value['categories'],[])
        ctx,_=context([pop('p','Adjuvant after incomplete resection')],setting='adjuvant',quote='Patients with incomplete resection received adjuvant therapy.')
        self.assertEqual(ctx.result(q(ctx))['fields']['setting']['status'],'NA')

    def test_resected_recurrence_trial_uses_both_bound_statements_without_title_inference(self):
        for setting,wording,endpoint,want in [
            ('adjuvant','Patients with resected stage IIIB-C or stage IV melanoma received nivolumab.',
             'We randomly assigned patients. The primary end point was recurrence-free survival.',True),
            ('NA','Patients with resected stage IIIB-C or stage IV melanoma received nivolumab.',
             'We randomly assigned patients. The primary end point was recurrence-free survival.',False),
            ('adjuvant','Patients with previously resected stage IV melanoma received nivolumab.',
             'The primary end point was recurrence-free survival.',False),
            ('adjuvant','Patients with resected stage IV melanoma received nivolumab.',
             'The primary end point was overall survival.',False),
            ('adjuvant','Patients with incompletely resected stage IV melanoma received nivolumab.',
             'The primary end point was recurrence-free survival.',False),
        ]:
            ctx,registry=context([pop('p','Resected stage III/IV melanoma')],setting=setting,quote=wording)
            ctx.raw['study']['evidence'].append('methods')
            registry[ctx.prefix+'methods']={'source_id':'report-123:fulltext','block_id':'methods','supporting_quote':endpoint}
            ctx=RecordContext(ctx.raw,ctx.binding,registry)
            result=ctx.result(q(ctx))['fields']['setting']
            self.assertEqual(result['status']=='supported',want,(setting,wording,endpoint))
            if want:
                self.assertEqual(result['categories'],['adjuvant_resected'])
                self.assertEqual(set(result['evidence_ids']),{ctx.prefix+'s',ctx.prefix+'methods'})

    def test_first_advanced_line_after_prior_adjuvant_remains_first(self):
        text='Patients with previously untreated advanced melanoma received first-line nivolumab; prior adjuvant therapy was allowed.'
        ctx,_=context([pop('p','First-line advanced melanoma after prior adjuvant therapy')],previous='untreated',quote=text)
        self.assertEqual(ctx.result(q(ctx))['fields']['advanced_line']['categories'],['first_line'])
        ctx,_=context([pop('p','Advanced melanoma with prior adjuvant therapy')],previous='previously_treated',quote='Patients with advanced melanoma had prior adjuvant therapy.')
        self.assertEqual(ctx.result(q(ctx))['fields']['advanced_line']['status'],'NA')

    def test_braf_limited_negative_never_broad_wild_type_or_inherited_mutated(self):
        text='Patients with BRAF V600-negative melanoma were included.'
        ctx,_=context([pop('p','BRAF V600-negative melanoma')],braf='wild_type',quote=text)
        v=ctx.result(q(ctx))['fields']['braf'];self.assertEqual(v['status'],'NA');self.assertEqual(v['reason'],'limited_BRAF_testing_scope')
        ctx,_=context([pop('p','BRAF-mutant melanoma'),pop('u','BRAF status unknown','p')],braf='mutant',quote='Patients with BRAF-mutant melanoma were enrolled.')
        self.assertEqual(ctx.result(q(ctx,'u'))['fields']['braf']['reason'],'explicitly_unknown')
        ctx,_=context([pop('p','BRAF wild-type melanoma')],braf='wild_type',quote='Patients with BRAF wild-type melanoma were enrolled.')
        self.assertEqual(ctx.result(q(ctx))['fields']['braf']['categories'],['wild_type'])

    def test_negated_biomarker_traits_do_not_assert_the_opposite(self):
        for field,wordings in [
            ('braf',['Not BRAF-mutated','BRAF is not mutated','Without BRAF mutations','Non-BRAF-mutant','BRAF non-mutated','BRAF nonmutated']),
            ('baseline_ldh',['Baseline LDH not elevated','Baseline non-elevated LDH','No elevation of baseline LDH','Baseline LDH not normal'])]:
            for wording in wordings:
                with self.subTest(wording=wording):
                    self.assertEqual(labels(field,wording),set())
                    v=direct(field,wording,[('CE-x-s','Patients had '+wording+'.')])
                    self.assertEqual(v['status'],'NA');self.assertEqual(v['reason'],'explicit_trait_negation')
                    self.assertEqual(v['categories'],[]);self.assertEqual(v['evidence_ids'],['CE-x-s'])

    def test_explicit_positive_biomarker_state_survives_other_negation(self):
        cases=[('baseline_ldh','Normal baseline LDH, not elevated','normal'),
               ('baseline_ldh','Baseline LDH: not normal, elevated','elevated'),
               ('braf','BRAF wild-type, not BRAF-mutated','wild_type'),
               ('braf','BRAF is not mutated; wild-type','wild_type')]
        for field,wording,want in cases:
            v=direct(field,wording,[('CE-x-s','Patients had '+wording+'.')])
            self.assertEqual(v['categories'],[want]);self.assertEqual(v['status'],'supported')

    def test_negation_of_other_marker_does_not_remove_braf_or_ldh_state(self):
        v=direct('braf','BRAF-mutant melanoma',[('CE-x-s','Patients had BRAF-mutant melanoma and no PI3K mutations.')])
        self.assertEqual(v['categories'],['mutated'])
        ctx,_=context([pop('p','BRAF-mutant advanced melanoma'),pop('child','PI3K-pathway subgroup','p','Patients with BRAF-mutant melanoma had no PI3K mutation.')],braf='mutant',quote='Patients with BRAF-mutant advanced melanoma were enrolled.')
        self.assertEqual(ctx.result(q(ctx,'child'))['fields']['braf']['categories'],['mutated'])
        ctx,_=context([pop('p','Advanced melanoma')],braf='mixed',quote='Patients with advanced melanoma with or without BRAF mutations were enrolled.')
        self.assertEqual(ctx.result(q(ctx))['fields']['braf']['status'],'mixed')

    def test_negated_descriptor_or_source_blocks_parent_inheritance(self):
        for child_label,child_quote in [('Not BRAF-mutated','Patients were not BRAF-mutated.'),
                                         ('BRAF-mutant subgroup','Patients were not BRAF-mutated.'),
                                         ('Subgroup','Patients were not BRAF-mutated.')]:
            ctx,_=context([pop('p','BRAF-mutant advanced melanoma'),pop('child',child_label,'p',child_quote)],
                          braf='mutant',quote='Patients with BRAF-mutant advanced melanoma were enrolled.')
            v=ctx.result(q(ctx,'child'))['fields']['braf']
            self.assertEqual(v['status'],'NA');self.assertIn(v['reason'],('explicit_trait_negation','source_trait_negated'))
            self.assertIsNone(v['inherited_from'])
        ctx,_=context([pop('p','Baseline elevated LDH'),pop('child','Baseline LDH not elevated','p','Baseline LDH was not elevated.')],
                      quote='Patients had elevated baseline LDH.')
        v=ctx.result(q(ctx,'child'))['fields']['baseline_ldh']
        self.assertEqual(v['status'],'NA');self.assertEqual(v['reason'],'explicit_trait_negation');self.assertIsNone(v['inherited_from'])

    def test_acral_cutaneous_mixed_and_unknown_primary(self):
        for name,want in [('Acral melanoma','cutaneous'),('Uveal melanoma','uveal'),('Mucosal melanoma','mucosal')]:
            ctx,_=context([pop('p',name)],quote='Patients with '+name+' were enrolled.')
            self.assertEqual(ctx.result(q(ctx))['fields']['subtype']['categories'],[want])
        ctx,_=context([pop('p','Cutaneous and mucosal melanoma')],quote='Patients with cutaneous and mucosal melanoma were enrolled.')
        self.assertEqual(ctx.result(q(ctx))['fields']['subtype']['status'],'mixed')
        ctx,_=context([pop('p','Melanoma of unknown primary')],quote='Patients had melanoma of unknown primary.')
        self.assertEqual(ctx.result(q(ctx))['fields']['subtype']['status'],'NA')

    def test_separate_marginal_subgroups_never_create_joint_characteristics(self):
        populations=[pop('p','Advanced melanoma'),pop('b','BRAF-mutant subgroup','p','Patients in the BRAF-mutant subgroup had advanced melanoma.'),
                     pop('l','Baseline LDH elevated subgroup','p','Patients in the subgroup had elevated baseline LDH above ULN.')]
        ctx,_=context(populations,braf='mixed',quote='Patients with advanced melanoma had mixed BRAF status and normal or elevated baseline LDH.')
        b=ctx.result(q(ctx,'b'))['fields'];l=ctx.result(q(ctx,'l'))['fields']
        self.assertEqual(b['braf']['categories'],['mutated']);self.assertEqual(b['baseline_ldh']['status'],'NA')
        self.assertEqual(l['baseline_ldh']['categories'],['elevated']);self.assertNotEqual(l['braf']['status'],'supported')

    def test_whole_parent_uniform_attribute_inherits_with_bound_provenance(self):
        ctx,_=context([pop('p','BRAF-mutant advanced melanoma'),pop('l','Baseline elevated LDH','p')],braf='mutant',quote='Patients with BRAF-mutant advanced melanoma were enrolled; baseline LDH was elevated in the reported subgroup.')
        v=ctx.result(q(ctx,'l'))['fields']['braf']
        self.assertEqual(v['categories'],['mutated']);self.assertEqual(v['inherited_from'],ctx.prefix+'p')
        self.assertTrue(all(e.startswith(ctx.prefix) for e in v['evidence_ids']))

    def test_ldh_requires_baseline_and_thresholds_remain_overlapping(self):
        for name in ['Baseline LDH > ULN','Baseline LDH > 2 ULN','Baseline LDH ≥2 ULN']:
            ctx,_=context([pop('p',name)],quote='Patients had '+name+'.')
            v=ctx.result(q(ctx))['fields']['baseline_ldh'];self.assertEqual(v['categories'],['elevated']);self.assertIn('overlap_warning',v['details'])
        v=direct('baseline_ldh','LDH elevated at progression',[('CE-x-s','LDH was elevated at progression.')])
        self.assertEqual(v['reason'],'not_baseline_LDH')
        v=direct('baseline_ldh','LDH elevated',[('CE-x-s','LDH was elevated.')]);self.assertEqual(v['status'],'NA')
        v=direct('baseline_ldh','Baseline LDH ≤2 ULN',[('CE-x-s','Baseline LDH ≤2 ULN.')]);self.assertEqual(v['status'],'NA')

    def test_cross_setting_arms_remain_complete_and_arm_specific_tags_differ(self):
        text='Patients with resectable melanoma were randomized to neoadjuvant pembrolizumab before surgery or surgery followed by adjuvant pembrolizumab (adjuvant-only group).'
        arms=[{'id':'neo','label':'pembrolizumab','population_id':'p','nodes':[{'id':'n','kind':'drug','name':'pembrolizumab','schedule':'3 doses before surgery'}],'root_id':'n','evidence':['a-neo']},
              {'id':'adj','label':'pembrolizumab','population_id':'p','nodes':[{'id':'n','kind':'drug','name':'pembrolizumab','schedule':'18 doses after surgery'}],'root_id':'n','evidence':['a-adj']}]
        ctx,_=context([pop('p','Resectable melanoma')],setting='perioperative',quote=text,arms=arms)
        both=ctx.result(q(ctx,arm='neo',reference='adj'))
        self.assertTrue(both['cross_setting_comparison']);self.assertEqual(both['fields']['setting']['status'],'supported')
        self.assertEqual(set(both['fields']['setting']['categories']),{'neoadjuvant_perioperative','adjuvant_resected'})
        self.assertEqual(ctx.result(q(ctx,arm='adj'))['fields']['setting']['categories'],['adjuvant_resected'])
        self.assertEqual(ctx.result(q(ctx,arm='neo'))['fields']['setting']['categories'],['neoadjuvant_perioperative'])

    def test_background_previous_trial_cannot_set_current_treatment_line(self):
        text='BACKGROUND: In patients with untreated metastatic melanoma first-line therapy improved survival. Here we report previously treated patients.'
        ctx,_=context([pop('p','Previously treated metastatic melanoma')],previous='previously_treated',quote=text)
        self.assertEqual(ctx.result(q(ctx))['fields']['advanced_line']['status'],'NA')
        v=direct('baseline_ldh','Baseline LDH greater than the upper limit of normal',[('CE-x-s','Baseline LDH was greater than the upper limit of normal.')])
        self.assertEqual(v['categories'],['elevated'])

    def test_own_single_registry_identity_not_pmid_or_multiple_trial_count(self):
        ctx,_=context([pop('p','Advanced melanoma')],quote='Patients with advanced melanoma enrolled in trial NCT01234567.',identifiers=[{'id':'NCT01234567','registry':'ClinicalTrials.gov'}])
        self.assertTrue(ctx.independence()['verified']);self.assertEqual(ctx.independence()['cohort_ids'],['trial:NCT01234567'])
        ctx,_=context([pop('p','Advanced melanoma')],quote='Patients were pooled from trials NCT01234567 and NCT01234568.',identifiers=[{'id':'NCT01234567'},{'id':'NCT01234568'}])
        self.assertFalse(ctx.independence()['verified'])
        ctx,_=context([pop('p','Advanced melanoma')],quote='Patients with advanced melanoma were enrolled.')
        self.assertFalse(ctx.independence()['verified'])

    def test_build_is_idempotent_and_preserves_raw_inputs(self):
        ctx,registry=context([pop('p','Advanced melanoma')],quote='Patients with advanced melanoma were enrolled.')
        row=q(ctx);payload={'articles':[{'pmid':'123','records':[{'task_id':'task','record':ctx.raw}]}],
                'clinical_evidence':{'content_sha256':'c'*64,'articles':[{'pmid':'123','quantitative_results':[row]}],'evidence_registry':registry}}
        before=canonical(payload);one=build(payload,source_file_sha256=digest(before));two=build(deepcopy(payload),source_file_sha256=digest(before))
        self.assertEqual(canonical(one),canonical(two));self.assertEqual(canonical(payload),before)
        self.assertEqual(one['results'][row['result_id']]['population_id'],row['population_id'])
        with tempfile.TemporaryDirectory() as directory:
            first=write(directory,payload,source_bytes=before);second=write(directory,payload,source_bytes=before)
            self.assertEqual(first,second);self.assertEqual(len(list(Path(directory).glob('data/current/clinical_classifications/*/*.json'))),1)
        bad=deepcopy(payload);bad['clinical_evidence']['articles'][0]['quantitative_results'][0]['source_input_sha256']='wrong'
        with self.assertRaises(ValueError):build(bad,source_file_sha256='bad')

if __name__=='__main__':unittest.main()
