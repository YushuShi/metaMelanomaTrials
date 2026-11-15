"""Offline primary-publisher HTML fixtures; no real network or model calls."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from metamelanoma import abstracts as a
from metamelanoma.io import reference
from metamelanoma.sources import PublicSources

CITATION = {"pmid": "123", "report_id": "report-" + "a" * 24, "doi": "10.1000/test"}
ABSTRACT = "Twenty-five patients with melanoma were treated. The reported response was 40% and no model values were inferred."


def page(content="", metadata=None):
    metadata = '<meta name="citation_doi" content="10.1000/test">' if metadata is None else metadata
    return ('<!doctype html><html><head>' + metadata + '</head><body>' + content + '</body></html>').encode()


def parse(raw, citation=None, content_type="text/html; charset=utf-8"):
    return a.parse_publisher_abstract(raw, citation or CITATION,
        raw_ref={"path": "fixture.html", "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}, content_type=content_type)


class Tests(unittest.TestCase):
    def test_explicit_citation_abstract_and_exact_raw_span_provenance(self):
        raw = page(metadata='<meta name="citation_doi" content="10.1000/test"><meta name="citation_abstract" content="' + ABSTRACT + '">')
        result = parse(raw)
        self.assertEqual(result['abstract'], ABSTRACT)
        self.assertIn('Twenty-five', result['abstract'])
        span = result['abstract_provenance']['spans'][0]
        literal = raw.decode()[span['decoded_html_char_start']:span['decoded_html_char_end']]
        self.assertIn('citation_abstract', literal)
        self.assertEqual(hashlib.sha256(literal.encode()).hexdigest(), span['decoded_html_span_sha256'])
        self.assertFalse(result['global_unavailability_established'])

    def test_generic_marketing_metadata_summary_graphical_and_intro_are_not_abstracts(self):
        for content, metadata in [('', '<meta name="citation_doi" content="10.1000/test"><meta name="description" content="' + ABSTRACT + '">'),
                                  ('<section class="plain-language-summary"><h2>Abstract</h2><p>' + ABSTRACT + '</p></section>', None),
                                  ('<section id="graphical-abstract"><h2>Abstract</h2><p>' + ABSTRACT + '</p></section>', None),
                                  ('<h2>Introduction</h2><p>' + ABSTRACT + '</p>', None)]:
            with self.subTest(content=content), self.assertRaises(a.AbstractPending): parse(page(content, metadata))

    def test_scholarly_json_ld_requires_exact_identity_and_preserves_json_pointer(self):
        article = {'@context': 'https://schema.org', '@type': 'ScholarlyArticle', 'identifier': {'@type': 'PropertyValue', 'propertyID': 'DOI', 'value': '10.1000/test'}, 'abstract': {'@value': ABSTRACT, '@language': 'en'}}
        raw = page('<script type="application/ld+json">' + json.dumps(article) + '</script>', metadata='')
        result = parse(raw)
        self.assertEqual(result['abstract'], ABSTRACT)
        self.assertEqual(result['abstract_provenance']['spans'][0]['json_pointer'], '/abstract')
        self.assertTrue(result['identity']['primary_metadata'])
        article['@type'] = 'NewsArticle'
        with self.assertRaises(a.AbstractPending): parse(page('<script type="application/ld+json">' + json.dumps(article) + '</script>', metadata=''))
        article['@type'] = 'https://unrelated.example/ScholarlyArticle'
        with self.assertRaises(a.AbstractPending): parse(page('<script type="application/ld+json">' + json.dumps(article) + '</script>', metadata=''))

    def test_cited_json_ld_and_ambiguous_primary_graph_are_not_primary_article_proof(self):
        primary = {'@type': 'ScholarlyArticle', 'identifier': '10.9999/other', 'citation': {'@type': 'ScholarlyArticle', 'identifier': '10.1000/test', 'abstract': ABSTRACT}}
        with self.assertRaises(a.AbstractPending): parse(page('<script type="application/ld+json">' + json.dumps(primary) + '</script>', metadata=''))
        graph = {'@graph': [primary, {'@type': 'ScholarlyArticle', 'identifier': '10.1000/test', 'abstract': ABSTRACT}]}
        with self.assertRaisesRegex(a.AbstractPending, 'Ambiguous'): parse(page('<script type="application/ld+json">' + json.dumps(graph) + '</script>', metadata=''))

    def test_present_wrong_doi_or_pmid_cannot_be_ignored(self):
        for metadata in ['<meta name="citation_doi" content="10.9999/other"><meta name="citation_pmid" content="123">',
                         '<meta name="citation_doi" content="10.1000/test"><meta name="citation_pmid" content="999">',
                         '<meta name="citation_doi" content="10.1000/test"><meta name="citation_doi" content="10.9999/other">']:
            with self.subTest(metadata=metadata), self.assertRaises(a.AbstractPending): parse(page('<section id="abstract">' + ABSTRACT + '</section>', metadata))
        with self.assertRaises(a.AbstractPending): parse(page('<p>References DOI 10.1000/test</p><section id="abstract">' + ABSTRACT + '</section>', metadata=''))

    def test_related_metadata_json_and_explicit_foreign_article_are_not_primary(self):
        metadata = '<meta name="citation_doi" content="10.1000/test"><meta name="citation_abstract" content="' + ABSTRACT + '">'
        article = {'@type':'ScholarlyArticle','identifier':'10.1000/test','abstract':ABSTRACT}
        bad = [page('<aside>'+metadata+'</aside>', metadata=''),
               page('<aside class="related-article"><meta name="citation_abstract" content="'+ABSTRACT+'"></aside>'),
               page('<aside class="references"><script type="application/ld+json">'+json.dumps(article)+'</script></aside>',metadata=''),
               page('<article data-doi="10.9999/other"><section id="abstract">'+ABSTRACT+'</section></article>'),
               page('<section id="abstract"><article data-doi="10.9999/other">'+ABSTRACT+'</article></section>'),
               page('<section id="abstract"><aside>'+ABSTRACT+'</aside></section>'),
               page('<article data-pmid="999"><h2>Abstract</h2>'+ABSTRACT+'<h2>Introduction</h2></article>')]
        for raw in bad:
            with self.subTest(raw=raw),self.assertRaises(a.AbstractPending):parse(raw)
        primary='<article data-doi="10.1000/test" data-pmid="123"><section id="abstract">'+ABSTRACT+'</section></article>'
        self.assertEqual(parse(page(primary))['abstract'],ABSTRACT)

    def test_explicit_section_and_flat_heading_stop_at_clear_boundary(self):
        for content in ['<section id="abstract"><div><h2>Abstract</h2><h3>Methods</h3><p>' + ABSTRACT + '</p></div></section><h2>Introduction</h2><p>Not abstract body.</p>',
                        '<h2>Abstract</h2><p>' + ABSTRACT + '</p><h2>Introduction</h2><p>Not abstract body.</p>']:
            result = parse(page(content))
            self.assertIn(ABSTRACT, result['abstract'])
            self.assertNotIn('Not abstract body', result['abstract'])
            self.assertNotIn('Introduction', result['abstract'])
        with self.assertRaises(a.AbstractPending): parse(page('<h2>Abstract</h2><p>' + ABSTRACT + '</p>'))

    def test_conflicting_marked_texts_are_pending_while_identical_duplicates_coalesce(self):
        metadata = '<meta name="citation_doi" content="10.1000/test"><meta name="citation_abstract" content="' + ABSTRACT + '">'
        self.assertEqual(parse(page('<section id="abstract">' + ABSTRACT + '</section>', metadata))['abstract'], ABSTRACT)
        with self.assertRaisesRegex(a.AbstractPending, 'Conflicting'):
            parse(page('<section id="abstract">' + ABSTRACT.replace('40%', '50%') + '</section>', metadata))

    def test_blocked_malformed_unclosed_and_truncated_pages_stay_pending(self):
        bad = [page('<h1>Verify you are human</h1><section id="abstract">' + ABSTRACT + '</section>'),
               page('<script type="application/ld+json">{broken}</script>'),
               page('<section id="abstract">' + ABSTRACT).replace(b'</body></html>', b''),
               page('<section id="abstract">' + ABSTRACT + ' Read more</section>')]
        for raw in bad:
            with self.subTest(raw=raw), self.assertRaises(a.AbstractPending): parse(raw)

    def test_pmid_metadata_can_identify_a_page_without_assuming_a_doi_route(self):
        raw = page('<section id="abstract">' + ABSTRACT + '</section>', '<meta name="citation_pmid" content="123">')
        self.assertEqual(parse(raw, {**CITATION, 'doi': None})['abstract'], ABSTRACT)

    def test_no_lossy_encoding_or_changed_original_reference(self):
        raw = page('<section id="abstract">' + ABSTRACT + '</section>')
        with self.assertRaises(a.AbstractPending):
            a.parse_publisher_abstract(raw, CITATION, raw_ref={'path':'x','sha256':'0'*64})
        with self.assertRaises(a.AbstractPending): parse(raw + b'\xff')
        with self.assertRaises(a.AbstractPending): parse(raw, content_type='application/pdf')

    def test_recovery_uses_only_existing_fetch_and_preserved_original_bytes(self):
        with TemporaryDirectory() as temp:
            root = Path(temp).resolve(); provider = PublicSources(root, max_attempts=1)
            raw = page('<section id="abstract">' + ABSTRACT + '</section>')
            path = root/'data/sources/fixture.html'; path.parent.mkdir(parents=True); path.write_bytes(raw)
            result = {'status':200,'url':'https://doi.org/10.1000/test','final_url':'https://publisher.example/article',
                      'body':reference(root,path),'body_bytes':raw,'headers':{'Content-Type':'text/html; charset=utf-8'},'error':None}
            citation = deepcopy(CITATION)
            with patch.object(provider,'fetch',return_value=result) as fetch:
                recovered = a.recover_publisher_abstract(provider,citation)
            fetch.assert_called_once_with('https://doi.org/10.1000/test','publisher_landing','123')
            self.assertEqual(recovered['abstract'], ABSTRACT);self.assertEqual(path.read_bytes(),raw)
            self.assertEqual(citation,CITATION);json.dumps(recovered)
            self.assertNotIn('body_bytes',recovered['checks'][0]['source_result'])

    def test_failed_and_missing_routes_do_not_claim_absence_or_abort_other_articles(self):
        with TemporaryDirectory() as temp:
            provider = PublicSources(Path(temp), max_attempts=1)
            with patch.object(provider,'fetch',return_value={'status':403,'error':'blocked'}) as fetch:
                result=a.recover_publisher_abstract(provider,CITATION)
                self.assertEqual(result['abstract_check_status'],'technical_pending');self.assertIsNone(result['abstract']);self.assertFalse(result['global_unavailability_established'])
            with patch.object(provider,'fetch',side_effect=AssertionError('No unproven publisher URL')):
                self.assertEqual(a.recover_publisher_abstract(provider,{**CITATION,'doi':None})['abstract_check_status'],'technical_pending')
            with patch.object(provider,'fetch',side_effect=FileNotFoundError('Missing public source cache')):
                self.assertEqual(a.recover_publisher_abstract(provider,CITATION)['abstract_check_status'],'technical_pending')

    def test_case_insensitive_http_charset_preserves_non_ascii_text(self):
        with TemporaryDirectory() as temp:
            root=Path(temp).resolve();provider=PublicSources(root,max_attempts=1)
            raw=page('<section id="abstract">'+ABSTRACT+' Café.</section>').decode().encode('iso-8859-1')
            path=root/'landing.html';path.write_bytes(raw)
            result={'status':200,'body':reference(root,path),'body_bytes':raw,'headers':{'Content-Type':'text/html; charset=iso-8859-1'}}
            with patch.object(provider,'fetch',return_value=result):out=a.recover_publisher_abstract(provider,CITATION)
            self.assertIn('Café',out['abstract']);self.assertEqual(out['abstract_provenance']['source_encoding'],'iso-8859-1')


if __name__ == '__main__':
    unittest.main()
