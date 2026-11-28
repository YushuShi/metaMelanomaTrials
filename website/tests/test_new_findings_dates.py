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

    def test_qualitative_findings_verify_citation_statement_and_individual_scope(self):
        quote = "Treatment significantly reduced marker X in the melanoma cohort."
        item = {"endpoint": "Marker X", "value": "Decreased after treatment", "source_quote": quote,
                "scope_quote": "within the melanoma cohort receiving treatment A"}
        notes = {"17": {"doi": "10.Example", "qualitative_findings": [item, {**item, "scope_quote": "NRAS-mutant subgroup"}]}}
        row = {"doi": "10.example", "pmid": 17,
               "abstract": "The study included melanoma and lung cancer. We assayed marker X "
                           "within the melanoma cohort receiving treatment A. " + quote}
        projected = {key: item[key] for key in ("endpoint", "value", "source_quote")}
        self.assertEqual(dates.supported_qualitative_findings(notes, row), [projected])
        for change in ({"pmid": 18}, {"doi": "10.other"}, {"doi": None}, {"abstract": quote},
                       {"abstract": row["abstract"].replace("significantly reduced", "did not significantly reduce")}):
            with self.subTest(change=change):
                self.assertEqual(dates.supported_qualitative_findings(notes, {**row, **change}), [])

    def test_discovers_unseen_scoped_statements_in_results_only(self):
        claim = "In patients with metastatic melanoma, pembrolizumab significantly improved overall survival."
        row = {"title": "Immunotherapy in mixed cancers", "abstract": "Methods: Two cohorts were followed. Findings: " +
               claim + " Treatment significantly improved progression-free survival in the lung cancer cohort."}
        self.assertEqual(dates.abstract_qualitative_findings(row),
                         [{"endpoint": "Overall survival", "value": claim, "source_quote": claim}])
        passive = "In the melanoma cohort, OS was significantly longer with pembrolizumab versus placebo."
        self.assertEqual(dates.abstract_qualitative_findings({**row, "abstract": "Results: " + passive})[0]["source_quote"], passive)
        at_trial = "Treatment significantly prolonged progression-free survival in the overall population."
        trial = {"title": "A phase II trial in melanoma", "abstract": "Methods: We enrolled patients with melanoma. Results: " + at_trial}
        self.assertEqual(dates.abstract_qualitative_findings(trial)[0]["source_quote"], at_trial)
        standalone = "The difference in overall survival was statistically significant."
        self.assertEqual(dates.abstract_qualitative_findings({**trial, "abstract":
            "Methods: We enrolled 100 patients with melanoma. Findings: " + standalone})[0]["source_quote"], standalone)
        self.assertEqual(dates.abstract_qualitative_findings({**trial, "title": "A basket trial in melanoma and sarcoma"}), [])

    def test_declines_unscoped_mixed_negated_qualified_quoted_and_numerical_claims(self):
        claim = "In the melanoma cohort, treatment significantly improved OS."
        excluded = [("Conclusions: ", claim), ("Results: ", claim.replace("significantly", "clinically significantly")),
                    ("Results: ", claim.replace("significantly improved", "did not significantly improve")),
                    ("Results: ", claim.replace("OS.", "OS and PFS.")), ("Results: ", claim.replace("OS.", "OS (p=0.02).")),
                    ("Results: ", claim + " However, the adjusted analysis did not reach significance."),
                    ("Results: ", "The previous trial reported the following. " + claim),
                    ("Results: ", claim.replace("the melanoma cohort", "the overall population")),
                    ("Results: ", claim.replace("In the melanoma cohort, ", ""))]
        for heading, statement in excluded:
            with self.subTest(text=heading + statement):
                self.assertEqual(dates.abstract_qualitative_findings({"title": "Melanoma and other cancers",
                                                                     "abstract": heading + statement}), [])
