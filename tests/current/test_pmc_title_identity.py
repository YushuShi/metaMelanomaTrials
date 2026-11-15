from html import escape
import unittest

from metamelanoma.io import digest
from metamelanoma.pmc_html import document_from_pmc_html


def article(title, heading, *, pmid='123', doi='10.1234/trial'):
    prose = 'Patients with melanoma received treatment and were followed for response and survival. ' * 4
    return ('<!DOCTYPE html><html><head>'
        f'<meta name="citation_pmid" content="{pmid}"><meta name="citation_doi" content="{doi}">'
        f'<meta name="citation_title" content="{escape(title, quote=True)}">'
        '<link rel="canonical" href="https://pmc.ncbi.nlm.nih.gov/articles/PMC123/">'
        '</head><body><main><article>' + heading +
        '<section class="main-article-body"><h2>Methods</h2><p>' + prose +
        '</p><h2>Results</h2><p>' + prose + '</p></section></article></main></body></html>').encode()


class PMCTitleIdentityTests(unittest.TestCase):
    def parse(self, title, heading, **kwargs):
        body = article(title, heading, **kwargs)
        return document_from_pmc_html(body, {'pmid': '123', 'report_id': 'report-123', 'pmcid': 'PMC123',
            'doi': '10.1234/trial', 'title': title}, {'path': 'test.html', 'sha256': digest(body), 'bytes': len(body)})

    def test_typographic_dash_and_isotope_superscript_spacing_match(self):
        title = 'Early [18F]fluorodeoxyglucose-positron responses in BRAF-mutant melanoma.'
        heading = '<h1>Early [<sup>18</sup>F]fluorodeoxyglucose–positron responses in <i>BRAF</i>-mutant melanoma</h1>'
        self.assertTrue(self.parse(title, heading)['main_full_text_verified'])

    def test_exact_HGROUP_subtitle_matches_complete_metadata_title(self):
        title = 'Dual VEGF/VEGFR inhibition: Clinical effects and biomarkers'
        self.assertTrue(self.parse(title, '<hgroup><h1>Dual VEGF/VEGFR inhibition</h1>'
            '<p>Clinical effects and biomarkers</p></hgroup>')['main_full_text_verified'])

    def test_missing_foreign_or_unbound_subtitle_is_rejected(self):
        title = 'Dual VEGF/VEGFR inhibition: Clinical effects and biomarkers'
        for heading in ['<h1>Dual VEGF/VEGFR inhibition</h1>',
                '<h1>Dual VEGF/VEGFR inhibition</h1><p>Clinical effects and biomarkers</p>',
                '<hgroup><h1>Dual VEGF/VEGFR inhibition</h1><p>Different outcomes</p></hgroup>',
                '<hgroup><h1>Dual VEGF/VEGFR inhibition</h1><p>Clinical effects and biomarkers</p><p>Other paper</p></hgroup>']:
            with self.subTest(heading=heading), self.assertRaisesRegex(ValueError, 'heading'):
                self.parse(title, heading)

    def test_title_normalization_does_not_accept_foreign_identity_or_changed_words(self):
        with self.assertRaisesRegex(ValueError, 'PMID'):
            self.parse('Melanoma trial', '<h1>Melanoma trial</h1>', pmid='999')
        with self.assertRaisesRegex(ValueError, 'DOI'):
            self.parse('Melanoma trial', '<h1>Melanoma trial</h1>', doi='10.1234/other')
        with self.assertRaisesRegex(ValueError, 'heading'):
            self.parse('Melanoma trial without chemotherapy', '<h1>Melanoma trial with chemotherapy</h1>')


if __name__ == '__main__':
    unittest.main()
