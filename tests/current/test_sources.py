from copy import deepcopy
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.request
from metamelanoma import sources as s


def citation(**extra):
    return {'report_id':'r','pmid':'1','pmcid':'PMC1','doi':'10.1000/test',
            'title':'A melanoma treatment study',**extra}


def jats(abstract='<abstract><p>Twenty-five melanoma patients were treated.</p></abstract>', body=None, pmid='1'):
    body=body if body is not None else '<sec><title>Results</title><p>Seventeen patients with melanoma were treated.</p></sec>'
    return (f'<article><front><article-meta><article-id pub-id-type="pmid">{pmid}</article-id>'
        '<article-id pub-id-type="pmc">PMC1</article-id><article-id pub-id-type="doi">10.1000/test</article-id>'
        '<title-group><article-title>A melanoma treatment study</article-title></title-group>'+abstract+
        '</article-meta></front>'+('<body>'+body+'</body>'if body else'')+'</article>').encode()


def response(raw, **extra):
    return {'body_bytes':raw,'body':{'path':'fixture.body','sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)},
            'status':200,'url':'https://source.example','final_url':'https://source.example',**extra}


PUBMED_ABSENT=b'<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>1</PMID><Article/></MedlineCitation></PubmedArticle></PubmedArticleSet>'


class SourceTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name).resolve()
        self.provider=s.PublicSources(self.root,max_attempts=1)

    def test_persistent_identity_and_nonempty_full_body(self):
        article,identity=s.jats_article(jats(),citation());self.assertTrue(identity['full_body_verified'])
        for bad in (citation(pmid='2'),citation(doi='10.1000/wrong'),citation(pmcid='PMC2')):
            with self.subTest(bad=bad),self.assertRaises(ValueError):s.jats_article(jats(),bad)

    def test_abstract_only_can_supply_R2_but_never_R3(self):
        raw=jats(body='')
        with self.assertRaises(ValueError):s.jats_article(raw,citation())
        self.assertFalse(s.jats_article(raw,citation(),require_body=False)[1]['full_body_verified'])
        with self.assertRaises(ValueError):s.jats_article(jats(body='<p>Click here to download the full text PDF.</p>'),citation())

    def test_explicit_PMC_version_cannot_be_silently_substituted(self):
        with self.assertRaises(ValueError):s.jats_article(jats(),citation(pmcid='PMC1.2'))
        raw=jats().replace(b'<title-group>',b'<article-id pub-id-type="pmcid-ver">PMC1.2</article-id><title-group>')
        self.assertTrue(s.jats_article(raw,citation(pmcid='PMC1.2'))[1]['full_body_verified'])

    def test_preformat_complete_table_caption_and_footnote_are_retained(self):
        body='''<sec><title>Results</title><preformat>Unindexed original body text 17 patients.</preformat>
        <table-wrap><label>Table2</label><caption><p>Response by histology</p></caption><table><thead><tr><th>Histology</th><th>N</th><th>PR</th><th>SD</th></tr></thead><tbody><tr><td>Melanoma</td><td>17</td><td>0(0%)</td><td>1(6%)</td></tr></tbody></table><table-wrap-foot><fn><p>Stable disease &gt;3months.</p></fn></table-wrap-foot></table-wrap>
        <fig><label>Figure1</label><caption><p>Clinical response photographs.</p></caption><graphic href="photo.jpg"/></fig></sec>'''
        d=s.document_from_jats(jats(body=body),citation(),{'path':'raw.xml','sha256':'a'*64})
        self.assertTrue(any('Unindexed original' in b['text']for b in d['blocks']))
        table=next(b for b in d['blocks']if b['document_role']=='main_article_table')
        self.assertIn('Histology | N | PR | SD',table['text']);self.assertIn('Melanoma | 17 | 0(0%) | 1(6%)',table['text'])
        self.assertIn('>3months',table['text']);self.assertIn('raw_element_sha256',table)
        self.assertTrue(any('Clinical response photographs' in b['text']for b in d['blocks']))
        self.assertFalse(d['whole_source_coverage_complete'])

    def test_graphic_only_table_is_an_explicit_gap(self):
        d=s.document_from_jats(jats(body='<table-wrap><caption><p>Patient results</p></caption><graphic href="table.jpg"/></table-wrap>'),citation(),{})
        self.assertTrue(any('graphic-only table' in x for x in d['limitations']))
        self.assertNotIn('17',' '.join(b['text']for b in d['blocks']if b['document_role']=='main_article_table'))

    def test_bare_body_container_text_and_tails_are_not_silently_omitted(self):
        for body in ('Literal complete body contains 17 treated patients.',
                     '<sec>Clinical introduction.<p>Seventeen patients were treated.</p>Clinical tail.</sec>'):
            d=s.document_from_jats(jats(body=body),citation(),{})
            joined=' '.join(b['text']for b in d['blocks'])
            self.assertIn('patients',joined)
            if '<sec>'in body:self.assertIn('Clinical introduction.',joined);self.assertIn('Clinical tail.',joined)

    def test_merged_table_keeps_complete_XML_geometry(self):
        body='<table-wrap><caption><p>Complete table</p></caption><table><tr><th colspan="2">Melanoma</th></tr><tr><td>N</td><td>17</td></tr></table><table-wrap-foot><p>All eligible patients.</p></table-wrap-foot></table-wrap>'
        d=s.document_from_jats(jats(body=body),citation(),{})
        table=next(b for b in d['blocks']if b['document_role']=='main_article_table')
        self.assertIn('colspan="2"',table['text']);self.assertIn('<td>17</td>',table['text']);self.assertIn('All eligible patients.',table['text'])
        self.assertEqual(table['rendering'],'complete_serialized_source_element_with_merged_cells')

    def test_PMC_success_does_not_request_EPMC(self):
        calls=[]
        def fetch(url,kind,identity):calls.append(kind);return response(jats())
        with patch.object(self.provider,'fetch',fetch):d=self.provider.fulltext(citation())
        self.assertTrue(d['main_full_text_verified']);self.assertEqual(calls,['PMC_fulltext'])

    def test_actual_PMC_failure_precedes_EPMC(self):
        calls=[]
        def fetch(url,kind,identity):
            calls.append(kind);return {'error':'HTTP429','status':429}if kind=='PMC_fulltext'else response(jats())
        with patch.object(self.provider,'fetch',fetch):d=self.provider.fulltext(citation())
        self.assertEqual(calls,['PMC_fulltext','PMC_HTML_fulltext','Europe_PMC_fulltext']);self.assertTrue(d['prior_primary_failures'])

    def test_wrong_article_PMC_is_a_recorded_failure_not_accepted(self):
        calls=[]
        def fetch(url,kind,identity):calls.append(kind);return response(jats(pmid='9')if kind=='PMC_fulltext'else jats())
        with patch.object(self.provider,'fetch',fetch):d=self.provider.fulltext(citation())
        self.assertEqual(d['provider'],'Europe_PMC');self.assertIn('PMID',d['prior_primary_failures'][0]['problem'])

    def test_no_identifier_is_not_permission_for_EPMC(self):
        calls=[]
        def fetch(url,kind,identity):calls.append(kind);return response(b'{"records":[]}')
        with patch.object(self.provider,'fetch',fetch),patch.object(self.provider,'publisher_pdf',return_value={'reason':'No DOI'}):
            d=self.provider.fulltext(citation(pmcid=None,doi=None))
        self.assertFalse(d['main_full_text_verified']);self.assertEqual(calls,['PMC_identifier'])

    def test_private_URLs_ports_and_redirects_rejected(self):
        private=[(2,1,6,'',('127.0.0.1',443))]
        with patch.object(s.socket,'getaddrinfo',return_value=private):
            for url in ('https://source.example/article','https://127.0.0.1/a'):
                with self.subTest(url=url),self.assertRaises(ValueError):s.verify_public_url(url)
            with self.assertRaises(ValueError):s.PublicRedirect().redirect_request(urllib.request.Request('https://public.example'),None,302,'',{},'https://127.0.0.1/a')
        for url in ('http://public.example','https://user:pass@public.example','https://public.example:444/a'):
            with self.subTest(url=url),self.assertRaises(ValueError):s.verify_public_url(url)

    def test_actual_socket_connection_rechecks_and_pins_public_endpoint(self):
        with patch.object(s.socket,'getaddrinfo',return_value=[(2,1,6,'',('10.0.0.1',443))]),patch.object(s.socket,'socket')as sock:
            with self.assertRaises(ValueError):s._public_connection(('rebound.example',443))
            sock.assert_not_called()

    def test_cache_cannot_read_secret_parent_or_alias(self):
        path=self.root/'private.env';path.mkdir();secret=path/'source.json';secret.write_bytes(b'{}')
        with self.assertRaises(ValueError):s._read_ref(self.root,{'path':'private.env/source.json','sha256':hashlib.sha256(b'{}').hexdigest()})
        alias=self.root/'alias.json';alias.symlink_to(secret)
        with self.assertRaises(ValueError):s._read_ref(self.root,{'path':'alias.json','sha256':hashlib.sha256(b'{}').hexdigest()})

    def test_crossref_unbound_JATS_prefix_uses_safe_HTML(self):
        markup='<jats:p>Twenty-five patients were treated.</jats:p><script>not scientific</script>'
        def fetch(url,kind,identity):
            return response(PUBMED_ABSENT)if kind=='PubMed_abstract_check'else response(json.dumps({'message':{'DOI':'10.1000/test','abstract':markup}}).encode())
        with patch.object(self.provider,'fetch',fetch):r=self.provider.recover_abstracts([citation(pmcid=None)])['1']
        self.assertEqual(r['abstract_check_status'],'recovered');self.assertEqual(r['abstract'],'Twenty-five patients were treated.')
        self.assertEqual(r['kind'],'publisher_deposited_abstract')

    def test_malformed_XML_and_failure_remain_pending_not_absence(self):
        for raw in (b'<broken',b'<PubmedArticleSet/>'):
            with patch.object(self.provider,'fetch',return_value=response(raw)):
                r=self.provider.recover_abstracts([citation(pmcid=None,doi=None)])['1']
            self.assertEqual(r['abstract_check_status'],'technical_pending');self.assertIsNone(r['abstract'])

    def test_authoritative_checked_fullmain_absence_is_bounded(self):
        def fetch(url,kind,identity):return response(PUBMED_ABSENT if kind=='PubMed_abstract_check'else jats(abstract=''))
        with patch.object(self.provider,'fetch',fetch):r=self.provider.recover_abstracts([citation(doi=None)])['1']
        self.assertEqual(r['abstract_check_status'],'verified_absent_in_checked_sources');self.assertIn('limited to those sources',r['reason'])

    def test_deposit_only_absence_cannot_prove_publisher_absence(self):
        def fetch(url,kind,identity):return response(PUBMED_ABSENT)if kind=='PubMed_abstract_check'else response(b'{"message":{"DOI":"10.1000/test"}}')
        with patch.object(self.provider,'fetch',fetch):r=self.provider.recover_abstracts([citation(pmcid=None)])['1']
        self.assertEqual(r['abstract_check_status'],'technical_pending')

    def test_plain_language_summary_is_not_a_scientific_abstract(self):
        def fetch(url,kind,identity):return response(PUBMED_ABSENT)if kind=='PubMed_abstract_check'else response(jats(abstract='<abstract abstract-type="plain-language-summary"><p>Easy summary</p></abstract>'))
        with patch.object(self.provider,'fetch',fetch):r=self.provider.recover_abstracts([citation(doi=None)])['1']
        self.assertIsNone(r['abstract']);self.assertEqual(r['abstract_check_status'],'verified_absent_in_checked_sources')

    def test_body_translated_and_preformat_abstracts_prevent_false_absence(self):
        cases=[jats(abstract='',body='<sec sec-type="abstract"><title>Abstract</title><p>Twenty-five melanoma patients were treated.</p></sec><sec><title>Results</title><p>Main text.</p></sec>'),
            jats(abstract='<trans-abstract><p>Twenty-five melanoma patients were treated.</p></trans-abstract>'),
            jats(abstract='',body='<preformat>Abstract\nTwenty-five melanoma patients were treated.\nIntroduction\nMain text.</preformat>')]
        for raw in cases:
            def fetch(url,kind,identity):return response(PUBMED_ABSENT if kind=='PubMed_abstract_check'else raw)
            with patch.object(self.provider,'fetch',fetch):r=self.provider.recover_abstracts([citation(doi=None)])['1']
            with self.subTest(raw=raw):self.assertEqual(r['abstract_check_status'],'recovered');self.assertIn('Twenty-five',r['abstract'])

    def test_unresolved_preformat_abstract_boundary_is_pending_not_absence(self):
        raw=jats(abstract='',body='<preformat>Abstract\nActual scientific abstract whose endpoint is not structurally marked.</preformat>')
        def fetch(url,kind,identity):return response(PUBMED_ABSENT if kind=='PubMed_abstract_check'else raw)
        with patch.object(self.provider,'fetch',fetch):r=self.provider.recover_abstracts([citation(doi=None)])['1']
        self.assertEqual(r['abstract_check_status'],'technical_pending')

    def test_PMC_abstract_positive_does_not_require_R3_body(self):
        def fetch(url,kind,identity):return response(PUBMED_ABSENT)if kind=='PubMed_abstract_check'else response(jats(body=''))
        with patch.object(self.provider,'fetch',fetch):r=self.provider.recover_abstracts([citation(doi=None)])['1']
        self.assertEqual(r['abstract_check_status'],'recovered');self.assertEqual(r['kind'],'PMC_abstract')

    def test_technical_failure_not_hidden_by_later_main_absence(self):
        def fetch(url,kind,identity):return response(b'<bad')if kind=='PubMed_abstract_check'else response(jats(abstract=''))
        with patch.object(self.provider,'fetch',fetch):r=self.provider.recover_abstracts([citation(doi=None)])['1']
        self.assertEqual(r['abstract_check_status'],'technical_pending')

    def test_invalid_cached_main_is_pending_without_hidden_refetch(self):
        with patch.object(self.provider,'cached_main',side_effect=FileNotFoundError('savedrawmissing')),patch.object(self.provider,'fetch',side_effect=AssertionError('Must notrefetch')):
            r=self.provider.fulltext(citation())
        self.assertFalse(r['main_full_text_verified']);self.assertEqual(r['source_status'],'technical_pending');self.assertFalse(r['global_unavailability_established'])

    def test_invalid_crossref_object_is_pending_not_batch_exception(self):
        def fetch(url,kind,identity):return response(PUBMED_ABSENT)if kind=='PubMed_abstract_check'else response(b'{"message":[]}')
        with patch.object(self.provider,'fetch',fetch):r=self.provider.recover_abstracts([citation(pmcid=None)])['1']
        self.assertEqual(r['abstract_check_status'],'technical_pending')

    def test_public_fetch_receipts_cache_and_bounded_retry(self):
        url='https://public.example/article';calls=[]
        class Reply:
            status=200;headers={'Content-Type':'application/xml'}
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self,*args):return b'public scientific source'
        reply=Reply();reply.url=url
        class Opener:
            def open(self,*args,**kwargs):calls.append(True);return reply
        with patch.object(s,'verify_public_url'),patch.object(s.urllib.request,'build_opener',return_value=Opener()):
            first=self.provider.fetch(url,'test','1');second=self.provider.fetch(url,'test','1')
        self.assertEqual(len(calls),1);self.assertFalse(first['cache_reused']);self.assertTrue(second['cache_reused'])
        self.assertTrue(list((self.root/'data/sources/requests').rglob('receipt.json')))
        with self.assertRaises(ValueError):s.PublicSources(self.root,max_attempts=4)

    def test_transient_public_failure_retries_are_explicit_and_receipted(self):
        url='https://public.example/article';calls=[]
        class Reply:
            status=200;headers={}
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self,*args):return b'original public body'
        reply=Reply();reply.url=url
        class Opener:
            def open(self,*args,**kwargs):
                calls.append(True)
                if len(calls)==1:raise s.urllib.error.URLError('temporary failure')
                return reply
        provider=s.PublicSources(self.root,max_attempts=2)
        with patch.object(s,'verify_public_url'),patch.object(s.urllib.request,'build_opener',return_value=Opener()),patch.object(s.time,'sleep'):
            r=provider.fetch(url,'test','1')
        self.assertEqual(len(calls),2);self.assertEqual(r['status'],200)
        self.assertEqual(len(list((self.root/'data/sources/requests').rglob('receipt.json'))),2)

    def test_PDF_with_expected_DOI_only_in_references_is_not_primary(self):
        import sys
        landing=b'<meta name="citation_doi" content="10.1000/test"><meta name="citation_pdf_url" content="https://publisher.example/file.pdf">'
        responses=[response(landing),response(b'%PDF fake')]
        page=SimpleNamespace(extract_text=lambda:'Wrong article title 10.9999/other Methods '+('x '*2200)+' References 10.1000/test')
        fake=SimpleNamespace(PdfReader=lambda _:SimpleNamespace(pages=[page]))
        with patch.object(self.provider,'fetch',side_effect=responses),patch.dict(sys.modules,{'pypdf':fake}):d=self.provider.publisher_pdf(citation())
        self.assertFalse(d.get('main_full_text_verified',False))

    def test_actual63_shared_raw_cache_integration_without_network_or_writes(self):
        root=Path(__file__).resolve().parents[2]
        path=root/'data/proposed_changes/unified_melanoma_pipeline/candidate_cached_main_source_checks.json'
        if not path.exists():self.skipTest('Actual corpus unavailable')
        citations={str(r['pmid']):r for r in map(json.loads,(root/'data/cohort/broad_melanoma_keyword_v2/new_candidates.jsonl').read_text().splitlines())}
        records=json.loads(path.read_bytes())['records'];provider=s.PublicSources(root)
        passed=[];gaps=[]
        with patch.object(provider,'fetch',side_effect=AssertionError('Network is forbidden')):
            for row in records:
                try:d=provider.cached_main(citations[str(row['pmid'])],persist=False)
                except s.SourceCoverageGap:
                    gaps.append(str(row['pmid']));continue
                self.assertTrue(d['main_full_text_verified']);self.assertTrue(d['blocks'])
                passed.append(str(row['pmid']))
        self.assertEqual(len(records),63)
        self.assertEqual(len(passed),62);self.assertEqual(gaps,['38357801'])

    def test_pending_citation_and_deposit_fall_through_to_bound_publisher_abstract(self):
        raw=b'<html><head><meta name="citation_doi" content="10.1000/test"></head><body><section id="abstract">Seventeen patients with melanoma were treated in this original clinical study.</section></body></html>'
        path=self.root/'publisher.html';path.write_bytes(raw);calls=[]
        def fetch(url,kind,identity):
            calls.append(kind)
            if kind=='PubMed_abstract_check':return response(PUBMED_ABSENT)
            if kind=='publisher_deposited_abstract':return response(b'{"message":{"DOI":"10.1000/test"}}')
            if kind=='publisher_landing':
                return {**response(raw),'body':{'path':'publisher.html','sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)},'headers':{'Content-Type':'text/html'}}
            raise AssertionError('Unexpected public request')
        with patch.object(self.provider,'fetch',fetch):out=self.provider.recover_abstracts([citation(pmcid=None)])['1']
        self.assertEqual(calls,['PubMed_abstract_check','publisher_deposited_abstract','publisher_landing'])
        self.assertEqual(out['abstract_check_status'],'recovered');self.assertIn('Seventeen patients',out['abstract'])
        self.assertEqual(len(out['checks']),3);self.assertIn('abstract_provenance',out)
        self.assertFalse(out['global_unavailability_established']);self.assertEqual(path.read_bytes(),raw)

    def test_blocked_publisher_preserves_prior_checks_and_pending_without_absence(self):
        def fetch(url,kind,identity):
            if kind=='PubMed_abstract_check':return response(PUBMED_ABSENT)
            if kind=='publisher_deposited_abstract':return response(b'{"message":{"DOI":"10.1000/test"}}')
            return {'status':403,'error':'publisher blocked','body_bytes':b''}
        with patch.object(self.provider,'fetch',fetch):out=self.provider.recover_abstracts([citation(pmcid=None)])['1']
        self.assertEqual(out['abstract_check_status'],'technical_pending');self.assertIsNone(out['abstract'])
        self.assertEqual(len(out['checks']),3);self.assertFalse(out['global_unavailability_established'])
        self.assertEqual(out['checks'][-1]['source_result']['status'],403)

    def test_no_publisher_route_stays_pending_without_extra_request(self):
        with patch.object(self.provider,'fetch',return_value=response(PUBMED_ABSENT)) as fetch:
            out=self.provider.recover_abstracts([citation(pmcid=None,doi=None)])['1']
        self.assertEqual(fetch.call_count,1);self.assertEqual(out['abstract_check_status'],'technical_pending')
        self.assertEqual(len(out['checks']),2);self.assertFalse(out['global_unavailability_established'])


if __name__=='__main__':unittest.main()
