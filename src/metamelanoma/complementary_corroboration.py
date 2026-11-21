"""Verify an Opus proposal against the labelled row and column of an original table."""
from functools import lru_cache
import html
import math
import re

from . import complementary_contract as contract
from . import complementary_resolution as resolver
from . import quantitative as q


_TABLE = re.compile(r'<table(?=[\s>])[^>]*>.*?</table\s*>', re.I | re.S)
_ROW = re.compile(r'<tr\b[^>]*>(.*?)</tr\s*>', re.I | re.S)
_CELL = re.compile(r'<t(?P<tag>[hd])\b(?P<attrs>[^>]*?)(?:/\s*>|>(?P<inner>.*?)</t(?P=tag)\s*>)', re.I | re.S)
_NUMBER = r'(?:0|[1-9]\d*)(?:\.\d+)?'
_PAIR = re.compile(rf'(\d+)\s*\(\s*({_NUMBER})\s*%?\s*\)')
_N = re.compile(r'\b[nN]\s*=\s*(\d+)\b')
_COUNT = re.compile(r'^(?:n|no\.?|number(?: of (?:patients|participants))?|count)$', re.I)
_PAIR_HEADER = re.compile(r'(?:\bn\b|\bno\.?|\bnumber)\s*[,;:]?\s*\(\s*%\s*\)', re.I)
_ENDPOINTS = {
    'ORR': {'orr', 'objective response', 'objective response rate', 'overall response rate',
            'objective response cr plus pr', 'objective response cr pr'},
    'DCR': {'dcr', 'disease control', 'disease control rate'},
    'CR': {'cr', 'complete response', 'complete remission'},
    'PR': {'pr', 'partial response', 'partial remission'},
    'SD': {'sd', 'stable disease'}, 'PD': {'pd', 'progressive disease'},
}
_COMPLEX = re.compile(r'\b(?:intracranial|extracranial|lesion|local|brain|central review|bicr|'
                      r'unconfirmed|irrecist|metabolic|pathologic|week|month|year|subgroup)\w*\b', re.I)


def _text(markup):
    return ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', markup)).split())


def _key(text):
    return ' '.join(re.findall(r'[\w]+', text.casefold(), re.UNICODE))


def _extent(attributes, field):
    match = re.search(r'\b'+field+r'\s*=\s*["\']?(\d+)', attributes, re.I)
    return int(match[1]) if match else 1


def _grid(markup):
    """Expand row/column spans. Reject incomplete or overlapping grids."""
    placed = {}
    rows = list(_ROW.finditer(markup))
    if len(rows) > 1500:
        return []
    widths = [0] * len(rows)
    for y, row in enumerate(rows):
        x = 0
        for cell in _CELL.finditer(row[1]):
            while (y, x) in placed:
                x += 1
            h, w = _extent(cell['attrs'], 'rowspan'), _extent(cell['attrs'], 'colspan')
            if h < 1 or w < 1 or y+h > len(rows) or x+w > 100:
                return []
            value = _text(cell['inner'] or '')
            for yy in range(y, y+h):
                widths[yy] = max(widths[yy],x+w)
                for xx in range(x, x+w):
                    if (yy,xx) in placed:
                        return []
                    placed[yy,xx] = value
            x += w
    if any((y,x) not in placed for y,width in enumerate(widths) for x in range(width)):
        return []
    return [([placed[y,x] for x in range(widths[y])], row[0]) for y,row in enumerate(rows)]


@lru_cache(maxsize=12)
def _table(span):
    matches = list(_TABLE.finditer(span))
    if len(matches) != 1:
        return None
    table = matches[0]
    header = re.search(r'<thead\b[^>]*>(.*?)</thead\s*>',table[0],re.I|re.S)
    body = re.search(r'<tbody\b[^>]*>(.*?)</tbody\s*>',table[0],re.I|re.S)
    if not header or not body or len(re.findall(r'<tbody\b', table[0],re.I)) != 1:
        return None
    heads = _grid(header[1])
    if not heads:
        return None
    width = len(heads[0][0])
    if any(len(row)!=width for row,_ in heads):
        return None
    headers = [tuple(dict.fromkeys(s[i] for s,_ in heads if s[i])) for i in range(width)]
    caption = _text(span[:table.start()])[-700:]
    return caption, headers, _grid(body[1]), header[0]


def _arm_name(s):
    s = re.sub(r'[\[(]\s*n\s*=\s*\d+\s*[\])]', '', s, flags=re.I)
    return _key(re.sub(r'\s*\+\s*',' plus ',s))


def _arm_column(record, row, header):
    arms = [a for a in record.get('arms',[]) if a['id']==row.get('arm_id')]
    if len(arms)!=1:
        return False
    name = _arm_name(arms[0]['label'])
    return bool(name and sum(_arm_name(a['label'])==name for a in record['arms'])==1
                and any(_arm_name(h)==name for h in header))


def _compatible_percentage(n, d, literal):
    if d <= 0 or not 0 <= n <= d:
        return False
    precision = len(literal.partition('.')[2])
    return abs(100*n/d-float(literal)) <= .5*10**(-precision)+1e-9


def _binary(table, record, row, pop, field, proposed):
    caption, headers, body, heading = table
    endpoint = row.get('endpoint')
    if (endpoint not in _ENDPOINTS or pop.get('scope')!='overall' or pop.get('melanoma_only')!='yes'
            or not all(contract._missing(row.get(k)) for k in ('cutoff','assessment_time'))
            or _COMPLEX.search(str(row.get('endpoint_definition',''))+' '+caption)):
        return
    # A second population in the same publication may have its own table.
    # Require the printed arm N to match the recorded binary denominator.
    d = row.get('denominator')
    if not q._integer(d) or d <= 0:
        return
    rows = [(cells,raw) for cells,raw in body if cells and _key(cells[0]) in _ENDPOINTS[endpoint]]
    if len(rows)!=1 or len(rows[0][0])!=len(headers):
        return
    for cells, raw in rows:
        for i in range(1,len(headers)):
            header = headers[i]
            if not _arm_column(record,row,header):
                continue
            denominators = {int(n) for h in header for n in _N.findall(h)}
            if denominators!={d}:
                continue
            pair = _PAIR.fullmatch(cells[i])
            if pair:
                if not any(_PAIR_HEADER.search(h) for h in [*header, cells[0]]):
                    continue
                n, percentage = int(pair[1]),pair[2]
            else:
                # In separate count and percentage columns both must sit under
                # this exact treatment header and appear in the same source row.
                siblings = [j for j in range(1,len(headers)) if _arm_column(record,row,headers[j])]
                counts = [j for j in siblings if _COUNT.fullmatch(headers[j][-1])]
                pcts = [j for j in siblings if headers[j][-1]=='%']
                if len(counts)!=1 or len(pcts)!=1 or i!=counts[0]:
                    continue
                n_str = cells[counts[0]]
                percentage = cells[pcts[0]].removesuffix('%').strip()
                if not n_str.isdigit() or not re.fullmatch(_NUMBER,percentage):
                    continue
                n = int(n_str)
            if not _compatible_percentage(n,d,percentage):
                continue
            if ((q._integer(row.get('numerator')) and row['numerator']!=n) or
                 (q._num(row.get('percentage')) and row['percentage']!=float(percentage))):
                continue
            value = n if field=='numerator' else float(percentage)
            if proposed==value:
                yield (heading,raw)


def _subgroup_n(table,record,row,pop,value):
    """A model table can explicitly enumerate the patients in each stated subgroup."""
    caption, headers, body, heading = table
    if (pop.get('scope')!='subgroup' or pop.get('melanoma_only')!='yes' or
            row.get('count_purpose')!='outcome_analysis' or row.get('method') not in ('NA','reported') or
            row.get('component_ids') or not contract._missing(row.get('cutoff')) or
            not re.search(r'\bmelanoma\b',caption,re.I)):
        return
    arm = next((a for a in record['arms'] if a['id']==row.get('arm_id')),None)
    related = [s for s in record['survival'] if s['id']==row.get('result_id')
               and s['population_id']==pop['id'] and s['arm_id']==row['arm_id']]
    if (not arm or len(record['arms'])!=1 or not arm['label'] or
            _key(arm['label']) not in _key(caption) or len(related)!=1 or
            related[0]['endpoint'] not in ('PFS','OS') or
            not re.search(r'\b'+related[0]['endpoint']+r'\b',caption,re.I)):
        return
    count_columns = [i for i,col in enumerate(headers) if i>0 and len(col)==1 and _COUNT.fullmatch(col[0])]
    if len(count_columns)!=1:
        return
    col = count_columns[0]
    # All informative subgroup terms (including high/low, biomarkers and
    # qualifiers) must be represented by the same row label and its section.
    ignore = {'melanoma','patients','subgroup','group','survival','analysis','the','in','with','of'}
    pop_terms = set(_key(pop['label']).split())-ignore
    section_label, section_raw = '', ''
    for cells,raw in body:
        if cells and all(not c or c==cells[0] for c in cells):
            section_label,section_raw=cells[0],raw
            continue
        if col>=len(cells) or not cells[col].isdigit() or int(cells[col])!=value:
            continue
        defined = set(_key(section_label+' '+cells[0]).split())-ignore
        if len(pop_terms)>=2 and pop_terms==defined:
            yield (heading,section_raw,raw)


def corroborate(finding, target, ctx):
    """Return one source-backed field amendment, or None on any ambiguous match."""
    loc = finding.get('target') or {}
    if (target.get('record_id')!=loc.get('record_id') or target['stage']!=loc.get('stage')
            or target['source_sha256']!=loc.get('source_sha256') or finding.get('scope_relation')!='same'
            or finding.get('action') not in ('addition','correction','unresolved')
            or resolver._UNCERTAIN.search(finding.get('reason',''))):
        return None
    path=loc.get('field_path','')
    match=re.fullmatch(r'/(binary|sample_sizes)/\d+/(numerator|percentage|n)',path)
    if not match or loc.get('section')!=match[1]:
        return None
    section,field=match.groups()
    if (section=='sample_sizes')!=(field=='n'):
        return None
    record=target['record']
    row=resolver._scope_row(record,loc,path.split('/')[1:])
    if not row or not contract._missing(row.get(field)) or row.get('origin','own_report')!='own_report':
        return None
    try:
        expected=contract._load_json(finding['expected_value_json'])
        value=contract._load_json(finding['value_json'])
    except (KeyError,TypeError,ValueError):
        return None
    if (row.get(field)!=expected or not q._num(value) or not math.isfinite(value) or
            (field in ('n','numerator') and not q._integer(value))):
        return None
    pop=next((p for p in record.get('populations',[]) if p['id']==row.get('population_id')),None)
    proof=ctx._proof(finding,target['record_id'])
    if not proof or not pop:
        return None
    hits=[]
    for sid in set(row.get('evidence',[])) & {p['span_id'] for p in proof}:
        span=ctx.spans[sid]
        if span['document_role']!='main_article_table':
            continue
        table=_table(span['text'])
        if not table:
            continue
        candidates=(_binary(table,record,row,pop,field,value) if section=='binary'
                    else _subgroup_n(table,record,row,pop,value))
        for evidence in candidates:
            hits.append((sid,evidence))
    if len(hits)!=1:
        return None
    sid,evidence=hits[0]
    verified=[*proof]
    for quote in evidence:
        item={'span_id':sid,'quote':quote}
        if quote and item not in verified:
            verified.append(item)
    return resolver._edit(path,expected,value,verified,
        'The original table identifies the analysis population, the treatment and the numerical role of this cell.')
