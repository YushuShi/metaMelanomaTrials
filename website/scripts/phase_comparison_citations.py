"""Save tab-specific publication metadata from the research workspace's PubMed records.

Only public bylines, dates, publication roles, and phase evidence are exported. The public build reads
the saved metadata without a citation database, full text, or a network connection.
"""
import argparse
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree

from new_findings_dates import START, bibliographic_date, xml_publication_dates

ROOT = Path(__file__).resolve().parents[2]
PHASE = re.compile(r'\bphases?\s*[-–]?\s*(iii|ii|iv|i|[1-4])(?:[abc])?\b(?:\s*(?:/|–|-|to|and|or)\s*(?:phase\s*)?(iii|ii|iv|i|[1-4])(?:[abc])?\b)?', re.I)
DIGIT = {'i':1, 'ii':2, 'iii':3, 'iv':4}
SECONDARY = re.compile(r'\b(?:post[- ]hoc|secondary analysis|subgroup analysis|pooled analysis|correlative (?:study|analysis)|patient.reported outcomes?|quality of life|cost.effectiveness|pharmacokinetics?|prognostic (?:impact|value)|biomarker analysis|long.term (?:follow.up|survival|outcomes)|\d+[- ]year (?:follow.up|outcomes|survival)|updated (?:efficacy|survival|results)|[0-9]+[- ]year update|survival update|follow.up (?:analysis|study|results)|final overall survival)\b', re.I)
INTERIM = re.compile(r'\b(?:interim (?:analysis|results?)|preliminary (?:analysis|results?|report)|trial (?:design|in progress)|study protocol)\b', re.I)
OWN = re.compile(r'\b(?:our|this|in th[ie]s[ea]?|conducted|undertook|designed|methods|we (?:evaluated|assessed|did|performed)|open.label|randomi[sz]ed|single.arm|multicent[er]+|dose.expansion)\b', re.I)
PRIMARY = re.compile(r'\b(?:primary (?:efficacy )?end\s*point|primary (?:objective|analysis|outcome)|overall response rate|objective response rate|primary results)\b', re.I)


def phases(s):
    return sorted({DIGIT.get(t.lower(), int(t) if t.isdigit() else 0) for pair in PHASE.findall(s or '') for t in pair if t})


def phase_evidence(row):
    title = row.get('title') or ''
    abstract = row.get('abstract') or ''
    types = row.get('publication_types') or []
    title_phases = phases(title)
    indexed = sorted({p for s in types if 'Clinical Trial, Phase' in s for p in phases(s)})
    sentences = re.split(r'(?:\n|(?<=[.!?])\s+)', abstract)
    methods = [s for s in sentences if PHASE.search(s) and OWN.search(s.split('phase')[0] if 'phase' in s else s)
               and not re.search(r'\b(?:previous (?:phase|trial)|previously (?:demonstrated|reported)|compared (?:with|to) (?:the )?phase|based on the|led to|warrants|future|ongoing phase|will be|published phase)\b', s, re.I)]
    method_phases = sorted({p for s in methods for p in phases(s)})
    # Explicitly named phases and PubMed design headings jointly protect combined
    # I/II or II/III reports against assignment to a standalone phase.
    design = sorted(set(title_phases + indexed)) if title_phases or indexed else method_phases
    role = (row.get('historical_R1') or {}).get('report_type')
    # Optional source cues support linkage. Neither R1 role nor a phase mention
    # alone establishes a completed primary analysis.
    primary_cue = bool(PRIMARY.search(abstract))
    reported = bool(re.search(r'\b(?:observed|achieved|were (?:enrolled|treated)|received|responded|randomi[sz]ed|median (?:survival|progression)|response (?:was|rate))\b', abstract, re.I) and re.search(r'\d', abstract))
    is_followup = bool(SECONDARY.search(title) or role in {'trial_biomarker','trial_followup','trial_subgroup','trial_safety'})
    disallowed = bool(set(types) & {'Review','Meta-Analysis','Editorial','Comment','Preprint','Published Erratum','Retracted Publication','Clinical Trial Protocol'}
                      or role in {'trial_pooled_analysis','review','meta_analysis','systematic_review','protocol','editorial'}
                      or re.search(r'\b(?:pooled (?:analysis|results)|systematic review|meta.analysis|matching.adjusted indirect comparison|indirect comparison|trial protocol|design and rationale)\b',title,re.I))
    interim = bool(INTERIM.search(title) or re.search(r'\b(?:we (?:present|report)(?: the)?|this is)(?: the)? (?:first )?(?:preliminary|interim) (?:findings|results|analysis)\b',abstract,re.I))
    original = bool(not disallowed and not interim and not is_followup and reported and (
        (role == 'trial_primary' and (title_phases or indexed or methods or primary_cue)) or
        (primary_cue and (title_phases or indexed or methods)) or
        (title_phases and re.search(r'\b(?:trial|study)\b',title,re.I))))
    return {'phases':design, 'title_phases':title_phases, 'primary_readout':bool(primary_cue and reported and not interim), 'role':'ineligible' if disallowed else 'interim' if interim else 'primary' if original else 'secondary',
            'date':bibliographic_date(row.get('publication_date')) or (str(row['year']) if row.get('year') else None),
            'date_basis':'Citation publication date', 'phase_basis':'PubMed title/indexing' if title_phases or indexed else 'Published study methods' if methods else None,
            'registration_ids':row.get('trial_identifiers') or []}


def pubmed_articles(directory, wanted, skip_files=()):
    for file in sorted(directory.glob('*.body')):
        if file.name in skip_files:
            continue
        with file.open('rb') as f:
            if b'<PubmedArticleSet' not in f.read(1024): continue
            f.seek(0)
            buf = f.read()
        for m in START.finditer(buf):
            pmid = m[1].decode()
            if pmid not in wanted: continue
            end = buf.index(b'</PubmedArticle>', m.end()) + len(b'</PubmedArticle>')
            yield pmid, ElementTree.fromstring(buf[m.start():end])


def first_author(article):
    author = article.find('./MedlineCitation/Article/AuthorList/Author')
    if author is None: return None
    return author.findtext('LastName') or author.findtext('CollectiveName')


def build(author_cache=None):
    with sqlite3.connect((ROOT / 'data/current/articles.sqlite3').as_uri()+'?mode=ro', uri=True) as db:
        rows = (json.loads(r[0]) for r in db.execute('select citation_json from articles'))
        catalog = {str(r['pmid']): info for r in rows if (info := phase_evidence(r))}
    dates, authors = defaultdict(set), defaultdict(set)
    primary_cache = ROOT/'data/raw/pubmed'
    for pmid, article in pubmed_articles(primary_cache, catalog):
        dates[pmid].update(xml_publication_dates(article))
        if name := first_author(article):
            authors[pmid].add(name)
    if author_cache:
        wanted = catalog.keys() - authors.keys()
        scanned = {file.name for file in primary_cache.glob('*.body')}
        for pmid, article in pubmed_articles(author_cache, wanted, scanned):
            if name := first_author(article):
                authors[pmid].add(name)
    # Supplemental PubMed batches may be offline on a later monthly refresh.
    # A newly cached structured byline for the same PMID takes precedence.
    saved_file = ROOT/'website/config/phase_comparison_citations.json'
    previous = json.loads(saved_file.read_text()) if saved_file.exists() else {}
    for pmid,row in catalog.items():
        names = authors.get(pmid, set())
        if len(names) == 1:
            row['first_author'] = next(iter(names))
        elif not names and (name := previous.get(pmid, {}).get('first_author')):
            row['first_author'] = name
        candidates = dates.get(pmid, set())
        online = {d for d,src in candidates if src == 'Online publication'}
        journal = {d for d,src in candidates if src != 'Online publication'}
        choice = online or journal
        if choice:
            # Preserve recorded precision without assigning a fictitious day.
            refined = sorted(d for d in choice if not any(o.startswith(d+'-') for o in choice))
            row.update(date=refined[0],date_basis='Online publication' if online else 'Journal publication')
    online_file=ROOT/'website/config/phase_comparison_online.json'
    if online_file.exists():
        with sqlite3.connect((ROOT/'data/current/articles.sqlite3').as_uri()+'?mode=ro',uri=True) as db:
            dois={r['pmid']:str(r.get('doi') or '').casefold() for (raw,) in db.execute('select citation_json from articles') for r in [json.loads(raw)]}
        for pmid,extra in json.loads(online_file.read_text()).items():
            if pmid in catalog and dois.get(pmid)==extra['doi'].casefold() and catalog[pmid]['date_basis']!='Online publication':
                catalog[pmid].update(date=extra['date'],date_basis='Publisher online publication')
    # The registry lists the first author as PI, the isolated limb infusion
    # regimen and the publication. The local extraction omitted this ID.
    if '29339377' in catalog:
        catalog['29339377'].update(registration_ids=['NCT01323517'],
            registration_source='https://clinicaltrials.gov/study/NCT01323517')
    return catalog


if __name__=='__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--author-cache',type=Path,help='Additional local PubMed XML batches for missing first-author bylines')
    args = parser.parse_args()
    out=ROOT/'website/config/phase_comparison_citations.json'
    out.write_text(json.dumps(build(args.author_cache),ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n')
