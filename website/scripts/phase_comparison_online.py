"""Supplement missing PubMed electronic publication dates from publisher Crossref deposits."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sqlite3
import sys
from time import sleep
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from new_findings_dates import parse_date

ROOT=Path(__file__).resolve().parents[2]
def lookup(item):
    pmid,doi=item
    for attempt in range(3):
        try:
            url='https://api.crossref.org/works/'+quote(doi,safe='')
            with urlopen(Request(url,headers={'User-Agent':'metaMelanomaTrials-publication-metadata/1.0'}),timeout=15) as response:
                item=json.load(response)['message']
            if item['DOI'].lower()!=doi.lower(): return pmid,None
            parts=item.get('published-online',{}).get('date-parts',[[]])[0]
            return pmid,{'doi':doi,'date':parse_date(*map(str,parts))} if parts else None
        except HTTPError as err:
            if err.code in [400,404]:break
            if attempt==2:raise
        except OSError:
            if attempt==2:raise
        sleep(2**attempt)
    return pmid,None
if __name__=='__main__':
    catalogue=json.loads((ROOT/'website/config/phase_comparison_citations.json').read_text())
    with sqlite3.connect((ROOT/'data/current/articles.sqlite3').as_uri()+'?mode=ro',uri=True) as db:
        records=[json.loads(row[0]) for row in db.execute('select citation_json from articles')]
    todo=[]
    for r in records:
        p=catalogue.get(r['pmid'],{})
        if r.get('doi') and p.get('date_basis')!='Online publication' and p.get('role')=='primary' and set(p.get('phases',[]))&{2,3}:
            todo.append((r['pmid'],r['doi']))
    with ThreadPoolExecutor(4) as pool:
        dates={pmid:item for pmid,item in pool.map(lookup,todo) if item and item['date']}
    dst=ROOT/'website/config/phase_comparison_online.json'
    tmp=dst.with_suffix('.tmp');tmp.write_text(json.dumps(dates,sort_keys=True,separators=(',',':'))+'\n');tmp.replace(dst)
    print('Publisher electronic dates available for',len(dates),'of',len(todo),'candidate papers.')
