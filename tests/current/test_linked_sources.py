"""Finite local source-boundary regressions; no database, HTTP or model use."""
from pathlib import Path
from copy import deepcopy
from io import BytesIO
from zipfile import ZipFile
import hashlib, importlib.util, json, tempfile, unittest
from metamelanoma import io, sources

ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).parent
INPUT='data/proposed_changes/r3_live_compact_source_repairs/supplement34295326/LINKED_SUPPLEMENT_DOCUMENT_PROPOSAL.json'
from metamelanoma import linked_sources as module


class SourceProofTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.doc=json.loads(io.evidence_path(ROOT,INPUT).read_bytes())
        def copy_refs(obj):
            if isinstance(obj,dict):
                if {'path','sha256'}<=obj.keys():
                    raw=io.evidence_path(ROOT,obj['path']).read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),obj['sha256'])
                    target=self.root/obj['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
                else:
                    for value in obj.values():copy_refs(value)
            elif isinstance(obj,list):
                for value in obj:copy_refs(value)
        copy_refs(self.doc)
        identity=self.doc['primary_identity'];ids=identity['persistent_identifiers']
        citation={'pmid':self.doc['pmid'],'report_id':self.doc['report_id'],'title':identity['title'],'pmcid':ids['pmcid'][0],'doi':ids['doi'][0]}
        self.primary=sources.document_from_jats((self.root/self.doc['primary_raw_ref']['path']).read_bytes(),citation,self.doc['primary_raw_ref'])
    def tearDown(self):self.temp.cleanup()
    def check(self):return module.verify(self.root,self.doc,self.primary)
    def put(self,old,raw):
        path=self.root/old['path'];path.write_bytes(raw);new={**old,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
        def replace(obj):
            if isinstance(obj,dict):
                if obj==old:obj.clear();obj.update(new)
                else:
                    for value in obj.values():replace(value)
            elif isinstance(obj,list):
                for value in obj:replace(value)
        replace(self.doc);return new
    def receipt_body(self,receipt_ref,new):
        value=json.loads((self.root/receipt_ref['path']).read_bytes());value['body']=new
        self.put(deepcopy(receipt_ref),json.dumps(value).encode())
    def test_actual_saved_doc_and_primary_unchanged(self):
        before=deepcopy(self.primary);blocks=self.check();self.assertEqual(blocks,self.doc['blocks']);self.assertEqual(self.primary,before)
        self.assertFalse(blocks[0]['is_target']);self.assertEqual(blocks[0]['document_role'],'supplement')
        cells=json.loads((self.root/blocks[0]['source_element']['table_cells_ref']['path']).read_bytes())
        self.assertEqual((len(cells['cells']),len(cells['cells'][0])),(23,15));self.assertEqual(cells['cells'][7][4:8],['Melanoma','IV','Pembrolizumab','4'])
        self.assertEqual(cells['cells'][8][4:8],['Melanoma','III','Pembrolizumab','2'])
    def test_wrong_primary_report_or_identity(self):
        for key,value in [('pmid','2'),('report_id','foreign')]:
            with self.subTest(key=key):
                old=self.doc[key];self.doc[key]=value
                with self.assertRaises(ValueError):self.check()
                self.doc[key]=old
        self.doc['primary_identity']['persistent_identifiers']['doi']=['10.1/foreign']
        with self.assertRaises(ValueError):self.check()
    def test_main_html_explicit_wrong_pmid(self):
        link=self.doc['main_link_proof'];old=deepcopy(link['main_html_ref']);raw=(self.root/old['path']).read_bytes().replace(b'content="34295326"',b'content="2"')
        self.assertNotEqual(raw,(self.root/old['path']).read_bytes());new=self.put(old,raw);self.receipt_body(deepcopy(link['receipt_ref']),new)
        with self.assertRaisesRegex(ValueError,'persistent identity'):self.check()
    def test_link_only_outside_article_rejected(self):
        link=self.doc['main_link_proof'];old=deepcopy(link['main_html_ref']);raw=(self.root/old['path']).read_bytes();href=self.doc['main_href'].encode()
        raw=raw.replace(b'href="'+href+b'"',b'href="/foreign.doc"')+b'<a data-ga-action="click_feat_suppl" href="'+href+b'">outside article</a>'
        new=self.put(old,raw);self.receipt_body(deepcopy(link['receipt_ref']),new)
        with self.assertRaisesRegex(ValueError,'supplement link'):self.check()
    def test_epmc_wrong_pmcid_and_failure_order(self):
        old=deepcopy(self.doc['package_request_ref']);q=json.loads((self.root/old['path']).read_bytes());q['url']=q['url'].replace('PMC8290852','PMC1');self.put(old,json.dumps(q).encode())
        with self.assertRaisesRegex(ValueError,'same-primary public receipt'):self.check()
    def test_failure_must_precede_package(self):
        old=deepcopy(self.doc['primary_supplement_download_failure']['receipt_ref']);value=json.loads((self.root/old['path']).read_bytes());value['received_at']='2099-01-01T00:00:00+00:00';self.put(old,json.dumps(value).encode())
        with self.assertRaisesRegex(ValueError,'must follow'):self.check()
    def test_zip_same_name_wrong_bytes(self):
        old=deepcopy(self.doc['package_ref']);buffer=BytesIO()
        with ZipFile(buffer,'w')as z:z.writestr('DataSheet_1.doc',b'x'*self.doc['raw_ref']['bytes'])
        new=self.put(old,buffer.getvalue());self.receipt_body(deepcopy(self.doc['package_receipt_ref']),new)
        with self.assertRaisesRegex(ValueError,'ZIP member'):self.check()
    def test_changed_bound_extraction_rejected(self):
        old=deepcopy(self.doc['extracted_text_ref']);self.put(old,(self.root/old['path']).read_bytes().replace(b'Melanoma',b'RCCxxxxx'))
        with self.assertRaisesRegex(ValueError,'text extraction differs'):self.check()
    def test_target_text_offset_or_geometry_rejected(self):
        for key,value in [('is_target',True),('document_role','main_article'),('text','invented')]:
            with self.subTest(key=key):
                old=self.doc['blocks'][0][key];self.doc['blocks'][0][key]=value
                with self.assertRaises(ValueError):self.check()
                self.doc['blocks'][0][key]=old
    def test_secret_alias_and_hardlink_preread(self):
        original=deepcopy(self.doc['primary_raw_ref']);self.doc['primary_raw_ref']['path']='secrets/source.doc'
        self.primary['raw_ref']=deepcopy(self.doc['primary_raw_ref'])
        with self.assertRaisesRegex(ValueError,'Credentials'):self.check()
        self.doc['primary_raw_ref']=original;self.primary['raw_ref']=deepcopy(original)
        path=self.root/original['path'];alias=path.with_name('alias');alias.symlink_to(path);self.doc['primary_raw_ref']['path']=str(alias.relative_to(self.root));self.primary['raw_ref']=deepcopy(self.doc['primary_raw_ref'])
        with self.assertRaisesRegex(ValueError,'symbolic'):self.check()


if __name__=='__main__':unittest.main()
