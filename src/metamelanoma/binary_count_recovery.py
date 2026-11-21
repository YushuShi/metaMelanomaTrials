"""Recover a 2×2 response table only when the source permits one integer solution."""

import re
from decimal import Decimal


PERCENT = re.compile(r'(?<![.\d])(?P<rate>\d+(?:\.\d+)?)\s*%')
RESPONSE = re.compile(r'\b(?:responses?|responders?|ORR)\b', re.I)
UNSUITABLE = re.compile(
    r'\b(?:cross[- ]?over|paired (?:arms?|samples?|observations?)|matched pairs?|'
    r'cluster[- ]randomi[sz]ed|weighted|model[- ](?:based|estimated)|adjusted (?:response|rate)|'
    r'adjusted ORR|propensity[- ]weighted|Kaplan[- –]Meier|cumulative incidence|estimated probability|historical controls?)\b', re.I)


def _events(rate, denominator, fixed):
    """All possible event counts, allowing either convention for exact rounding ties."""
    digits = max(0, -rate.as_tuple().exponent)
    scale = 10 ** digits
    reported = int(rate * scale)
    divisor = 200 * scale
    low = max(0, -(-((2 * reported - 1) * denominator) // divisor))
    high = min(denominator, ((2 * reported + 1) * denominator) // divisor)
    if fixed is not None:
        low, high = max(low, fixed), min(high, fixed)
    return range(low, high + 1)


def _unique_counts(total, rates, fixed_events, fixed_ns):
    first_n, second_n = fixed_ns
    if first_n is None and second_n is not None:
        first_n = total - second_n
    denominators = (first_n,) if first_n is not None else range(1, total)
    answer = None
    for n1 in denominators:
        n2 = total - n1
        if min(n1, n2) <= 0 or (second_n is not None and second_n != n2):
            continue
        left = _events(rates[0], n1, fixed_events[0])
        right = _events(rates[1], n2, fixed_events[1])
        if not left or not right:
            continue
        if answer is not None or len(left) * len(right) != 1:
            return None
        answer = ((left[0], n1), (right[0], n2))
    if answer:
        # At an exact half unit, common rounding conventions can disagree.
        for (events, n), rate in zip(answer, rates):
            scale = 10 ** max(0, -rate.as_tuple().exponent)
            if abs(200 * scale * events - 2 * int(rate * scale) * n) == n:
                return None
    return answer


def _raw_rates(passage, values):
    if not RESPONSE.search(passage) or UNSUITABLE.search(passage):
        return None
    # Restrict the precision check to a response statement with both percentages.
    for sentence in re.split(r'(?<=[.!?])\s+(?=[A-Z])|[\n;]', passage):
        if not RESPONSE.search(sentence) or not re.search(
                r'\b(?:versus|vs\.?|compared (?:with|to)|respectively)\b|'
                r'\b(?:in|for)\b.+?\band\b.+?\b(?:in|for)\b', sentence,re.I):
            continue
        raw = [m['rate'] for m in PERCENT.finditer(sentence)]
        if len(raw) != 2 or len({Decimal(r) for r in raw}) != 2:
            continue
        literals = {Decimal(r):r for r in raw}
        if all(v in literals for v in values):
            return tuple(literals[v] for v in values)
    return None


def _reported_evaluable_total(text, n):
    number = rf'(?<!\d){n}(?!\d)'
    patterns = (
        rf'(?:response|responses)\s+(?:(?:was|were)\s+(?:assessable|evaluable|assessed|evaluated)|'
        rf'could be (?:assessed|evaluated))\s+(?:in|for)\s+{number}\s+(?:patients|participants)',
        rf'{number}\s+(?:patients|participants)\s+(?:(?:were|were considered)\s+)?'
        rf'(?:assessable|evaluable|assessed|evaluated)\s+for\s+(?:tumou?r\s+|objective\s+)?response',
    )
    return any(re.search(pattern, text, re.I) for pattern in patterns)


def recover_pair(record, intervention_row, reference_row, spans):
    """Identify a unique reconstructed pair for a parallel randomized response comparison.

    The original arms, endpoint-specific total, printed precision and matching
    population are required. Randomized or treated totals cannot stand in for
    a response-evaluable denominator. Do not change the article-reported cells.
    """
    rows = intervention_row, reference_row
    study = record.get('study', {})
    if (study.get('randomized') != 'yes' or study.get('comparison_structure') != 'comparative'
            or len(record.get('arms', [])) != 2):
        return None
    arm_ids = {a['id'] for a in record['arms']}
    if len(arm_ids) != 2 or {r.get('arm_id') for r in rows} != arm_ids:
        return None
    if any(r.get('endpoint') != 'ORR' or r.get('origin') != 'own_report' for r in rows):
        return None
    shared_fields = ('population_id','cutoff','assessment_time','time_unit','response_criteria')
    if any(rows[0].get(k) != rows[1].get(k) for k in shared_fields):
        return None
    pop = rows[0].get('population_id')
    if pop in ('NA',None,'') or not any(p['id'] == pop for p in record.get('populations', [])):
        return None
    design = (record.get('study_details') or {}).get('design_description','')
    if UNSUITABLE.search(str(design)) or any(UNSUITABLE.search(str(r.get('endpoint_definition',''))) for r in rows):
        return None
    design_sources = set(study.get('evidence',[]))
    design_sources.update((record.get('study_details') or {}).get('evidence',[]))
    for sid in design_sources:
        if re.search(r'\b(?:cross[- ]over (?:trial|study|design)|cluster[- ]randomi[sz]ed|matched[- ]pair design)\b',
                     spans.get(sid,''),re.I):
            return None

    reported = [r.get('percentage') for r in rows]
    if any(type(v) not in (int,float) or not 0 < v < 100 for v in reported):
        return None
    values = [Decimal(str(v)) for v in reported]
    common = set(rows[0].get('evidence', [])) & set(rows[1].get('evidence', []))
    rate_sources = {}
    for sid in sorted(common):
        raw = _raw_rates(spans.get(sid,''), values)
        if raw:
            rate_sources[sid] = raw
    if len(set(rate_sources.values())) != 1:
        return None
    raw = next(iter(rate_sources.values()))
    total_sources = {}
    compatible_totals = set()
    for s in record.get('sample_sizes', []):
        n = s.get('n')
        if (s.get('arm_id') not in (None,'NA') or s.get('result_id') not in (None,'NA')
                or s.get('method') != 'reported' or s.get('complete') != 'yes' or s.get('population_id') != pop
                or s.get('cutoff') != rows[0].get('cutoff') or s.get('count_purpose') != 'response_evaluable'
                or type(n) is not int or n < 2):
            continue
        compatible_totals.add(n)
        # Both statements must belong to the same assessed cohort in the cited passage.
        supporting = [sid for sid in s.get('evidence',[]) if sid in rate_sources and
                      _reported_evaluable_total(spans[sid],n)]
        if supporting:
            total_sources.setdefault(n,[]).append((s['id'], supporting))
    if len(compatible_totals) != 1 or len(total_sources) != 1:
        return None
    total, sources = next(iter(total_sources.items()))
    def known(key):
        return tuple(r[key] if type(r.get(key)) is int else None for r in rows)
    counts = _unique_counts(total, [Decimal(v) for v in raw], known('numerator'), known('denominator'))
    if not counts:
        return None
    return {
        'method':'unique_two_arm_counts_from_evaluable_total_and_rounded_rates',
        'intervention':{'numerator':counts[0][0], 'denominator':counts[0][1]},
        'reference':{'numerator':counts[1][0], 'denominator':counts[1][1]},
        'reported_percentages':{'intervention':raw[0], 'reference':raw[1]},
        'evaluable_total':total, 'sample_size_ids':sorted(s[0] for s in sources),
        'evidence':sorted({sid for _, ids in sources for sid in ids}),
    }
