"""Extract bibliographic publication dates from the local PubMed XML archive."""
import argparse
import calendar
import json
import re
import sqlite3
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
CUTOFF = '2026-10-01'
START = re.compile(rb'<PubmedArticle(?:\s[^>]*)?>\s*<MedlineCitation\b[^>]*>\s*<PMID\b[^>]*>(\d+)</PMID>')
MONTHS = {key.lower(): i for i in range(1, 13) for key in (calendar.month_abbr[i], calendar.month_name[i])}


def parse_date(year, month=None, day=None):
    if not year or not re.fullmatch(r'\d{4}', year):
        return None
    if not month:
        return year
    m = int(month) if month.isdecimal() else MONTHS.get(month.lower())
    if not m or m > 12:
        return None
    if not day:
        return f'{year}-{m:02}'
    try:
        return date(int(year), m, int(day)).isoformat()
    except ValueError:
        return None


def bibliographic_date(raw):
    match = re.fullmatch(r'(\d{4})[ -]?([A-Za-z]+|\d{2})?[ -]?(\d{1,2})?', raw or '')
    return parse_date(*match.groups()) if match else None


def xml_publication_dates(article):
    results = []
    for path, source in [('MedlineCitation/Article/ArticleDate[@DateType="Electronic"]', 'Online publication'),
                         ('PubmedData/History/PubMedPubDate[@PubStatus="epublish"]', 'Online publication'),
                         ('PubmedData/History/PubMedPubDate[@PubStatus="aheadofprint"]', 'Online publication'),
                         ('PubmedData/History/PubMedPubDate[@PubStatus="ppublish"]', 'Print publication'),
                         ('MedlineCitation/Article/Journal/JournalIssue/PubDate', 'Journal issue')]:
        for field in article.findall(path):
            value = parse_date(field.findtext('Year'), field.findtext('Month'), field.findtext('Day')) or bibliographic_date(field.findtext('MedlineDate'))
            if value:
                results.append((value, source))
    return results


def first_publication(dates):
    # A year-only journal date or month-only issue does not put a specific
    # publication date earlier within that same period. Keep the finer date.
    dates = set(dates)
    refined = [(dt, src) for dt, src in dates if not any(other.startswith(dt + '-') for other, _ in dates)]
    precedence = {'Online publication': 0, 'Print publication': 1, 'Journal issue': 2, 'Citation publication date': 3, 'Publisher publication date': 2}
    return min(refined, key=lambda v: (v[0], precedence[v[1]])) if refined else (None, None)


def supported_note(note, row):
    if not note or note['doi'].casefold() != str(row.get('doi') or '').casefold():
        return None
    abstract = ' '.join((row.get('abstract') or '').split())
    if all(passage in abstract for passage in note['required_abstract_passages']):
        return note['finding']
    return None


def build(root):
    db = sqlite3.connect((root / 'data/current/articles.sqlite3').as_uri() + '?mode=ro', uri=True)
    try:
        citations = [json.loads(row[0]) for row in db.execute('select citation_json from articles')]
    finally:
        db.close()
    recent = {str(r['pmid']): r for r in citations if not str(r.get('year', '')).isdigit() or int(r['year']) >= int(CUTOFF[:4])}
    dates = {pmid: set() for pmid in recent}
    for path in sorted((root / 'data/raw/pubmed').glob('*.body')):
        with path.open('rb') as fh:
            if b'<PubmedArticleSet' not in fh.read(1024):
                continue
            fh.seek(0)
            data = fh.read()
        for member in START.finditer(data):
            pmid = member[1].decode()
            if pmid in dates:
                end = data.index(b'</PubmedArticle>', member.end()) + len(b'</PubmedArticle>')
                dates[pmid].update(xml_publication_dates(ET.fromstring(data[member.start():end])))
    deposit = root / 'website/config/new_findings_crossref_dates.json'
    supplements = json.loads(deposit.read_text()) if deposit.is_file() else {}
    notes_file = root / 'website/config/new_findings_source_notes.json'
    notes = json.loads(notes_file.read_text()) if notes_file.is_file() else {}
    result = {}
    for pmid, row in recent.items():
        citation = bibliographic_date(row.get('publication_date'))
        if citation:
            dates[pmid].add((citation, 'Citation publication date'))
        supplement = supplements.get(pmid, {})
        if supplement and supplement.get('doi', '').casefold() == str(row.get('doi') or '').casefold():
            for key, source in [('published-online','Online publication'), ('published-print','Print publication'), ('published','Publisher publication date')]:
                if parts := supplement.get(key):
                    value = parse_date(*map(str, parts))
                    if value:
                        dates[pmid].add((value, source))
        first, basis = first_publication(dates[pmid])
        result[pmid] = {'date': first, 'date_basis': basis, 'report_id': row['report_id']}
        if note := supported_note(notes.get(pmid), row):
            result[pmid]['abstract_note'] = note
    return {'cutoff': CUTOFF, 'citations': result}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    root = args.root.resolve()
    out = root / 'website/config/new_findings_publication_dates.json'
    if not (root / 'data/current/articles.sqlite3').is_file() or not any((root / 'data/raw/pubmed').glob('*.body')):
        print('No PubMed archive available. Using saved publication date catalogue when present.')
        raise SystemExit(0)
    out.parent.mkdir(parents=True, exist_ok=True)
    series = build(root)
    temp = out.with_suffix('.tmp')
    temp.write_text(json.dumps(series, ensure_ascii=False, indent=2)+'\n')
    temp.replace(out)
    print(f"Saved publication metadata for {len(series['citations'])} reports")
