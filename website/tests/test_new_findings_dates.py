import importlib.util
import unittest
from pathlib import Path
from xml.etree import ElementTree

module_path = Path(__file__).resolve().parents[1] / "scripts/new_findings_dates.py"
spec = importlib.util.spec_from_file_location("new_findings_dates", module_path)
dates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dates)


class NewFindingsPublicationDates(unittest.TestCase):
    def test_online_date_precedes_issue_and_indexing_is_ignored(self):
        article = ElementTree.fromstring("""
            <PubmedArticle><MedlineCitation><Article><ArticleDate DateType="Electronic">
              <Year>2026</Year><Month>09</Month><Day>29</Day></ArticleDate>
              <Journal><JournalIssue><PubDate><Year>2026</Year><Month>Oct</Month></PubDate></JournalIssue></Journal>
            </Article></MedlineCitation><PubmedData><History><PubMedPubDate PubStatus="pubmed">
              <Year>2025</Year><Month>11</Month><Day>8</Day>
            </PubMedPubDate></History></PubmedData></PubmedArticle>""")
        candidates = dates.xml_publication_dates(article)
        self.assertEqual(dates.first_publication(candidates), ("2026-09-29", "Online publication"))

    def test_month_and_year_resolution(self):
        self.assertEqual(dates.bibliographic_date("2026 Oct"), "2026-10")
        self.assertEqual(dates.bibliographic_date("2026"), "2026")
        self.assertEqual(dates.bibliographic_date("2026-02-30"), None)
        self.assertEqual(dates.first_publication([("2026","Journal issue"), ("2026-10-05","Online publication")]),
                         ("2026-10-05","Online publication"))

    def test_note_requires_source_and_identity(self):
        note = {"doi":"10.A","required_abstract_passages":["melanoma (n = 377)"],"finding":"Melanoma N=377."}
        self.assertEqual(dates.supported_note(note, {"doi":"10.a","abstract":"melanoma (n = 377) analyses"}), note["finding"])
        self.assertIsNone(dates.supported_note(note, {"doi":"10.a","abstract":"mixed cohort (n = 377)"}))
        self.assertIsNone(dates.supported_note(note, {"doi":"10.b","abstract":"melanoma (n = 377)"}))
