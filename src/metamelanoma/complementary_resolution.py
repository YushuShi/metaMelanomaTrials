"""Conservative, offline adjudication of a complementary finding against its own source.

Return an auditable proposed edit to the frozen target, a verbatim study detail,
or a confirmation. Unresolved findings return None. The publication caller
checks the before-value again and reconciles overlapping changes.
"""
import json
import re
from decimal import Decimal
from copy import deepcopy

from . import complementary_contract as contract
from . import quantitative as q, normalization
from .complementary_amendments import _get, _parts


_NUMBER = r'(?:\d+(?:\.\d+)?|\.\d+)'
_INTERVAL = re.compile(
    rf'(?P<level>\d+(?:\.\d+)?)\s*%\s*(?:CI\b|confidence interval\b)'
    rf'[\s,;:=(\[]*(?P<lower>{_NUMBER})(?P<pct1>\s*%)?\s*(?:[-–—−]|to)\s*'
    rf'(?P<upper>{_NUMBER})(?P<pct2>\s*%)?', re.I)
_BOUNDED = re.compile(rf'(?P<op>[<>≤≥]|<=|>=)\s*(?P<n>{_NUMBER})', re.I)
_PATIENT_FRACTION = re.compile(r'(?<![.\d])(\d+)\s*(?:/|\bof\b)\s*(\d+)(?![.\d])', re.I)
_FRACTION_ENDPOINT = {
    'ORR': r'objective responses?|respond(?:ed|ers?)|response rate',
    'pCR': r'pathologi[ck](?:al)? complete respons',
    'CR': r'complete respons|complete remission',
    'PR': r'partial respons|partial remission',
    'DCR': r'disease control',
}
_GENERIC_WORDS = set('a an and as at baseline by cohort control description disease for from group in '
                     'including melanoma of on only or outcome overall participants patient patients '
                     'people population reported study subgroup the to treatment treated with without'.split())
_DESCRIPTION = re.compile(
    r'\b(eligib\w*|inclusion|excluded|enrol\w*|patients?|participants?|cohorts?|'
    r'subgroups?|randomi[sz]\w*|stratif\w*|phase|retrospective|prospective|open.label|double.blind)\b', re.I)
_UNCERTAIN = re.compile(
    r'\b(contradict\w*|conflict\w*|inconsisten\w*|discrepan\w*|ambiguous|'
    r'uncertain|cannot (?:identify|determine|distinguish|reconcile)|appears to|may refer)\b', re.I)


def _verbatim(quote, span):
    if quote in span:
        return quote
    # Only typography that cannot swap a sign, inequality, number or word.
    tokens = re.split(r'(\s+|[–—-]|[\u2018\u2019\x27])', quote)
    pattern = ''.join(r'\s+' if x.isspace() else r'[-–—]' if x in ('-', '–', '—')
                      else "['’‘]" if x in ("'", '’', '‘') else re.escape(x) for x in tokens)
    match = re.search(pattern, span)
    return match[0] if match else None


def _exact_fields(proposed, actual):
    """Allow a confirmation to identify existing clinical values within an annotated row."""
    if isinstance(proposed, dict):
        return bool(proposed) and isinstance(actual, dict) and all(
            k in actual and _exact_fields(v, actual[k]) for k, v in proposed.items())
    if isinstance(proposed, list):
        return isinstance(actual, list) and len(actual) == len(proposed) and all(
            _exact_fields(x, y) for x, y in zip(proposed, actual))
    if isinstance(proposed, bool) or isinstance(actual, bool):
        return type(proposed) is type(actual) and proposed == actual
    return proposed == actual


def _tokens(text):
    return set(re.findall(r'[a-z0-9]+', text.casefold()))


def _compact_note(passages, anchors=(), values=()):
    """Keep at most two short clinical statements, prioritizing the finding's own terms."""
    words = set(anchors) - _GENERIC_WORDS
    ranked = []
    for passage in passages:
        for text in re.split(r'(?<=[.!?;])\s+(?=[A-Z0-9])', passage):
            text = ' '.join(text.split())
            if len(text) < 8 or len(text) > 520 or re.search(r'<[a-z/][^>]+>|\b(?:PCR primers?|western blot|RNA extraction)\b', text, re.I):
                continue
            literals = {float(n) for n in normalization.literal_values(text)} if values else set()
            if 0 in values and re.search(r'\b(?:no|none|zero)\b', text, re.I):
                literals.add(0)
            numeric_matches = len(literals.intersection(values))
            if values and not numeric_matches:
                continue
            ranked.append((numeric_matches * 20 + len(words & _tokens(text)), text))
    ranked.sort(key=lambda x:-x[0])
    retained = list(dict.fromkeys(text for _, text in ranked))
    return ' '.join(retained[:1] if retained and len(retained[0]) > 300 else retained[:2])


def _result(status, reason, proof, *, edits=(), note=''):
    return {'status': status, 'reason': reason, 'evidence': deepcopy(proof),
            'edits': list(edits), 'note': note}


def _edit(path, actual, value, proof, reason):
    return _result('amended', reason, proof, edits=[
        {'field_path': path, 'before': deepcopy(actual), 'after': deepcopy(value)}])


def _scope_row(record, location, parts):
    section = location['section']
    if not parts or parts[0] != section:
        return None
    if section not in contract.ARRAY_SECTIONS:
        return record.get(section, {}) if location['row_id'] == section else None
    if len(parts) < 2 or not parts[1].isdigit():
        return None
    rows = record.get(section, [])
    index = int(parts[1])
    if index >= len(rows) or rows[index].get('id') != location['row_id']:
        return None
    return rows[index]


def _interval_match(row, field, value, text, binary):
    """Both bounds or one bound and an independently matched estimate protect row identity."""
    if field not in ('ci_lower', 'ci_upper') or not isinstance(value, (int, float)):
        return False
    pairs = list(_INTERVAL.finditer(text))
    if len(pairs) != 1:
        return False
    match = pairs[0]
    if row.get('ci_level') != float(match['level']):
        return False
    lower, upper = float(match['lower']), float(match['upper'])
    if lower > upper or value != (lower if field == 'ci_lower' else upper):
        return False
    if binary and not (match['pct1'] or match['pct2'] or
                       re.search(rf'{_NUMBER}\s*%\s*[,;:(\[]*\s*$', text[:match.start()])):
        return False
    return row.get('ci_upper' if field == 'ci_lower' else 'ci_lower') == (upper if field == 'ci_lower' else lower)


_PERCENT_WITH_PROPORTION_CI = re.compile(
    rf'(?P<point>{_NUMBER})\s*%\s*[(\[]\s*(?P<level>{_NUMBER})\s*%\s*'
    rf'(?:CI\b|confidence interval\b)\s*[,;:=]?\s*(?P<lower>{_NUMBER})\s*'
    rf'(?:,|[-–—−]|to)\s*(?P<upper>{_NUMBER})\s*[)\]]', re.I)


def _scale_probability_interval(section, row, path, field, actual, proposed, proof):
    if (field not in ('ci_lower','ci_upper') or not q._num(actual) or not q._num(proposed)
            or section not in ('binary','survival') or
            section=='survival' and (row.get('unit')!='percent' or row.get('kind')!='survival_probability')):
        return None
    point = row.get('percentage' if section=='binary' else 'estimate')
    if not q._num(point):
        return None
    matches = {m.groups() for p in proof for m in _PERCENT_WITH_PROPORTION_CI.finditer(p['quote'])}
    if len(matches) != 1:
        return None
    estimate,level,lower,upper = map(Decimal,matches.pop())
    pct_bounds = {'ci_lower':float(lower*100),'ci_upper':float(upper*100)}
    if (not 0<=lower<upper<=1 or estimate!=Decimal(str(point)) or not q._num(row.get('ci_level'))
            or level!=Decimal(str(row['ci_level']))
            or not lower*100<=estimate<=upper*100 or lower<=estimate<=upper
            or not all(q._num(row.get(k)) and row[k] in (v,pct_bounds[k]) for k,v in
                       (('ci_lower',float(lower)),('ci_upper',float(upper))))
            or proposed!=pct_bounds[field]):
        return None
    base = path.rsplit('/',1)[0]
    edits = [{'field_path':base+'/'+k,'before':row[k],'after':v} for k,v in pct_bounds.items() if row[k]!=v]
    if edits:
        return _result('amended','The reported probability interval was converted to the row’s percentage scale using both published bounds, confidence level and point estimate.',
                       proof,edits=edits)
    return None


def _responder_denominator(record, row, path, actual, proof):
    if (row.get('endpoint')!='DOR' or not contract._missing(row.get('analysis_n'))
            or not isinstance(actual,dict) or actual.get('status')!='fallback' or
            actual.get('count_purpose') not in ('enrolled','treated','ITT','eligible','randomized') or
            not q._integer(actual.get('n')) or not actual.get('count_ids')):
        return None
    text=' '.join(p['quote'] for p in proof)
    if not re.search(r'duration of (?:confirmed )?response|response duration|\bDOR\b',text,re.I):
        return None
    # The same original cohort supplies positive evidence that its response set
    # is smaller. Do not estimate the responder-analysis N by summing CR and PR.
    partial = any(b.get('endpoint')=='ORR' and b.get('arm_id')==row.get('arm_id') and
                  b.get('population_id')==row.get('population_id') and b.get('denominator')==actual['n']
                  and (q._integer(b.get('numerator')) and b['numerator']<actual['n'] or
                       q._num(b.get('percentage')) and b['percentage']<100) for b in record.get('binary',[]))
    if not partial or not re.search(r'\bresponders?|\bCR (?:and|or) PRs?\b|'
                                    r'complete (?:and|or) partial respons',text,re.I):
        return None
    return _edit(path+'/n',actual['n'],q.NA,proof,
                 'Duration of response was measured among responders. The displayed fallback counts the larger treated or enrolled cohort, and the responder-analysis denominator is unavailable.')


def _fraction_match(row, field, value, text):
    if field not in ('numerator', 'denominator') or type(value) is not int:
        return False
    endpoint = _FRACTION_ENDPOINT.get(row.get('endpoint'))
    if not endpoint or not re.search(endpoint, text, re.I):
        return False
    pairs = {(int(a), int(b)) for a, b in _PATIENT_FRACTION.findall(text)}
    if len(pairs) != 1:
        return False
    n, d = pairs.pop()
    if not 0 <= n <= d or d == 0:
        return False
    return ((value, row.get('denominator')) == (n, d) if field == 'numerator'
            else (row.get('numerator'), value) == (n, d))


def _overall_single_arm(record, row):
    population = next((p for p in record['populations'] if p['id'] == row.get('population_id')), {})
    return (len(record['arms']) == 1 and population.get('scope') == 'overall' and
            row.get('arm_id') in (record['arms'][0]['id'], q.NA))


def _unique_numerator(row, proposed, text):
    if (type(proposed) is not int or not q._integer(row.get('denominator'))
            or not q._num(row.get('percentage'))):
        return False
    endpoint = _FRACTION_ENDPOINT.get(row.get('endpoint'))
    if not endpoint or not re.search(endpoint,text,re.I):
        return False
    percentages = re.findall(r'(?<![\d.])(\d+(?:\.\d+)?)\s*(?:%|percent\b)',text,re.I)
    if not percentages:
        # A literal "no response"/"no patients with response" plus an already
        # recorded zero percent and independently known N resolves verbal zero.
        if (row['percentage'] != 0 or proposed != 0 or row['endpoint'] != 'ORR'
                or not re.search(r'\bno (?:patients? (?:with (?:an? )?(?:objective )?response|responded)|'
                                 r'objective responses? (?:were )?(?:seen|observed))\b',text,re.I)):
            return False
        return q.unique_rounded_count(0, row['denominator'], decimals=0) == 0
    matching = {len(n.partition('.')[2]) for n in percentages if float(n) == row['percentage']}
    return len(matching) == 1 and q.unique_rounded_count(
        row['percentage'],row['denominator'],decimals=matching.pop()) == proposed


def _explicit_n(record, row, value, text):
    """An explicit whole-cohort participant count with a matching count purpose."""
    pop = next((p for p in record.get('populations', []) if p['id'] == row.get('population_id')), {})
    if (type(value) is not int or value <= 0 or pop.get('scope') != 'overall'
            or pop.get('melanoma_only') != 'yes' or row.get('result_id') != q.NA
            or row.get('method') not in (q.NA, 'reported') or row.get('component_ids')
            or (row.get('arm_id') != q.NA and not _overall_single_arm(record, row))
            or not contract._missing(row.get('cutoff'))):
        return False
    role = {'enrolled':r'enrol{1,2}ed|accrued','randomized':r'randomi[sz]ed','treated':r'treated',
            'response_evaluable':r'(?:evaluable|assessable) for response'}.get(row.get('count_purpose'))
    if not role or _CITED.search(text):
        return False
    # A restrictive clause between "patients" and the verb, or a group/subset
    # following it, cannot establish a count for the full population.
    pattern = (rf'^(?:a total of |in total,? |overall,? )?(\d+) (?:melanoma )?(?:patients|participants) '
               rf'(?:were|had been) (?:{role})(?: in (?:this|the) (?:study|trial))?[.!]?$')
    matches = [m for statement in re.split(r'(?<=[.!?])\s+',text.strip())
               if (m := re.fullmatch(pattern, statement.strip(), re.I))]
    return len(matches) == 1 and int(matches[0][1]) == value


def _explicit_severe_zero(record, row, field, value, text):
    """A negative *all severe adverse events* statement, never an imputed count."""
    if (field != 'numerator' or type(value) is not int or value != 0 or not _overall_single_arm(record,row)
            or row.get('safety_attribution') != 'all_cause' or not contract._missing(row.get('assessment_time'))
            or row.get('endpoint') not in ('AE_grade_3_4','AE_grade_ge3') or _CITED.search(text)):
        return False
    threshold = (r'3\s*(?:or|and|[-–/])\s*4' if row['endpoint'] == 'AE_grade_3_4'
                 else r'(?:3 or (?:higher|greater)|(?:≥|>=)\s*3)')
    pattern = rf'(?:no|zero) grade\s*{threshold} (?:adverse events|toxicities) (?:were (?:observed|reported)(?: in any patient)?|occurred)[.!]?'
    return any(re.fullmatch(pattern, t.strip(), re.I) for t in re.split(r'(?<=[.!?])\s+', text))


def _bounded_value(proposed):
    if not isinstance(proposed, str):
        return None
    match = _BOUNDED.fullmatch(proposed.strip())
    if match is None:
        return None
    return match['op'], float(match['n'])


_ENDPOINT = {
    'OS': r'overall survival|\bOS\b|mortality', 'PFS': r'progression.free survival|\bPFS\b',
    'EFS': r'event.free survival|\bEFS\b', 'DSS': r'disease.specific survival|\bDSS\b',
    'DOR': r'duration of response|\bDOR\b',
    'RFS': r'recurrence.free survival|relapse.free survival|\bRFS\b',
    'DFS': r'disease.free survival|\bDFS\b', 'DMFS': r'distant.metastasis.free survival|\bDMFS\b',
    'ORR': r'objective response|overall response|response rate|\bORR\b|respond(?:er|ed)',
    'CR': r'complete (?:response|remission)|\bCR\b', 'PR': r'partial (?:response|remission)|\bPR\b',
    'DCR': r'disease control|\bDCR\b', 'pCR': r'pathologic(?:al)? complete response|\bpCR\b',
}
_PATIENTS = re.compile(r'\b(?:patients?|participants?|subjects?|cohort|randomi[sz]ed|enroll?ed|accrued)\b', re.I)
_CITED = re.compile(r'\b(?:previous studies|published studies|previously reported by|in other studies|'
                    r'(?:literature|historical) (?:reports?|data)|(?:et al\.?|other authors) (?:have )?'
                    r'(?:reported|described|found)|(?:in |as )?(?:a|the) (?:prior|previous) (?:study|trial))\b', re.I)
_SCOPE_KEYS = {
    'effects': ('population_id','endpoint','measure','intervention_arm_id','reference_arm_id','model','adjusted','cutoff'),
    'survival': ('population_id','endpoint','kind','arm_id','time','time_unit','unit','cutoff'),
    'binary': ('population_id','endpoint','arm_id','assessment_time','time_unit','cutoff','safety_attribution'),
    'sample_sizes': ('population_id','arm_id','result_id','count_purpose','cutoff'),
}
_VALUES = {'effects': ('estimate','ci_lower','ci_upper','ci_level','analysis_n'),
           'survival': ('estimate','ci_lower','ci_upper','ci_level','analysis_n'),
           'binary': ('percentage','numerator','denominator','ci_lower','ci_upper','ci_level'),
           'sample_sizes': ('n',)}


def _possible_collision(section, addition, existing):
    """An unspecified scope cannot establish that two different outcomes are independent."""
    for row in existing:
        if any(not contract._missing(row.get(key)) and not contract._missing(addition.get(key))
               and row[key] != addition[key] for key in _SCOPE_KEYS[section]):
            continue
        if any(not contract._missing(row.get(key)) and not contract._missing(addition.get(key))
               and row[key] != addition[key] for key in _VALUES[section]):
            return True
    return False


def _main_values(section, proposed):
    if q._num(proposed):
        return {proposed}
    if isinstance(proposed, dict) and section in _VALUES:
        # The primary reported quantities take precedence over CI bounds and
        # generic numbers (e.g. 95 for a confidence level, 1 for a time point).
        return {proposed[k] for k in ('estimate','percentage','numerator','denominator','n')
                if q._num(proposed.get(k))}
    return set()


def _source_addition(target, finding, proposed, expected, proof):
    """Preserve a new, attributable observation verbatim outside the pooling data.

    Do not endorse Claude's numerical assignment on the strength of a literal alone.
    A note saves what the original report actually says. Missing relational links
    or multiple plausible population assignments bar a structured numerical edit.
    """
    if finding.get('action') != 'addition' or finding.get('scope_relation') not in ('same', 'new_scope'):
        return None
    loc = finding['target']
    section, path = loc['section'], loc['field_path']
    try:
        actual, node, exists, append_row = contract._field(target, finding)
        if exists and not contract._missing(actual) or expected != (actual if exists else None):
            return None
        value = contract._normalize(proposed, node, path)
        q._shape(value, node)
        if value is None or contract._missing(value):
            return None
        record = target['record']
        if append_row:
            if (not isinstance(value, dict) or value.get('id') != loc['row_id'] or
                    any(r['id'] == loc['row_id'] for r in record.get(section, []))):
                return None
            row = value
        else:
            row = _scope_row(record, loc, _parts(path))
            if not isinstance(row, dict):
                return None
        contract._numeric_proof(value, node, proof, row, path)
    except (AttributeError, IndexError, KeyError, ValueError, TypeError):
        return None

    text = ' '.join(p['quote'] for p in proof)
    if _CITED.search(text):
        return None
    if section in _SCOPE_KEYS:
        if (row.get('origin', 'own_report') != 'own_report' or
                append_row and _possible_collision(section, row, record.get(section, []))):
            return None
        pop = next((p for p in record.get('populations', []) if p['id'] == row.get('population_id')), {})
        if pop.get('melanoma_only') == 'no':
            return None
        if section != 'sample_sizes':
            endpoint = _ENDPOINT.get(row.get('endpoint'))
            if str(row.get('endpoint','')).startswith('AE_'):
                endpoint = r'adverse (?:event|reaction)|toxic|(?:immune.related|treatment.related)|side effects?'
            if not endpoint or not re.search(endpoint, text, re.I):
                return None
        elif not _PATIENTS.search(text):
            return None
        if not append_row and not set(row.get('evidence', [])) & {p['span_id'] for p in proof}:
            return None
    elif section == 'study_details':
        if '/adjustments/' not in path or not re.search(
                r'\badjust(?:ed|ing|ment)|\bcontrol(?:led|ling) for|multivari(?:ate|able)|covariates?',text,re.I):
            return None
        if isinstance(value, dict) and any(not (_tokens(c) - _GENERIC_WORDS) & _tokens(text)
                                            for c in value.get('covariates', [])):
            return None
    elif section == 'arms':
        label = (row.get('label','') if append_row else value if isinstance(value,str) else '')
        if not ((_tokens(label) - _GENERIC_WORDS) & _tokens(text)):
            return None
    elif section == 'study' and isinstance(value, str):
        # A trial name, DOI, or registry string mentioned in discussion could
        # describe a different report. Require self-identifying source wording.
        if path == '/study/name':
            if not (value.casefold() in text.casefold() and re.search(
                    r'\b(?:this|the|our) (?:randomi[sz]ed )?(?:phase [1-4iv]+ )?(?:study|trial)\b|'
                    r'\bwe (?:report|present|conducted)\b',text,re.I)):
                return None
        elif path == '/study/doi':
            if not (value.casefold() in text.casefold() and re.fullmatch(
                    r'\s*(?:doi\s*[:=]?\s*|https?://(?:dx\.)?doi\.org/)?'+re.escape(value)+r'\s*',
                    text,re.I)):
                return None
        elif path.split('/')[-1] not in ('previous_systemic','braf','setting','melanoma_subtype') or not _PATIENTS.search(text):
            return None
    else:
        return None
    note = _compact_note((p['quote'] for p in proof), _tokens(str(proposed)), _main_values(section, proposed))
    if note:
        return _result('supplement', 'Additional observation preserved in the wording of the original report.',
                       proof, note=note)
    return None


_CLINICAL = re.compile(
    r'\b(?:survival|patients?|participants?|subjects?|melanoma|immunotherapy|(?:overall|progression.free|disease.free|'
    r'recurrence.free|relapse.free|event.free) survival|response(?:s| rates?)?|adverse events?|toxicities|'
    r'dose.limiting|hazard ratio|odds ratio|relative risk|follow.up|regression|multivari\w+)\b', re.I)
_ASSERTION = re.compile(r'\b(?:was|were|had|showed|included|achieved|received|underwent|developed|experienced|'
                        r'observed|enrolled|enroled|enrollment|enrolment|treated|eligible|associated|reported|'
                        r'occurred|responded|evaluated|assessed|stratified|demonstrated|randomi[sz]ed|adjusted|'
                        r'consisted|confirmed|identified|ranged|increased|decreased|remained)\b', re.I)
_OUTSIDE = re.compile(r'\b(?:mice|mouse model|cell lines?|animals|in vitro|in silico|murine|'
                      r'primers?|xenografts?|supplementary methods|will be|will enroll|'
                      r'planned to|other studies|renal.cell|non.small.cell lung|NSCLC)\b', re.I)
_BOILERPLATE = re.compile(r'^\s*(?:table\s*\d+|fig(?:ure)?\.?\s*\d+)\s*[.:]|\b(?:xmlns|colspan|rowspan)\b', re.I)


def _additional_passage(target, finding, proposed, expected, proof):
    """Save a self-contained clinical statement as a report note, without adopting a proposed allocation."""
    loc = finding['target']
    path, section = loc['field_path'],loc['section']
    if (finding.get('action') not in ('addition','correction') or
            finding.get('scope_relation') not in ('same','new_scope') or
            section not in (_SCOPE_KEYS.keys() | {'study','study_details','arms','populations'})):
        return None
    record = target['record']
    parts = _parts(path)
    if not parts or parts[0] != section:
        return None
    try:
        actual = _get(record,path)
    except (IndexError,KeyError,TypeError,ValueError):
        actual = None
    # Keep this route exclusive to additional information. A real replacement,
    # even with a plausible quote, needs its own field-level source check.
    if not contract._missing(expected) or not contract._missing(actual):
        return None
    if section in contract.ARRAY_SECTIONS:
        if len(parts) < 2:
            return None
        if parts[1] == '-':
            if len(parts) != 2 or any(r['id']==loc['row_id'] for r in record.get(section,[])):
                return None
            if isinstance(proposed,dict):
                if proposed.get('id') not in (None,loc['row_id']):
                    return None
                if section in _SCOPE_KEYS and _possible_collision(section,proposed,record.get(section,[])):
                    return None
                if proposed.get('melanoma_only') == 'no' or proposed.get('origin') in ('cited_report','planned'):
                    return None
        elif not isinstance(_scope_row(record,loc,parts),dict):
            return None
    elif loc['row_id'] != section:
        return None
    current_row = (proposed if len(parts) == 2 and parts[1] == '-' else _scope_row(record, loc, parts)) or {}
    if isinstance(current_row, dict) and section in ('survival', 'effects', 'binary'):
        own_endpoint = current_row.get('endpoint')
        label = _ENDPOINT.get(own_endpoint)
        quotes = ' '.join(e['quote'] for e in proof)
        if label and not re.search(label, quotes, re.I) and any(
                re.search(v, quotes, re.I) for k,v in _ENDPOINT.items() if k != own_endpoint):
            return None
    # Never turn a conflicting attribution or a non-melanoma subgroup into a study note.
    if _OUTSIDE.search(finding['reason']) or _CITED.search(finding['reason']):
        return None
    phrases = []
    for e in proof:
        if _CITED.search(e['quote']) or _OUTSIDE.search(e['quote']):
            continue
        for sentence in re.split(r'(?<=[.!?;])\s+(?=[A-Z0-9])', e['quote']):
            sentence = ' '.join(sentence.split())
            if not 24 <= len(sentence) <= 500 or _BOILERPLATE.search(sentence):
                continue
            if not _CLINICAL.search(sentence) or not _ASSERTION.search(sentence):
                continue
            # Reject compressed multi-column tables and isolated headings.
            if len(re.findall(r'\b\d+(?:\.\d+)?\b',sentence)) > len(re.findall(r'\b[a-zA-Z]{3,}\b',sentence)):
                continue
            phrases.append(sentence)
    if not phrases:
        return None
    topics = _tokens(str(proposed)) | _tokens(finding.get('reason',''))
    note = _compact_note(phrases, topics, _main_values(section, proposed))
    if note:
        return _result('supplement','The report supplies additional clinical information. Its original wording is saved as a study note.',
                       proof,note=note)
    return None


def _saved_addition(target, finding, proposed, expected, proof):
    result = _source_addition(target,finding,proposed,expected,proof)
    return result or _additional_passage(target,finding,proposed,expected,proof)


class ResolutionContext:
    def __init__(self, packet):
        self.source, self.targets, self.spans = contract._packet(packet)
        self.target_spans = {}
        for rid, target in self.targets.items():
            documented = set().union(*(set(d['span_ids']) for d in packet.get('source_documents', [])
                                       if d['stage'] == target['stage'] and
                                       d['source_sha256'] == target['source_sha256']))
            self.target_spans[rid] = {sid for sid in target['source_span_ids'] if sid in documented
                and sid in self.spans and self.spans[sid]['is_target'] and not self.spans[sid]['planned_only']
                and self.spans[sid]['document_role'] not in contract.BLOCKED_ROLES}

    def _proof(self, finding, rid):
        result = []
        for item in finding.get('evidence', []):
            sid, quote = item.get('span_id'), item.get('quote')
            if not isinstance(quote, str) or not quote.strip():
                return None
            if sid not in self.target_spans[rid]:
                # Repair a missing locator only when the sufficiently long verbatim
                # passage occurs in exactly one eligible span of this target.
                if sid in self.spans or len(quote.strip()) < 25:
                    return None
                matching = [s for s in self.target_spans[rid] if quote in self.spans[s]['text']]
                if len(matching) != 1:
                    return None
                sid = matching[0]
            literal = _verbatim(quote, self.spans[sid]['text'])
            if not literal:
                return None
            repaired = {'span_id': sid, 'quote': literal}
            if repaired not in result:
                result.append(repaired)
        return result or None

    def _population_evidence(self, proposed, proof):
        """Restore nearby scope wording omitted from a short numerical excerpt."""
        label = proposed.get('label','')
        terms = _tokens(label) - _GENERIC_WORDS
        core = _tokens(re.split(r'[;(:]',label,maxsplit=1)[0]) - _GENERIC_WORDS
        thresholds = re.findall(r'\b(\d+(?:\.\d+)?)\s*%',label)
        if not terms:
            return proof
        # A group already named in the cited excerpt needs no extra sentence.
        # Prefer the authors' original cohort count over a nearby subset response.
        direct = proof[0]['quote']
        def forms(text):
            return {('mutant' if word.startswith('mutat') else word) for word in _tokens(text)}
        if (not thresholds and core and core <= forms(direct) and re.search(r'\bpatients?|\bORR|\bmelanoma',direct,re.I)):
            return proof
        ranked = []
        for item in proof:
            span = self.spans[item['span_id']]['text']
            start = span.find(item['quote'])
            if start < 0 or span.find(item['quote'],start+1) >= 0:
                continue
            # Keep the short excerpt's context in its original paragraph, with
            # offsets restricted to complete source sentences.
            left = max(0,start-700)
            right = min(len(span),start+len(item['quote'])+380)
            for m in re.finditer(r'[^.!?\n]+(?:[.!?](?=\s|$)|$)',span):
                if m.start()<left or m.end()>right or not 16<=len(m[0])<=440:
                    continue
                excerpt=m[0].strip()
                excerpt_terms = _tokens(excerpt)
                score = len(terms & excerpt_terms)
                if score>=2 and not _CITED.search(excerpt) and not _OUTSIDE.search(excerpt):
                    scope_score = 4 * len(core & excerpt_terms)
                    if any(re.search(r'(?<![\d.])'+re.escape(n)+r'\s*%',excerpt) for n in thresholds):
                        scope_score += 20
                    ranked.append((scope_score+score,-abs(m.end()-start),{'span_id':item['span_id'],'quote':excerpt}))
        ranked.sort(key=lambda x:x[:2],reverse=True)
        if ranked and ranked[0][2] not in proof:
            return [ranked[0][2],*proof]
        return proof

    def resolve(self, finding, validation_issue=''):
        loc = finding.get('target') or {}
        if not all(isinstance(loc.get(k), str) for k in ('section', 'row_id', 'record_id', 'field_path')):
            return None
        rid, path = loc.get('record_id'), loc.get('field_path')
        target = self.targets.get(rid)
        if not target or not isinstance(path, str) or any(loc.get(k) != target[k] for k in ('stage', 'source_sha256')):
            return None
        proof = self._proof(finding, rid)
        if not proof:
            return None
        record = target['record']
        try:
            expected = contract._load_json(finding['expected_value_json'])
            proposed = contract._load_json(finding['value_json'])
            parts = _parts(path)
        except (TypeError, ValueError, KeyError):
            return None
        section, field = loc['section'], parts[-1]
        action = finding.get('action')
        if _UNCERTAIN.search(finding.get('reason', '')):
            return None
        if path == '/populations/-' and isinstance(proposed,dict):
            proof = self._population_evidence(proposed,proof)
        # New subgroups are annotations, never automatically independent cohorts.
        if (path == '/populations/-' and action == 'addition' and expected is None
                and finding.get('scope_relation') == 'new_scope' and isinstance(proposed, dict)
                and proposed.get('id') == loc['row_id'] and proposed.get('melanoma_only') == 'yes'
                and proposed.get('scope') in ('subgroup',q.NA) and not any(p['id'] == loc['row_id']
                    for p in record.get('populations', []))):
            parent = next((p for p in record.get('populations', [])
                           if p['id'] == proposed.get('parent_id')), None)
            verified_parent = parent and parent.get('melanoma_only') == 'yes'
            known_melanoma = record.get('populations') and all(
                p.get('melanoma_only') == 'yes' for p in record['populations'])
            if verified_parent or known_melanoma or re.search(r'\bmelanoma\b',' '.join(p['quote'] for p in proof),re.I):
                label_words = _tokens(str(proposed.get('label', ''))) - _GENERIC_WORDS
                quotes = [p['quote'] for p in proof if len(label_words & _tokens(p['quote'])) >= 2]
                # The verified scope sentence (if one was recovered) comes
                # first, so that e.g. 1% and 5% PD-L1 groups remain identifiable.
                scope = proof[0]['quote']
                note = _compact_note([scope] if scope in quotes else quotes, label_words)
                if note:
                    return _result('supplement', 'Additional population information verified in the original melanoma report.',
                                   proof, note=note)
        row = _scope_row(record, loc, parts)
        if not isinstance(row, dict):
            return _saved_addition(target, finding, proposed, expected, proof)
        try:
            actual = _get(record, path)
        except (KeyError, IndexError, TypeError, ValueError):
            actual = None
        overlap = bool(set(row.get('evidence', [])) & {p['span_id'] for p in proof})
        text = ' '.join(p['quote'] for p in proof)
        if actual == expected and overlap and finding.get('scope_relation') == 'same':
            if field == 'display_n' and section == 'survival' and action in ('unresolved','correction'):
                scoped = _responder_denominator(record, row, path, actual, proof)
                if scoped:
                    return scoped
            if action == 'correction':
                rescaled = _scale_probability_interval(section,row,path,field,actual,proposed,proof)
                if rescaled:
                    return rescaled
        # Some reviews propose an entire replacement even though only one or two
        # clinical fields change. Resolve every changed leaf before saving any.
        if (action in ('addition', 'correction') and finding['scope_relation'] == 'same'
                and isinstance(proposed, dict) and isinstance(actual,dict) and overlap
                and loc['section'] in contract.ARRAY_SECTIONS and len(parts)==2
                and proposed.get('id') == actual.get('id') and isinstance(expected,dict)):
            edits = []
            for key, new in proposed.items():
                if key in ('id','evidence') or _exact_fields(new,actual.get(key)):
                    continue
                if (key not in expected or expected[key] != actual.get(key) or isinstance(new,(dict,list))
                        or key in ('population_id','arm_id','reference_arm_id','intervention_arm_id','endpoint','measure','cutoff')):
                    return None
                child = dict(finding,target={**loc,'field_path':path+'/'+key},
                             expected_value_json=json.dumps(expected[key]),value_json=json.dumps(new))
                repaired = self.resolve(child,validation_issue)
                if not repaired or repaired['status'] != 'amended':
                    return None
                edits.extend(repaired['edits'])
            if edits:
                return _result('amended','Each changed clinical field was verified separately against its source and neighboring values.',
                               proof,edits=edits)
        if action in ('confirmed', 'addition', 'correction') and finding['scope_relation'] == 'same':
            # An equivalent proposal may have a stale expected object containing
            # display-only fields. Never accept a mismatching clinical leaf.
            if proposed is not None and _exact_fields(proposed, actual) and overlap:
                if field == 'status' and proposed == 'unclear':
                    return None
                if section in ('study', 'decision', 'study_details', 'arms', 'populations') or (
                        validation_issue not in ('No same-value, same-unit, same-role source literal',)
                        or _interval_match(row, field, proposed, text, section == 'binary')
                        or section == 'binary' and _fraction_match(row, field, proposed, text)):
                    return _result('confirmed', 'The proposal agrees with the stored fields and cites the same source as the original row.', proof)

        # Save direct source wording for supplementary descriptions; keep it outside
        # pooling/eligibility fields. An addition of covariates or a numerical row
        # requires an additional model/result-specific review.
        if action == 'addition' and section == 'study_details' and field in (
                'study_details', 'population_description', 'design_description') and contract._missing(actual):
            if isinstance(proposed, dict) and (proposed.get('adjustments') or
                    set(proposed) - {'population_description', 'design_description', 'adjustments', 'evidence'}):
                return None
            if not isinstance(proposed, (str, dict)) or not proposed:
                return None
            quotes = [p['quote'] for p in proof if _DESCRIPTION.search(p['quote'])]
            note = _compact_note(quotes, _tokens(str(proposed)))
            if note:
                return _result('supplement', 'Study design or population details quoted from the verified original report.',
                               proof, note=note)
        if (action in ('correction','addition') and finding['scope_relation'] == 'same'
                and isinstance(actual,str) and actual == expected and not contract._missing(actual)
                and isinstance(proposed,str) and not contract._missing(proposed)):
            old_terms = _tokens(actual) - _GENERIC_WORDS
            new_terms = _tokens(proposed) - _GENERIC_WORDS
            if section == 'arms' and field == 'schedule' and len(parts) == 5 and parts[2] == 'nodes':
                # The report may interleave the dose or route between schedule words.
                # Require the old frequency and every new term in order, without
                # added numeric values, alternatives, conditional or negative clauses.
                ordered = [re.escape(w) for w in re.findall(r'\w+',proposed,re.UNICODE)]
                phrase = r'\b' + r'\W+(?:(?:by mouth|orally)\W+)?'.join(ordered) + r'\b'
                if (old_terms < new_terms and (overlap or _overall_single_arm(record,row) or len(record['arms']) == 1)
                        and any(re.search(phrase,p['quote'],re.I) for p in proof)):
                    return _edit(path,actual,proposed,proof,'The original frequency and the added cycle or duration wording are verified in the same reported schedule.')
            if section == 'study_details' and field in ('design_description','population_description'):
                # Keep precisely reported additions; never replace the GPT summary
                # with a new interpretation of design, cohort membership or eligibility.
                if (len(old_terms & new_terms) >= 2 and new_terms - old_terms
                        and len(old_terms & new_terms) >= len(old_terms)*.3):
                    added = new_terms - old_terms
                    passages = [p['quote'] for p in proof if not _CITED.search(p['quote'])
                                and not _OUTSIDE.search(p['quote']) and added & _tokens(p['quote'])]
                    note = _compact_note(passages,added)
                    if note:
                        return _result('supplement','The report gives additional design or eligibility details for the existing study description.',
                                       proof,note=note)
        if not overlap or finding['scope_relation'] not in ('same', 'new_scope') or actual != expected:
            return _saved_addition(target, finding, proposed, expected, proof)
        if section == 'populations' and field == 'label' and action in ('addition', 'correction'):
            # Only write a complete, literal source label that preserves the old
            # description. More complex clarifications can retain the source note.
            if (finding['scope_relation'] == 'same' and isinstance(proposed, str) and _tokens(proposed)
                    and isinstance(actual, str) and not contract._missing(proposed)
                    and (contract._missing(actual) or _tokens(actual) < _tokens(proposed))
                    and any(proposed.casefold() in p['quote'].casefold() for p in proof)):
                return _edit(path, actual, proposed, proof, 'The expanded label appears verbatim in this population’s cited passage.')
        if action in ('addition', 'correction') and finding['scope_relation'] == 'same' and contract._missing(actual):
            if section in ('effects', 'survival', 'binary') and _interval_match(row, field, proposed, text, section == 'binary'):
                return _edit(path, actual, proposed, proof, 'The cited interval has the stored confidence level and companion bound.')
            if section == 'sample_sizes' and field == 'n' and _explicit_n(record, row, proposed, text):
                return _edit(path, actual, proposed, proof, 'The source explicitly reports the count and purpose for the entire cohort.')
            if section == 'binary' and field == 'numerator' and _unique_numerator(row, proposed, text):
                result = _edit(path, actual, proposed, proof, 'Derived numerator. It is the only integer compatible with the stored denominator and source-supported response percentage.')
                result['edits'][0]['derivation'] = 'unique_integer_from_rounded_percent'
                return result
            if section == 'binary' and _explicit_severe_zero(record, row, field, proposed, text):
                return _edit(path, actual, proposed, proof, 'The source explicitly reports no severe events at the recorded threshold in this single-arm cohort.')
            if section == 'binary' and _overall_single_arm(record, row) and _fraction_match(row, field, proposed, text):
                return _edit(path, actual, proposed, proof, 'The single-arm result, companion count and one source fraction agree.')
        bound = _bounded_value(proposed)
        if section == 'effects' and field == 'p_value' and contract._missing(actual) and bound:
            values = [(m[1],float(m[2])) for m in re.finditer(
                rf'\bp\s*([<>≤≥])\s*({_NUMBER})', text, re.I)]
            outcome = _ENDPOINT.get(row.get('endpoint'))
            if (values == [bound] and len(record['effects']) == 1 and outcome and
                    re.search(outcome, text, re.I) and not any(re.search(pattern, text, re.I)
                        for name, pattern in _ENDPOINT.items() if name != row.get('endpoint'))):
                return _result('supplement','The source reports a bounded p-value for the recorded comparison.',
                               proof, note=f"Reported p-value {proposed.strip()} ({row.get('endpoint', '')}).")
        return _saved_addition(target, finding, proposed, expected, proof)
