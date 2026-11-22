from copy import deepcopy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from metamelanoma.io import canonical, digest
from metamelanoma.treatment_normalization import (
    PUBLIC, QUEUE, AUDIT_PUBLIC, SOURCE, REGISTRY, GENERATED_REGISTRY, registry_javascript,
    projection_paths, reconcile,
)
from metamelanoma.treatment_map import PUBLIC as MAP_PUBLIC

REPO = Path(__file__).resolve().parents[2]
RESOURCES = ['pipeline.py', REGISTRY, GENERATED_REGISTRY,
    'config/sample_size_link_reviews.json', 'config/comparison_result_reviews.json',
    'website/scripts/treatment_map_defaults.cjs', 'website/scripts/underpowered_studies.cjs',
    'website/scripts/treatment_network_reference_cache.cjs','website/scripts/treatment_network_reference_cache.R',
    'website/scripts/treatment_network_authors.py','website/scripts/study_browse_defaults.cjs',
    'website/scripts/single_arm_denominators.py','config/single_arm_denominator_reviews.json',
    'website/scripts/build_new_findings.cjs', 'website/scripts/new_findings_dates.py',
    'website/scripts/treatment_normalization.cjs', 'website/scripts/build_drug_type_review.cjs', 'website/scripts/regimen_projection.cjs', 'website/scripts/treatment_map.cjs', 'website/scripts/treatment_map_model.cjs', 'website/scripts/treatment_map_evidence.cjs', 'website/scripts/treatment_map_cohorts.cjs', 'website/scripts/treatment_map_membership.cjs',
    *[str(path.relative_to(REPO)) for path in (REPO/'website/dist').glob('*.js') if path != REPO/GENERATED_REGISTRY],
    *['src/metamelanoma/'+name+'.py' for name in ('__init__','cli','io','treatment_normalization','treatment_map',
        'binary_effects','binary_count_recovery','source_preference','quantitative_export','screening','schema')]]


def payload_for(names, arm_labels=None):
    articles=[];clinical=[];registry={}
    for pmid,name in names:
        report='report-'+str(pmid).zfill(24);source=digest(('source-'+str(pmid)).encode());task='fixture-'+str(pmid)
        arm_label=(arm_labels or {}).get(str(pmid),name)
        arm={'id':'a','population_id':'p','label':arm_label,'root_id':'n','nodes':[{'id':'n','kind':'drug','name':name,'children':[],'dose':'3 mg/kg','route':'IV','schedule':'every 2 weeks'}],'evidence':['span-treatment']}
        raw={'pmid':str(pmid),'report_id':report,'stage':'R2','source_sha256':source,'arms':[arm],
             'sample_sizes':[{'id':'s','n':17}],'effects':[{'id':'e','estimate':.7,'ci_lower':.5,'ci_upper':.9}],
             'decision':{'status':'retain'}}
        binding=digest(canonical({'task_id':task,'record':raw}));prefix='CE-'+binding[:24]+'-';anchor=prefix+'span-treatment'
        registry[anchor]={'source_id':report+':citation','block_id':'abstract','supporting_quote':'The patients received '+name+' at 3 mg/kg.'}
        native={'arm_id':'a','label':arm_label,'root_node_id':'n','evidence_ids':[anchor],'nodes':[{'node_id':'n','kind':'drug','name':name,'drug_class':None,'children':[],'dose':'3 mg/kg','route':'IV','schedule':'every 2 weeks','evidence_ids':[anchor]}]}
        comparison={'comparison_id':prefix+'comparison','kind':'single_arm','comparator_key':'__single_arm__','comparator_label':'No comparator',
            'intervention_arm_id':'a','additional_intervention_label':name,'intervention_native_regimen':native,
            'scope':{'record_kind':'canonical_review_scope','report_id':report,'review_stage':'R2','source_input_sha256':source,'review_binding_sha256':binding,'population_id':prefix+'p'},'result_ids':[]}
        articles.append({'pmid':str(pmid),'records':[{'stage':'R2','task_id':task,'record':raw}]})
        clinical.append({'pmid':str(pmid),'report_id':report,'current_main_eligible':True,'comparisons':[comparison],
                         'quantitative_results':[{'result_id':prefix+'e','estimate':.7,'pooling_eligible':False}],'sample_size_records':[{'n':17}]})
    graph={'record_kind':'canonical_clinical_evidence','articles':clinical,'evidence_registry':registry}
    graph['content_sha256']=digest(canonical({'articles':clinical,'evidence_registry':registry}))
    return {'articles':articles,'clinical_evidence':graph,'screening_unchanged':True}


class TreatmentNormalizationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name).resolve()
        for relative in RESOURCES:
            target=self.root/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(REPO/relative,target)
        (self.root/SOURCE).parent.mkdir(parents=True,exist_ok=True)
        # This normalization fixture has no clinical-filter classifications;
        # the default-map version receipt still binds that empty publication.
        (self.root/'website/dist/data/clinical_classifications.json').write_bytes(canonical({'content_sha256':digest(canonical({}))}))

    def source(self,names):
        value=payload_for(names);(self.root/SOURCE).write_bytes(canonical(value));return value

    def command(self,*arguments):
        result=subprocess.run([sys.executable,'pipeline.py','treatment-reconcile',*arguments],cwd=self.root,capture_output=True,text=True,timeout=30)
        self.assertEqual(result.returncode,0,result.stderr);return json.loads(result.stdout)

    def test_curated_alias_reconciles_old_and_new_data_through_normal_command_and_all_consumers(self):
        label='FUTURE-CURATED-ALIAS';self.source([('123',label)])
        first=self.command();initial=json.loads((self.root/AUDIT_PUBLIC).read_bytes())
        self.assertEqual(initial['occurrences'][0]['resolution']['status'],'unresolved')
        self.assertEqual(len(json.loads((self.root/QUEUE).read_bytes())['items']),1)
        registry=json.loads((self.root/REGISTRY).read_bytes());drug=next(row for row in registry['products'] if row['id']=='nivolumab')
        drug['aliases'].append(label)
        registry['sources'].append({'id':'fixture-alias-source','url':'https://pubmed.ncbi.nlm.nih.gov/123/','title':'Offline source fixture for a new alias','verified_on':'2026-11-09','rationale':'Synthetic integration fixture; exact product identity is provided by the test source.'})
        drug['source_ids'].append('fixture-alias-source');(self.root/REGISTRY).write_bytes(canonical(registry))
        payload=self.source([('123',label),('456',label)]);source_before=(self.root/SOURCE).read_bytes()
        applied=self.command();sidecar=json.loads((self.root/PUBLIC).read_bytes());audit=json.loads((self.root/AUDIT_PUBLIC).read_bytes())
        self.assertEqual({row['resolution']['canonical_id'] for row in audit['occurrences']},{'nivolumab'})
        self.assertEqual(sidecar['summary']['all']['reports'],2);self.assertEqual(sidecar['summary']['all']['source_arms'],2)
        self.assertEqual(len(json.loads((self.root/QUEUE).read_bytes())['items']),0)
        self.assertEqual((self.root/SOURCE).read_bytes(),source_before)
        for row in audit['occurrences']:
            self.assertEqual(row['raw_label'],label);self.assertEqual(row['dose'],'3 mg/kg')
        script=r'''const fs=require('fs'),vm=require('vm'),r=require('./website/dist/treatment_resolver.js'),g=require('./website/dist/treatment_groups.js');
const sandbox={};sandbox.globalThis=sandbox;
for(const name of ['treatment_registry','treatment_resolver','treatment_groups'])vm.runInNewContext(fs.readFileSync('./website/dist/'+name+'.js','utf8'),sandbox);
const side=JSON.parse(fs.readFileSync('./website/dist/data/treatment_normalizations.json','utf8'));
console.log(JSON.stringify({node:r.resolve('FUTURE-CURATED-ALIAS').canonical_id,browser:sandbox.TreatmentResolver.resolve('FUTURE-CURATED-ALIAS').canonical_id,
node_classes:g.describe('FUTURE-CURATED-ALIAS').class_ids,browser_classes:sandbox.TreatmentGroups.describe('FUTURE-CURATED-ALIAS').class_ids,
api:Object.values(side.comparisons).map(row=>row.roles.intervention.description.agent_ids)}));'''
        process=subprocess.run(['node','-e',script],cwd=self.root,text=True,capture_output=True,timeout=30)
        self.assertEqual(process.returncode,0,process.stderr);consumer=json.loads(process.stdout)
        self.assertEqual(consumer['node'],consumer['browser']);self.assertEqual(consumer['node'],'nivolumab')
        self.assertEqual(consumer['node_classes'],consumer['browser_classes']);self.assertTrue(all(ids==['nivolumab'] for ids in consumer['api']))
        projection=subprocess.run(['node','website/scripts/regimen_projection.cjs'],input=canonical(payload['clinical_evidence']),cwd=self.root,capture_output=True,timeout=30)
        self.assertEqual(projection.returncode,0,projection.stderr.decode());exported=json.loads(projection.stdout)
        self.assertTrue(all(row['comparisons'][0]['intervention_regimen']['root']['agent_id']=='nivolumab' for row in exported['articles']))
        self.assertEqual(exported['articles'][0]['quantitative_results'],payload['clinical_evidence']['articles'][0]['quantitative_results'])
        map_data=json.loads((self.root/MAP_PUBLIC).read_bytes())
        self.assertEqual(map_data['metadata']['normalization_content_sha256'],sidecar['content_sha256'])
        self.assertEqual(map_data['metadata']['source_file_sha256'],digest(source_before))
        for table in ('underpowered_studies', 'new_findings'):
            saved = (self.root/f'website/dist/data/{table}.json').read_bytes()
            self.assertEqual(applied['study_tables'][table], digest(saved))
            self.assertEqual(json.loads(saved)['source_file_sha256'], digest(source_before))
        self.assertTrue(any(row['id']=='agent:nivolumab' for row in map_data['nodes']))
        self.assertEqual(applied['treatment_map']['new_model_requests'],0)
        default_path='website/dist/data/treatment_map_default.json'
        version_path='website/dist/data/treatment_map_version.json'
        defaults=json.loads((self.root/default_path).read_bytes())
        version=json.loads((self.root/version_path).read_bytes())
        self.assertEqual(defaults['content_sha256'],map_data['content_sha256'])
        self.assertEqual(version['default_snapshot_sha256'],digest((self.root/default_path).read_bytes()))
        self.assertEqual(version['source_file_sha256'],digest(source_before))
        self.assertIn('all',defaults['default_views']['layouts'])
        self.assertEqual(applied['treatment_map']['default_views']['new_model_requests'],0)
        before={path:(self.root/path).read_bytes() for path in (PUBLIC,QUEUE,AUDIT_PUBLIC,GENERATED_REGISTRY,MAP_PUBLIC,default_path,version_path,'website/dist/drug_type_review.json','website/dist/drug_type_review.html','website/dist/drug_type_review.txt')}
        repeated=self.command();self.assertFalse(repeated['normalization_changed']);self.assertEqual(repeated['changed_occurrences'],0)
        self.assertEqual({path:(self.root/path).read_bytes() for path in before},before)
        self.assertEqual(applied['new_model_requests'],0);self.assertEqual(first['new_source_requests'],0)

    def test_dry_run_preserves_served_outputs_and_raw_science(self):
        self.source([('123','BMS-936558')]);before=(self.root/SOURCE).read_bytes();js=(self.root/GENERATED_REGISTRY).read_bytes()
        receipt=self.command('--dry-run','--audit-dir','data/audits/dry')
        self.assertFalse((self.root/PUBLIC).exists());self.assertFalse((self.root/QUEUE).exists())
        self.assertFalse((self.root/MAP_PUBLIC).exists())
        self.assertFalse((self.root/'website/dist/data/treatment_map_default.json').exists())
        self.assertFalse((self.root/'website/dist/data/treatment_map_version.json').exists())
        self.assertEqual((self.root/SOURCE).read_bytes(),before);self.assertEqual((self.root/GENERATED_REGISTRY).read_bytes(),js)
        self.assertTrue((self.root/receipt['audit']).exists())

    def test_conflicting_alias_blocks_publication_instead_of_silently_overwriting(self):
        self.source([('123','BMS-936558')]);self.command();before=(self.root/PUBLIC).read_bytes()
        registry=json.loads((self.root/REGISTRY).read_bytes());drug=next(row for row in registry['products'] if row['id']=='ipilimumab');drug['aliases'].append('BMS-936558')
        (self.root/REGISTRY).write_bytes(canonical(registry))
        result=subprocess.run([sys.executable,'pipeline.py','treatment-reconcile'],cwd=self.root,capture_output=True,text=True,timeout=30)
        self.assertNotEqual(result.returncode,0);self.assertIn('collision',result.stderr.lower());self.assertEqual((self.root/PUBLIC).read_bytes(),before)

    def test_legacy_projection_namespace_does_not_replace_active_compact_sidecar(self):
        self.assertEqual(projection_paths(SOURCE)[0],PUBLIC)
        self.assertEqual(projection_paths('website/dist/data/clinical_evidence.json')[0],'website/dist/data/clinical_treatment_normalizations.json')

    def test_registry_generation_is_deterministic(self):
        registry=json.loads((self.root/REGISTRY).read_bytes())
        self.assertEqual(registry_javascript(registry),registry_javascript(deepcopy(registry)))

    def test_map_only_rebuild_and_source_mismatch_guard(self):
        self.source([('123','nivolumab')]);self.command()
        initial=(self.root/MAP_PUBLIC).read_bytes()
        result=subprocess.run([sys.executable,'pipeline.py','treatment-map'],cwd=self.root,capture_output=True,text=True,timeout=30)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(json.loads(result.stdout)['map_changed'])
        self.assertEqual((self.root/MAP_PUBLIC).read_bytes(),initial)
        self.source([('123','nivolumab'),('456','ipilimumab')])
        failed=subprocess.run([sys.executable,'pipeline.py','treatment-map'],cwd=self.root,capture_output=True,text=True,timeout=30)
        self.assertNotEqual(failed.returncode,0)
        self.assertIn('source and prepared treatments disagree',failed.stderr)
        self.assertEqual((self.root/MAP_PUBLIC).read_bytes(),initial)

    def test_parent_history_role_never_claims_child_drug_is_active(self):
        payload=payload_for([('123','nivolumab')],{'123':'prior nivolumab'})
        (self.root/SOURCE).write_bytes(canonical(payload));self.command()
        row=json.loads((self.root/AUDIT_PUBLIC).read_bytes())['occurrences'][0]
        self.assertEqual(row['resolution']['role'],'prior_history')
        self.assertIs(row['resolution']['active_exposure'],False)
        self.assertEqual(row['raw_label'],'nivolumab')

    def test_known_product_with_source_dependent_role_remains_in_review_queue(self):
        self.source([('123','Poly-ICLC')]);self.command()
        row=json.loads((self.root/AUDIT_PUBLIC).read_bytes())['occurrences'][0]
        self.assertEqual(row['resolution']['status'],'resolved')
        self.assertEqual(row['resolution']['role'],'unclear')
        queue=json.loads((self.root/QUEUE).read_bytes())['items']
        self.assertEqual(len(queue),1);self.assertEqual(queue[0]['issue_type'],'source_dependent_role')


if __name__=='__main__':unittest.main()
