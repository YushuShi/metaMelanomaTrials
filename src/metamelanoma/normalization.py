"""Pure source-bound Arabic/NA normalization; historical code is never imported.

The bounded lexical/semantic parser was ported from the independently reviewed
saved parser. Source literals, wrapper originals, units, operators and missing
reasons are retained; scientific/model validation lives in validation.py.
"""
from copy import deepcopy
from decimal import Decimal, InvalidOperation, localcontext
from functools import lru_cache
from pathlib import PurePath
from types import SimpleNamespace
import re
import unicodedata
from . import schema

_SMALL = dict(zip('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(), range(20)))

_TENS = dict(zip('twenty thirty forty fifty sixty seventy eighty ninety'.split(), range(20, 100, 10)))

_SCALES = {'thousand': 1000, 'million': 1000000, 'billion': 1000000000}

_WORDS = set(_SMALL) | set(_TENS) | set(_SCALES) | {'hundred'}

_WORD = '(?:' + '|'.join(sorted(_WORDS, key=len, reverse=True)) + ')'

_WORD_SEQUENCE = re.compile(r'(?<![A-Za-z])' + _WORD + r'(?:(?:[\s\-‐‑]+)(?:and[\s\-‐‑]+)?' + _WORD + r')*(?![A-Za-z])', re.I)

_NUMERIC = re.compile(r'(?<![\w.])[+-]?(?:\d(?:[\d.,·\u00a0\u2009\u202f ]*\d)?|\.\d+)(?:[eE][+-]?\d+)?(?![\d.])')

_ROMANS = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10}

def lexical_norm(value):
    """Historical NFKC/space fold plus spaces adjacent to explicit operators.

    Operators, signs, digits, punctuation, letter case and source words stay
    intact. This does not equate different decimal spellings or quote text.
    """
    value = schema.norm(value)
    return re.sub(r'(?<![<>=≤≥])\s*([<>≤≥]=?|=)\s*(?=[+-]?(?:\d|\.\d))', r'\1', value)

def _under100(tokens):
    if len(tokens) == 1:
        return _SMALL.get(tokens[0], _TENS.get(tokens[0]))
    if len(tokens) == 2 and tokens[0] in _TENS and tokens[1] in _SMALL and 1 <= _SMALL[tokens[1]] <= 9:
        return _TENS[tokens[0]] + _SMALL[tokens[1]]
    return None

def _under1000(tokens):
    if len(tokens) >= 2 and tokens[0] in _SMALL and 1 <= _SMALL[tokens[0]] <= 9 and tokens[1] == 'hundred':
        tail = tokens[2:]
        if tail and tail[0] == 'and':
            tail = tail[1:]
            if not tail:
                return None
        remainder = _under100(tail) if tail else 0
        return None if remainder is None else _SMALL[tokens[0]] * 100 + remainder
    return _under100(tokens)

def _cardinal(text):
    tokens = re.split(r'[\s\-‐‑]+', text.lower())
    total, previous, start = 0, 10**12, 0
    for index, token in enumerate(tokens):
        if token not in _SCALES:
            continue
        scale = _SCALES[token]
        group = _under1000(tokens[start:index])
        if group is None or group <= 0 or scale >= previous:
            return None
        total += group * scale; previous = scale; start = index + 1
    tail = tokens[start:]
    if start and tail and tail[0] == 'and':
        tail = tail[1:]
    rest = _under1000(tail) if tail else (0 if start else None)
    return None if rest is None else total + rest

def _numeric_token(text):
    """Parse one contiguous decimal/scientific/grouped literal, never a sum."""
    text = text.replace('−', '-')
    sign = ''
    if text[:1] in {'+', '-'}:
        sign, text = text[0], text[1:]
    exponent = ''
    if re.search('[eE]', text):
        parts = re.split('[eE]', text)
        if len(parts) != 2 or not re.fullmatch(r'[+-]?\d{1,3}', parts[1]):
            return None
        text, exponent = parts[0], 'e' + parts[1]
    if '·' in text:
        if not re.fullmatch(r'\d+·\d+', text):
            return None
        text = text.replace('·', '.')
    if re.search(r'[ \u00a0\u2009\u202f]', text):
        if not re.fullmatch(r'\d{1,3}(?:[ \u00a0\u2009\u202f]\d{3})+(?:[.,]\d+)?', text):
            return None
        text = re.sub(r'[ \u00a0\u2009\u202f]', '', text)
    if ',' in text and '.' in text:
        if re.fullmatch(r'\d{1,3}(?:,\d{3})+\.\d+', text):
            text = text.replace(',', '')
        elif re.fullmatch(r'\d{1,3}(?:\.\d{3})+,\d+', text):
            text = text.replace('.', '').replace(',', '.')
        else:
            return None
    elif ',' in text:
        # Exact three-digit groups preserve the historical grouping rule.
        # A zero leading group or a non-three-digit fraction is decimal comma.
        if re.fullmatch(r'[1-9]\d{0,2}(?:,\d{3})+', text):
            text = text.replace(',', '')
        elif re.fullmatch(r'\d+,\d+', text) and (text.startswith('0,') or len(text.split(',')[1]) != 3):
            text = text.replace(',', '.')
        else:
            return None
    if not re.fullmatch(r'(?:\d+(?:\.\d+)?|\.\d+)', text):
        return None
    try:
        return Decimal(sign + text + exponent)
    except InvalidOperation:
        return None

def literal_values(raw):
    """Unambiguous spelling/notation only; no percentages or semantic counts."""
    # Preserve explicit superscript exponents before NFKC removes their layout.
    raw = re.sub(r'10([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)',
                 lambda m: '10^' + unicodedata.normalize('NFKC', m[1]), raw)
    text = schema.norm(raw).replace('−', '-')
    values = set()
    scientific = re.compile(r'(?<![\w.])([+-]?(?:\d+(?:[.·]\d+)?|\.\d+))\s*×\s*10(?:\^([+-]?\d{1,3})|(-\d{1,3}))(?![\d.])')
    def explicit_exponent(match):
        coefficient = _numeric_token(match[1]); exponent = int(match[2] or match[3])
        if coefficient is not None:
            with localcontext() as context:
                context.prec = max(80, len(match[1]) + 10)
                values.add(coefficient.scaleb(exponent))
        return ' LITERAL '
    text = scientific.sub(explicit_exponent, text)
    def cardinal(match):
        number = _cardinal(match[0])
        if number is not None:
            values.add(Decimal(number))
        # Never accept a component20 or8 from the compound Twenty-eight.
        return ' LITERAL '
    text = _WORD_SEQUENCE.sub(cardinal, text)
    # Roman labels are recognized only with their explicit phase/stage context.
    def roman(match):
        if match[1] in _ROMANS:
            values.add(Decimal(_ROMANS[match[1]]))
        return ' LITERAL '
    text = re.sub(r'\b(?i:phase|stage|grade|level)\s+([IVX]+)\b', roman, text)
    for match in _NUMERIC.finditer(text):
        parsed = _numeric_token(match[0])
        if parsed is not None:
            values.add(parsed)
    return values

lexical = SimpleNamespace(literal_values=literal_values, lexical_norm=lexical_norm, _ROMANS=_ROMANS, _WORD_SEQUENCE=_WORD_SEQUENCE)

VERSION = 'source-bound-clinical-number-normalization'
KIND = 'source_bound_clinical_numbers'
COUNT_ROLES = {'sample_size', 'numerator', 'denominator', 'required_events'}
MISSING = {
    'not reported':'not_reported', 'not available':'not_available',
    'unavailable':'not_available', 'not provided':'not_reported',
    'not recorded':'not_reported', 'not assessed':'not_assessed',
    'not specified':'not_specified', 'not measured':'not_measured',
    'not determined':'not_determined', 'not evaluable':'not_evaluable',
    'not calculable':'not_calculable', 'cannot be calculated':'not_calculable',
    'not applicable':'not_applicable', 'not estimable':'not_estimable',
    'not estimated':'not_estimable', 'cannot be estimated':'not_estimable',
    'could not be estimated':'not_estimable', 'not reached':'not_reached',
    'not been reached':'not_reached', 'not yet reached':'not_reached',
    'not been reached yet':'not_reached', 'not reached yet':'not_reached',
    'had not been reached':'not_reached', 'has not been reached':'not_reached',
    'have not been reached':'not_reached', 'had not yet been reached':'not_reached',
    'has not yet been reached':'not_reached', 'have not yet been reached':'not_reached',
    'was not reached':'not_reached', 'was not yet reached':'not_reached',
    'na':'NA_unexpanded', 'n/a':'NA_unexpanded', 'nr':'NR_unexpanded',
    'ne':'NE_unexpanded', 'n.e.':'NE_unexpanded', 'n.a.':'NA_unexpanded', 'n.r.':'NR_unexpanded',
    'undefined':'undefined_source_median',
}
_NUMBER = r'[+−-]?(?:\d{1,3}(?:[,\u00a0\u2009\u202f ]\d{3})+(?:\.\d+)?|\d+(?:[.,·]\d+)?|\.\d+)(?:[eE][+-]?\d+)?'
_DIGITS = re.compile(r'(?<![\w.])'+_NUMBER+r'(?!\w|\.\d)')
_ATTACHED_DIGITS = re.compile(r'(?<![\w.])'+_NUMBER+r'(?=(?:mg|[µμu]g|ng|pg|Gy|mL|kg|cm|mm|months?|weeks?|days?|years?|hours?|mo|patients?|participants?|subjects?)\b)',re.I)
_RANGE = re.compile(r'(?<![\w.])(?P<lo>'+_NUMBER+r')(?P<lo_percent>\s*%)?\s*(?:–|—|-|\bto\b)\s*(?P<hi>'+_NUMBER+r')(?P<percent>\s*(?:%|percent\b))?',re.I)
_UNIT = re.compile(r'^[\s-]*(%|percent\b|mg(?:\s+per\s+kilogram(?:\s+of\s+body\s+weight)?|/m(?:\^?2|²)|/kg)?(?:/(?:days?|weeks?|hours?|d))?\b|[µμu]g(?:/m[lL]|/kg|/m(?:\^?2|²))?(?:/(?:days?|weeks?|hours?|d))?\b|ng/m[lL]\b|pg/m[lL]\b|m[lL]\b|kg\b|g\b|cm\b|mm\b|months?\b|weeks?\b|days?\b|years?\b|hours?\b|minutes?\b|seconds?\b|patients?\b|participants?\b|subjects?\b|events?\b|responses?\b|deaths?\b|arms?\b|cells?\b|samples?\b|lesions?\b|tumou?rs?\b|nodes?\b|animals?\b|mice\b|rats?\b|cycles?\b|cent(?:er|re)s?\b)',re.I)
_COUNT_NOUN = r'(?:patients?|participants?|subjects?|events?|responses?|deaths?|cases?|people|individuals?|toxicity|toxicities|adverse events?)'
_PAIRED_ZERO_RESPONSE = re.compile(r'\bno\s+(?:complete\s+or\s+partial|partial\s+or\s+complete)\s+responses?\b',re.I)
_ORDINALS = dict(zip(('first second third fourth fifth sixth seventh eighth ninth tenth '
    'eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth').split(),range(1,21)))
_TEMPORAL_UNIT = r'(?:days?|weeks?|months?|years?|hours?|minutes?|seconds?)'
_TEMPORAL_ORDINAL = re.compile(r'\b(?P<ordinal>'+ '|'.join(_ORDINALS) +r'|\d{1,3}(?:st|nd|rd|th))\b(?=\s+'+_TEMPORAL_UNIT+r'\b)',re.I)


def _ordinal_value(literal):
    if literal.casefold() in _ORDINALS:return _ORDINALS[literal.casefold()]
    match=re.fullmatch(r'(\d{1,3})(st|nd|rd|th)',literal,re.I)
    if not match:return None
    value=int(match[1]);suffix='th'if 10<=value%100<=20 else {1:'st',2:'nd',3:'rd'}.get(value%10,'th')
    return value if value>0 and match[2].casefold()==suffix else None


class HarmonizationHold(ValueError):
    """The original is retained; there is no safe automatic semantic mapping."""


class _RegisteredPercentEncoding:
    """An external trusted processor capability, never native JSON metadata."""
    def __init__(self, descriptor):
        self.descriptor=deepcopy(descriptor)
        self.fingerprint=schema.digest(descriptor)


def register_percent_probability(number, *, evidence, fact, source_proof_ref, verify_source_proof,
                                 allow_legacy_threshold=False):
    """Preserve a fully specified existing encoding; do not infer a conversion.

    The caller must verify its artifact/source proof outside model-generated
    data. A native `normalization` string alone never creates this capability.
    """
    inline=isinstance(source_proof_ref,dict)and source_proof_ref.get('kind')=='supplied_source_payload'
    need(isinstance(source_proof_ref,dict)and(inline or isinstance(source_proof_ref.get('path'),str))
         and re.fullmatch(r'[0-9a-f]{64}',source_proof_ref.get('sha256','')),
         'Exact source-proof reference required')
    if not inline:
        path=PurePath(source_proof_ref['path'])
        need(not path.is_absolute()and'..'not in path.parts and not any(p.casefold().endswith(('.env','.key','.pem','.p12','.pfx'))for p in path.parts),
             'Unsafe source-proof reference')
    need('bytes'not in source_proof_ref or type(source_proof_ref['bytes'])is int and source_proof_ref['bytes']>=0,
         'Invalid source-proof byte length')
    need(callable(verify_source_proof)and verify_source_proof(source_proof_ref)is True,
         'Registered encoding requires an actually verified source proof')
    need(number.get('role')not in COUNT_ROLES,'Count cannot be registered from a percentage')
    role=number.get('role');measure=_norm((fact or{}).get('measure')or'')
    allowed=role in{'confidence_level','power','alpha','percentage'}
    if role=='estimate':allowed=bool(re.search(r'probability|proportion|percentage|\brate\b|\borr\b',measure))and not re.search(r'\bhr\b|\bor\b|\brr\b|hazard|odds ratio|risk ratio',measure)
    if role=='threshold':allowed=allow_legacy_threshold is True
    need(allowed,'This role/measure cannot be registered as probability')
    need(_norm(number.get('status','reported'))not in{'not reported','not applicable','not reached','not estimable'},
         'Registered encoding cannot erase a numeric/missingness contradiction')
    need(_unit(number.get('unit'))in{'probability','proportion'},'Registered target unit is not probability/proportion')
    raw=number.get('raw_text',number.get('value_text'))
    need(isinstance(raw,str)and re.search(r'%|\bpercent\b',raw,re.I),'Registered source unit must be explicit percent')
    source_values=_literals(raw)
    need(len(source_values)==1 and number.get('value')is not None,'Unambiguous registered source value required')
    source_value=next(iter(source_values));value=_decimal(number['value'])
    need(0<=value<=1 and value*100==source_value,'Nonexact percent/probability registration')
    # Verify the source percent representation with the same unit/operator
    # matcher; registration must not erase a source inequality or invent one.
    normalize_number({**deepcopy(number),'value':_json_number(source_value),'unit':'%'},
                     evidence=evidence,fact=fact)
    matches=[deepcopy(e)for e in evidence if re.search(r'(?<![\w.])'+re.escape(lexical.lexical_norm(raw))+r'(?!\d)',lexical.lexical_norm(e.get('quote','')))]
    need(matches,'Registered source percent is absent from own source')
    descriptor={'policy':'exact_registered_percent_probability','normalization':'percent_to_probability',
        'source_proof_ref':deepcopy(source_proof_ref),'original_wrapper':deepcopy(number),
        'evidence_sha256':schema.digest(evidence),'field_identity':{k:(fact or{}).get(k)for k in('fact_id','field')},
        'role':number.get('role'),'source_literal':raw,'source_percent_value':str(source_value),
        'source_matches':matches,'target_unit':number['unit']}
    return _RegisteredPercentEncoding(descriptor)


def registered_percent_encodings(payload, *, source_proof_ref, verify_source_proof):
    """Trusted-processor registration map keyed by (fact_id, number_index).

    Native data cannot invoke this function. Candidates that are not fully
    specified remain unregistered and are held by the ordinary normalizer.
    Legacy role=threshold is deliberately not admitted by this generic path.
    """
    evidence={e['evidence_id']:e for e in payload['evidence']};result={}
    for fact in payload['facts']:
        for index,n in enumerate(fact['numbers']):
            if _unit(n.get('unit'))not in{'probability','proportion'}:continue
            try:
                result[(fact['fact_id'],index)]=register_percent_probability(n,
                    evidence=[evidence[e]for e in n['evidence_ids']],fact=fact,
                    source_proof_ref=source_proof_ref,verify_source_proof=verify_source_proof)
            except (HarmonizationHold,KeyError):continue
    return result


def need(ok, message):
    if not ok:
        raise HarmonizationHold(message)


def _norm(text):
    return ' '.join(unicodedata.normalize('NFKC',str(text)).casefold().replace('_',' ').split())


def _unit(text):
    s=_norm(text or '').replace('μ','µ').replace('^','')
    s=re.sub(r'\s+per\s+kilogram(?:\s+of\s+body\s+weight)?\b','/kg',s)
    aliases={'percent':'%','month':'months','week':'weeks','day':'days','year':'years',
             'hour':'hours','minute':'minutes','second':'seconds','patient':'patients',
             'participant':'participants','subject':'subjects','event':'events',
             'response':'responses','death':'deaths','arm':'arms','center':'centers','centre':'centers',
             'centres':'centers','ug':'µg','microgram':'µg','micrograms':'µg','milligram':'mg','milligrams':'mg'}
    return aliases.get(s,s.replace('ug/','µg/'))


def _same_unit(left,right):
    # Count-noun synonyms do not change the counting unit or any denominator.
    # Keep the originally declared/source units in provenance.
    people={'patients','participants','subjects'}
    def dimension(unit):
        modified=re.fullmatch(r'(?:(?:further|additional|nonresponding|responding|treated|enrolled|evaluable|eligible|randomized|randomised)\s+){1,2}(patients?|participants?|subjects?)',unit or'',re.I)
        if modified:return _unit(modified[1])
        match=_UNIT.match(unit or'')
        if match and(match.end()==len(unit)or unit[match.end():match.end()+1].isspace()):
            return _unit(match[1])
        return unit
    left,right=dimension(left),dimension(right)
    return left==right or left in people and right in people


def _json_number(value):
    need(value.is_finite(),'Nonfinite numerical value')
    if value==value.to_integral_value():return int(value)
    candidate=float(value)
    need(Decimal(str(candidate))==value,'No exact JSON-number round trip; rounding forbidden')
    return candidate


def _decimal(value):
    need(not isinstance(value,bool),'Boolean is not an Arabic numerical value')
    try: result=Decimal(str(value))
    except (InvalidOperation,ValueError,TypeError):raise HarmonizationHold('Unparseable existing numerical value')
    need(result.is_finite(),'Nonfinite existing numerical value')
    return result


def _literals(raw):
    signed=re.fullmatch(r'(?i)(minus|negative|plus|positive)[\s-]+(.+)',str(raw).strip())
    if signed:
        values=lexical.literal_values(signed[2])
        need(len(values)==1 and next(iter(values))>=0,'Ambiguous compound sign')
        value=next(iter(values))
        return {-value if signed[1].casefold()in{'minus','negative'}else value}
    return lexical.literal_values(raw)


def _event_supported(fact,unit,clause):
    if fact is None:return unit not in {'patients','participants','subjects','people'}
    field=_norm(' '.join(str(fact.get(k)or'')for k in('field','measure','linked_endpoint_label')))
    lowered=_norm(clause)
    # A narrower zero event must not become a broader one (no complete
    # responses != no responses; no AE discontinuations != no adverse events).
    if re.search(r'discontinu|withdraw',lowered)and not re.search(r'discontinu|withdraw',field):return False
    for restriction in('complete','partial','confirmed','unconfirmed','serious','treatment related','drug related','immune related'):
        phrase=restriction.replace(' ',r'[ -]')
        if re.search(r'\b'+phrase+r'\b',lowered)and not re.search(r'\b'+phrase+r'\b',field):return False
    for grade in re.findall(r'\bgrade\s*([1-5])\b',lowered):
        if not re.search(r'grade\s*'+grade+r'\b|\bg'+grade+r'\b',field):return False
    # Zero cause-specific events cannot become zero all-cause events. Keep
    # this literal and conservative; unsupported cause labels remain held.
    for cause in re.finditer(r'\b(?:due to|attributable to|caused by|related to|from|for)\s+(?:(?:a|an|the)\s+)?([a-z]+)',lowered):
        word=cause[1]
        if word in {'any','all'}and re.match(r'\s+causes?\b',lowered[cause.end():]):continue
        if not re.search(r'\b'+re.escape(word[:6]),field):return False
    families=[(r'respons|respond',r'respons|respond'),(r'discontinu|withdraw',r'discontinu|withdraw'),
        (r'death|mortal|fatal',r'death|died|fatal'),(r'progress',r'progress'),
        (r'enroll|accru|recruit',r'enroll|accru|recruit'),
        (r'adverse|toxic',r'adverse|toxic'),(r'analy|evaluab',r'analy|evaluab')]
    for meaning,pattern in families:
        if re.search(meaning,field):return re.search(pattern,clause,re.I)is not None
    # Specific event words must occur in the same zero clause, never elsewhere
    # in a shared paragraph. Generic count nouns alone do not establish this.
    words=set(re.findall(r'[a-z]{4,}',field)) - {'count','number','patients','patient','events','event','total','reported','cohort','baseline','proportion','percentage','frequency'}
    return bool(words)and all(re.search(r'\b'+re.escape(w[:6]),clause,re.I)for w in words)


def _explicit_raw_unit(raw):
    if raw is None:return None
    text=str(raw).strip()
    for i in range(1,len(text)):
        match=_UNIT.match(text[i:])
        if match and match.end()==len(text)-i:
            prefix=text[:i].strip();tokens=_tokens(prefix)
            if len(tokens)!=1 or tokens[0]['end']!=len(prefix):continue
            lead=prefix[:tokens[0]['start']].strip()
            if lead and not re.fullmatch(r'[<>≤≥]=?|up to|at most|no more than|at least|not less than|less than|more than|greater than|within|beyond',lead,re.I):continue
            return _unit(match[1])
    return None


def _raw_core(raw, unit):
    if raw is None:return None
    text=str(raw).strip()
    # Remove only a literal declared unit suffix, not a scale/frequency code.
    if unit:
        for i in range(len(text)):
            suffix=text[i:].strip()
            if suffix and _unit(suffix)==_unit(unit):
                text=text[:i].strip();break
    return text


def _role_context(number,fact):
    role=number.get('role');unit=_unit(number.get('unit'))
    field=_norm(' '.join(str((fact or {}).get(k)or'')for k in('field','measure','counting_unit')))
    return role,unit,field


def _special(raw, number, fact, quote):
    """Contextual zero/frequency/design spellings, never free-text inference."""
    word=_norm(raw);role,unit,field=_role_context(number,fact)
    observed=(fact or {}).get('scope')=='observed'
    count=role in COUNT_ROLES or role=='estimate'and bool(re.search(_COUNT_NOUN,unit))
    if word in {'no','none'}:
        need(observed and count and role!='required_events','No/none needs an explicitly observed count role')
        need(not(role=='sample_size'and re.search(r'prior|history|previous|naiv',field)),
             'No prior therapy is not a sample size')
        modifiers=r'(?:(?:serious|treatment[- ]related|drug[- ]related|immune[- ]related|complete|partial|objective|grade\s*[1-5])\s+){0,3}'
        pattern=r'\b(?P<word>'+re.escape(word)+r')\s+(?:of\s+(?:the\s+)?)?'+modifiers+_COUNT_NOUN+r'\b'
        positions=[m.start('word')for m in re.finditer(pattern,quote,re.I)]
        positions=[start for start in positions if _event_supported(fact,unit,
            re.split(r'[.;]|\b(?:but|whereas|while|however)\b|\band\s+(?:no|none|one|two|three|\d+)\b',quote[start:],maxsplit=1,flags=re.I)[0])]
        need(positions,'No/none lacks an explicit quoted count noun')
        return Decimal(0),'explicit_observed_zero_count',positions
    if word=='single':
        if role=='other'and unit in {'arms','centers','cohorts','groups'}and (fact or{}).get('domain')=='study_design':
            noun={'arms':r'arms?','centers':r'cent(?:er|re)s?','cohorts':r'cohorts?','groups':r'groups?'}[unit]
            positions=[m.start()for m in re.finditer(r'\bsingle[- ]'+noun+r'\b',quote,re.I)]
            need(positions,'Single design unit absent from quote')
            return Decimal(1),'explicit_single_design_unit',positions
        positions=[m.start()for m in re.finditer(r'\bsingle\s+'+_COUNT_NOUN+r'\b',quote,re.I)]
        need(observed and count and positions,
             'Single arm/center is not patient N')
        return Decimal(1),'explicit_single_count',positions
    if word in {'once','twice'}:
        need(role=='other'and re.search(r'times?|frequency|daily|weekly|per |administrations?',unit),
             'Once/twice requires a matching frequency role and unit')
        match=re.search(r'\b(?P<word>'+word+r')\s+(?:(?:a|per)\s+)?(?P<period>daily|weekly|monthly|days?|weeks?|months?)\b',quote,re.I)
        administration=re.search(r'\b(?:given|administered|injected|dosed)\s+(?P<word>'+word+r')\b',quote,re.I)
        need(match or administration and 'administration'in unit,'Once conjunction is not a numerical frequency')
        if match:
            period={'daily':'days','weekly':'weeks','monthly':'months'}.get(match['period'].lower(),_unit(match['period']))
            for key in('days','weeks','months'):
                if key[:-1] in unit or {'days':'daily','weeks':'weekly','months':'monthly'}[key]in unit:
                    need(period==key,'Frequency period conversion forbidden')
        return Decimal(1 if word=='once'else 2),'explicit_frequency',[(match or administration).start('word')]
    return None


@lru_cache(maxsize=2048)
def _token_items(quote):
    """Exact offsets, maximal literals before component numbers/words."""
    occupied=[];out=[]
    # Fraction compounds remain atomic even beside an ordinal temporal noun.
    fractions=r'\b(?:one|two|three|four|five|six|seven|eight|nine|ten)(?:[- ]and)?[- ](?:half|halves|(?:third|quarter|fifth|sixth|seventh|eighth|ninth|tenth)s?)\b'
    occupied.extend(m.span()for m in re.finditer(fractions,quote,re.I))
    for match in _TEMPORAL_ORDINAL.finditer(quote):
        if any(match.start()<b and match.end()>a for a,b in occupied):continue
        value=_ordinal_value(match['ordinal'])
        if value is not None:
            occupied.append(match.span())
            out.append({'start':match.start(),'end':match.end(),'literal':match[0],
                'value':Decimal(value),'kind':'temporal_ordinal'})
    # Unsupported fraction compounds are never component integers.
    science=re.compile(r'(?<![\w.])[+−-]?(?:\d+(?:[.·]\d+)?|\.\d+)\s*×\s*10(?:\^[+-]?\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+|[-−]\d+)(?!\w|\.\d)')
    for match in science.finditer(quote):
        values=_literals(match[0]);occupied.append(match.span())
        if len(values)==1:out.append({'start':match.start(),'end':match.end(),'literal':match[0],'value':next(iter(values)),'kind':'scientific'})
    for match in _RANGE.finditer(quote):
        if any(match.start()<b and match.end()>a for a,b in occupied):continue
        occupied.append(match.span())
        for key in('lo','hi'):
            values=_literals(match[key])
            if len(values)==1:out.append({'start':match.start(key),'end':match.end(key),'literal':match[key],
                'value':next(iter(values)),'kind':'range_'+key})
    for kind,pattern in [('words',lexical._WORD_SEQUENCE),('digits',_DIGITS)]:
        for match in pattern.finditer(quote):
            a,b=match.span()
            if any(a<y and b>x for x,y in occupied):continue
            prefix=re.search(r'\b(?:minus|negative|plus|positive)[\s-]+$',quote[max(0,a-16):a],re.I)
            if prefix:a=max(0,a-16)+prefix.start()
            occupied.append((a,b));values=_literals(quote[a:b])
            if len(values)!=1:continue
            if a and quote[a-1]in'-‐‑'and a>=2 and quote[a-2].isalnum():continue
            out.append({'start':a,'end':b,'literal':quote[a:b],'value':next(iter(values)),'kind':kind})
    for match in _ATTACHED_DIGITS.finditer(quote):
        a,b=match.span()
        if any(a<y and b>x for x,y in occupied):continue
        if a and quote[a-1]in'-‐‑'and a>=2 and quote[a-2].isalnum():continue
        occupied.append((a,b));values=_literals(match[0])
        if len(values)==1:out.append({'start':a,'end':b,'literal':match[0],'value':next(iter(values)),'kind':'digits'})
    for context in re.finditer(r'\b(?i:phase|stage|grade|level)s?\s+([IVX]+(?:\s*(?:,|and|or|to|[-–])\s*[IVX]+)*)\b',quote):
        for match in re.finditer(r'\b[IVX]+\b',context[1]):
            if match[0]in lexical._ROMANS:
                a=context.start(1)+match.start();b=context.start(1)+match.end()
                out.append({'start':a,'end':b,'literal':quote[a:b],
                    'value':Decimal(lexical._ROMANS[match[0]]),'kind':'roman','ordinal_source_context':context[0]})
    # Cached objects are immutable; individual callers receive fresh dicts.
    return tuple(tuple(token.items())for token in out)


def _tokens(quote):
    return [dict(items)for items in _token_items(quote)]


def _non_scalar(result,number,raw,quotes):
    matches=[deepcopy(e)for e in quotes if lexical.lexical_norm(str(raw))in lexical.lexical_norm(e['quote'])]
    need(matches,'Non-scalar literal is absent from own source')
    result.update(number=deepcopy(number),display_value=str(raw),source_literal=str(raw),
                  source_matches=matches,non_scalar_source_literal=True,
                  missing_reason=None,changes=[])
    return result


def _roman_label(role,unit,field):
    return role in {'other','minimum','maximum'}and bool(re.search(r'\b(?:phase|stage|grade|level)\b',unit or field))


def normalize_number(number, *, evidence, fact=None, registered_encoding=None):
    """Normalize one wrapper; evidence is its own [{evidence_id,quote,...}]."""
    original=deepcopy(number);n=deepcopy(number)
    raw=n.get('raw_text');raw=n.get('value_text')if raw is None else raw
    value=n.get('value');status=_norm(n.get('status','reported'))
    need(value is None or n.get('missing_reason')in{None,''},
         'Missing reason with an actual numerical value must remain held')
    result={'original_wrapper':original,'number':n,'arabic_value':None,'display_value':None,
            'source_literal':None,'source_matches':[],'missing_reason':None,'changes':[],
            'harmonization_policy':VERSION}
    quotes=[e for e in evidence if isinstance(e,dict)and isinstance(e.get('quote'),str)]
    if registered_encoding is not None:
        need(isinstance(registered_encoding,_RegisteredPercentEncoding),'Model metadata cannot self-register an encoding')
        descriptor=registered_encoding.descriptor
        need(schema.digest(descriptor)==registered_encoding.fingerprint
             and descriptor['original_wrapper']==number and descriptor['evidence_sha256']==schema.digest(evidence)
             and descriptor['field_identity']=={k:(fact or{}).get(k)for k in('fact_id','field')},
             'Registered encoding proof/wrapper/field changed')
        need(_unit(n.get('unit'))in{'probability','proportion'}and _decimal(value)*100==Decimal(descriptor['source_percent_value']),
             'Registered encoding no longer exact')
        display={'less_than':'<','less_or_equal':'≤','greater_than':'>','greater_or_equal':'≥'}.get(n.get('qualifier'),'')+str(_json_number(_decimal(value)))
        result.update(arabic_value=_json_number(_decimal(value)),display_value=display,
            source_literal=descriptor['source_literal'],source_matches=deepcopy(descriptor['source_matches']),
            registered_encoding_proof=deepcopy(descriptor),source_arabic_value=_json_number(Decimal(descriptor['source_percent_value'])),
            scientific_unit_and_value_preserved=True)
        return result
    missing_status=status in {'not reported','not applicable','not estimable','not estimated','not reached','not available'}
    raw_missing=MISSING.get(_norm(raw))if raw is not None else None
    placeholder_annotation=isinstance(raw,str)and _norm(raw)in {'','-','–','—'}
    if placeholder_annotation:
        need(missing_status and value is None,'Empty/dash missing marker requires explicit null missing annotation')
        raw_missing=status.replace(' ','_')
    if missing_status or raw_missing:
        need(value is None,'Missing label with actual numerical value must not erase the number')
        if raw is not None and not raw_missing:
            need(not lexical.literal_values(str(raw)),'Missing label contains an actual printed number')
            raise HarmonizationHold('Unrecognized missing-value source phrase')
        if raw_missing:
            marker=re.compile(r'(?<!\w)'+re.escape(_norm(raw))+r'(?!\w)')
            matches=[]if placeholder_annotation else[e for e in quotes if marker.search(_norm(e['quote']))]
            need(matches or missing_status,'Missing-value phrase absent from its own quoted source')
            if raw_missing=='undefined_source_median'and not missing_status:
                need((n.get('role')=='median'or re.search(r'\bmedian\b',_norm((fact or{}).get('measure')or'')))
                     and any(re.search(r'\bmedian(?:50)?\b.{0,120}\bundefined\b|\bundefined\b.{0,120}\bmedian(?:50)?\b',_norm(e['quote']))for e in matches),
                     'Undefined is not an unrestricted numeric missing marker')
            result['source_matches']=deepcopy(matches);result['source_literal']=str(raw)if matches else None
            result['missing_reason_origin']='source_literal'if matches else'native_annotation'
        reason=raw_missing or n.get('missing_reason') or status.replace(' ','_')
        if n.get('qualifier')=='not_reached':reason='not_reached'
        n.update(status='not_applicable'if reason=='not_applicable'else'not_reported',value=None,raw_text=None)
        result.update(number=n,display_value='NA',missing_reason=reason)
        result.setdefault('missing_reason_origin','native_annotation')
    elif raw is None and value is None:
        # Preserve unspecified absence, without converting it to a zero/claim.
        result.update(display_value='NA',missing_reason='unspecified_original_missing_numeric_value',
                      missing_reason_origin='unextracted_or_unspecified_original_wrapper')
    else:
        need(quotes,'No own source evidence for numerical harmonization')
        role,unit,field=_role_context(n,fact)
        paired_zero=bool(raw is not None and _PAIRED_ZERO_RESPONSE.fullmatch(str(raw).strip()))
        if paired_zero:
            need(role=='numerator' and (fact or{}).get('scope')=='observed'
                and (fact or{}).get('clinical_endpoint_family')=='response'
                and re.search(r'\b(?:complete|partial)\s+response\b',field)
                and not re.search(r'\b(?:overall|objective)\s+response\b|\borr\b',field)
                and unit in {'patients','participants','subjects','responses'},
                'No complete-or-partial responses is only an explicit category response count, never ORR or patient N')
            result['unit_normalization_proof']={'original_unit':n['unit'],'normalized_unit':'responses',
                'rule':'explicit_zero_complete_or_partial_response_count','no_rate_or_denominator_inferred':True}
            n['unit']='responses';unit='responses'
        raw_unit=_explicit_raw_unit(raw)
        need(not(unit and raw_unit)or _same_unit(unit,raw_unit),'Raw unit contradicts declared unit; reanchoring forbidden')
        core=_raw_core(raw,n.get('unit'))
        if paired_zero:core='0'
        p_descriptor=None
        if role in {'timepoint','follow_up'} and re.match(_TEMPORAL_UNIT+r'\b',unit):
            ordinal=_TEMPORAL_ORDINAL.match(str(raw)) if raw is not None else None
            if ordinal and re.fullmatch(_TEMPORAL_UNIT+r'(?:\s+of\s+(?:therapy|treatment))?',str(raw)[ordinal.end():].strip(),re.I):
                ordinal_value=_ordinal_value(ordinal['ordinal'])
                if ordinal_value is not None:core=str(ordinal_value)
        if role=='p_value' and core is not None:
            detail=re.fullmatch(r'\s*(?:P\s*)?(?:[=<>≤≥]=?\s*)?(?P<value>'+_NUMBER+r')\s*[,;]\s*(?P<sides>one|two)[ -]sided\s*',core,re.I)
            if detail:
                core=detail['value'];p_descriptor=detail['sides'].casefold()
        if core is not None:
            scientific=bool(re.fullmatch(r'\s*'+_NUMBER+r'\s*×\s*10(?:\^?[+−-]?\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)\s*',core))
            if _RANGE.search(core)and not scientific:
                if value is None:return _non_scalar(result,n,raw,quotes)
                raise HarmonizationHold('Range compression forbidden')
            values=_literals(core)
            if value is None and not _tokens(core)and core not in lexical._ROMANS:
                return _non_scalar(result,n,raw,quotes)
            if core in lexical._ROMANS:
                need(_roman_label(role,unit,field),
                     'Roman label cannot become a clinical count/effect')
                values={Decimal(lexical._ROMANS[core])}
            if not values:
                semantic=[]
                for e in quotes:
                    try:entry=_special(core,n,fact,e['quote'])
                    except HarmonizationHold:continue
                    if entry:semantic.append(entry)
                if not semantic and value is None:return _non_scalar(result,n,raw,quotes)
                need(semantic and len({x[0]for x in semantic})==1,'Unsupported/ambiguous numerical word or code')
                values={semantic[0][0]}
            if len(values)!=1 and value is None:return _non_scalar(result,n,raw,quotes)
            need(len(values)==1,'Raw string is not one unambiguous literal')
            expected=next(iter(values))
            if value is not None:need(_decimal(value)==expected,'Numerical value differs; scaling/rounding forbidden')
        else:expected=_decimal(value)
        need(expected.is_finite(),'Nonfinite literal')
        candidates=[]
        for e in quotes:
            quote=e['quote']
            tokens=_tokens(quote)
            if paired_zero:
                tokens.extend({'start':m.start(),'end':m.end(),'literal':m[0],'value':Decimal(0),'kind':'paired_response_zero'}for m in _PAIRED_ZERO_RESPONSE.finditer(quote))
            for special in re.finditer(r'\b(?:No|none|single|once|twice)\b',quote,re.I):
                try:entry=_special(special[0],n,fact,quote)
                except HarmonizationHold:continue
                if entry and special.start()in entry[2]:tokens.append({'start':special.start(),'end':special.end(),'literal':special[0],
                    'value':entry[0],'kind':entry[1]})
            for token in tokens:
                if token['value']!=expected:continue
                if token['kind']=='temporal_ordinal'and not(role in {'timepoint','follow_up'} and re.match(_TEMPORAL_UNIT+r'\b',unit)):continue
                if p_descriptor and not re.match(r'\s*[,;]\s*'+p_descriptor+r'[ -]sided\b',quote[token['end']:],re.I):continue
                if token['kind']=='range_lo'and role not in{'ci_lower','minimum','IQR_lower','other','timepoint'}:continue
                if token['kind']=='range_hi'and role not in{'ci_upper','maximum','IQR_upper','other','timepoint'}:continue
                if token['kind']=='roman':
                    ordinal=re.match(r'(phase|stage|grade|level)',token['ordinal_source_context'],re.I)[1].casefold()
                    if not _roman_label(role,unit,field)or not re.search(r'\b'+ordinal+r'\b',unit or field):continue
                digit_ordinal=re.search(r'\b(phase|stage|grade|level)s?\s*$',quote[max(0,token['start']-20):token['start']],re.I)
                if digit_ordinal and(not _roman_label(role,unit,field)or not re.search(r'\b'+digit_ordinal[1].casefold()+r'\b',unit or field)):continue
                suffix=quote[token['end']:];um=_UNIT.match(suffix);source_unit=_unit(um[1])if um else None
                if token['kind']=='paired_response_zero':source_unit='responses'
                # Exact cardinal patient counts can carry descriptive words
                # before the counting noun. This supplies a unit only: it does
                # not change the event, population or numerical role.
                person_modifier=None
                if source_unit is None and unit in {'patients','participants','subjects'} and role in COUNT_ROLES:
                    person_modifier=re.match(r'\s+(?:(?:further|additional|nonresponding|responding|treated|enrolled|evaluable|eligible|randomized|randomised)\s+){1,2}(patients?|participants?|subjects?)\b',suffix,re.I)
                    if person_modifier:source_unit=_unit(person_modifier[1])
                if digit_ordinal:source_unit=unit
                postfix=None
                after=re.match(r'\s*(or more|or less)\b',suffix,re.I)
                age_after=re.match(r'\s*years?\s+(?:and|or)\s+(older|younger)\b',suffix,re.I)
                if age_after:postfix='greater_or_equal'if age_after[1].casefold()=='older'else'less_or_equal'
                elif after:postfix='greater_or_equal'if after[1].casefold()=='or more'else'less_or_equal'
                elif suffix.startswith('+'):
                    tail=suffix[1:]
                    ordinal_plus=re.search(r'\b(?:grade|stage)\s*$',quote[max(0,token['start']-12):token['start']],re.I)
                    if not tail.strip()or re.match(r'^\s*[.,;)\]]',tail)or _UNIT.match(tail)or ordinal_plus:
                        postfix='greater_or_equal';suffix=tail
                        um=_UNIT.match(suffix);source_unit=_unit(um[1])if um else None
                    else:continue
                if not source_unit and unit:
                    # Unknown literal units need no conversion: accept only
                    # the exact declared unit immediately after this token.
                    normalized_suffix=_norm(suffix).lstrip(' -')
                    if re.match(re.escape(unit)+r'(?!\w)',normalized_suffix):
                        source_unit=unit
                shared={'kind':'explicit_modified_person_noun','source_text':quote[token['start']:token['end']+person_modifier.end()]}if person_modifier else None
                for interval in _RANGE.finditer(quote):
                    if interval.start('lo')==token['start']and interval.group('percent'):
                        source_unit='%';shared={'kind':'CI_percent_shorthand','source_text':interval[0]}
                        if role not in {'ci_lower','minimum','IQR_lower'}:shared=None;source_unit='percent_interval_not_count'
                        else:
                            peer={'ci_lower':'ci_upper','minimum':'maximum','IQR_lower':'IQR_upper'}[role]
                            upper=next((x for x in(fact or{}).get('numbers',[])if x.get('role')==peer),None)
                            if not upper or upper.get('value')is None or _decimal(upper['value'])not in lexical.literal_values(interval['hi']):shared=None;source_unit='unresolved_CI_pair'
                if role in COUNT_ROLES and(source_unit=='%'or'%'in str(raw or'')):continue
                if source_unit in {'percent_interval_not_count','unresolved_CI_pair'}:continue
                if unit and source_unit and not _same_unit(unit,source_unit):continue
                raw_has_unit=core is not None and str(raw).strip()!=core and p_descriptor is None
                if raw_has_unit and not source_unit:
                    # Unit ellipsis only within one explicit comma/and list.
                    if not unit:continue
                    tail=re.match(r'(?P<list>(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)'+_NUMBER+r')+)\s+(?P<unit>months?|weeks?|days?|years?|hours?)\b',suffix,re.I)
                    if not tail or _unit(tail['unit'])!=unit:continue
                    shared={'kind':'explicit_list_unit_ellipsis','source_text':quote[token['start']:token['end']+tail.end()]}
                    source_unit=unit
                op=re.search(r'([<>]\s*or\s*=|[<>≤≥]=?|up to|at most|no more than|at least|not less than|less than|more than|greater than|higher than|thicker than|younger than|older than|within|beyond|above|below|under|over)\s*$',quote[max(0,token['start']-30):token['start']],re.I)
                printed={'<':'less_than','<=':'less_or_equal','≤':'less_or_equal','>':'greater_than','>=':'greater_or_equal','≥':'greater_or_equal',
                    'up to':'less_or_equal','at most':'less_or_equal','no more than':'less_or_equal','at least':'greater_or_equal','not less than':'greater_or_equal',
                    'less than':'less_than','more than':'greater_than','greater than':'greater_than','higher than':'greater_than','thicker than':'greater_than',
                    'younger than':'less_than','older than':'greater_than','beyond':'greater_than','above':'greater_than',
                    'below':'less_than','under':'less_than','over':'greater_than','within':'less_or_equal',
                    '>or=':'greater_or_equal','<or=':'less_or_equal'}.get(re.sub(r'\s+','',op[1].casefold())if re.fullmatch(r'[<>]\s*or\s*=',op[1],re.I)else op[1].casefold())if op else postfix
                if op and op[1].casefold()=='within'and not re.search(r'\b(?:days?|weeks?|months?|years?|hours?|minutes?|seconds?)\b',unit+' '+str(source_unit or'')):continue
                qualifier=n.get('qualifier','equal')
                # A specified window length is a scalar parameter: "within
                # 3 days" does not assert that the number3 itself is < or <=3.
                if op and op[1].casefold()=='within'and qualifier=='equal'and role in {'timepoint','follow_up'}and not re.search(r'\bwithin\b|[<>≤≥]',str(raw),re.I):
                    printed=None;op=None
                if not printed and((token['kind']=='range_lo'and role=='minimum'and qualifier=='greater_or_equal')or(token['kind']=='range_hi'and role=='maximum'and qualifier=='less_or_equal')):
                    printed=qualifier
                if printed and qualifier!=printed:continue
                if qualifier in {'less_than','less_or_equal','greater_than','greater_or_equal'}and printed!=qualifier:continue
                a,b=token['start'],token['end']
                if op:a=max(0,a-30)+op.start()
                literal=quote[a:b]
                candidates.append({'evidence_id':e.get('evidence_id'),'source_id':e.get('source_id'),
                    'block_id':e.get('block_id'),'quote_start':a,'quote_end':b,'source_literal':literal,
                    'rule':token['kind'],'source_unit':source_unit,'shared_unit_proof':shared,
                    'test_sidedness_descriptor':p_descriptor})
        need(candidates,'No same-value, same-unit, same-role source literal')
        selected=candidates[0];literal=selected['source_literal']
        # Prefer an exact source spelling of the original raw when available.
        exact=next((c for c in candidates if lexical.lexical_norm(c['source_literal'])==lexical.lexical_norm(str(raw))),None)
        if exact:selected=exact;literal=selected['source_literal']
        arabic=_json_number(expected)
        n.update(value=arabic,raw_text=literal)
        display={'less_than':'<','less_or_equal':'≤','greater_than':'>','greater_or_equal':'≥'}.get(n.get('qualifier'),'')+str(arabic)
        result.update(number=n,arabic_value=arabic,display_value=display,
            source_literal=literal,source_matches=candidates,missing_reason=None)
    result['changes']=[{'field':k,'original':original.get(k),'harmonized':n.get(k)}for k in('status','value','raw_text','unit')if original.get(k)!=n.get(k)]
    return result

