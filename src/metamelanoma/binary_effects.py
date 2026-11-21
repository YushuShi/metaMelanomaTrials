"""Calculate crude binary comparisons from compatible arm-specific observations.

The frozen extraction stays intact. Each public comparison references its two
source results, reports how the arms were oriented, and records the calculation
separately from the numbers reported in the article.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from functools import lru_cache
from itertools import combinations, product
from pathlib import Path
import json
import math
import re
from statistics import NormalDist

from .io import canonical, digest
from .quantitative_export import numeric, present, regimen_label, wrap

NA = 'NA'
METHOD = 'from_arm_binary_outcomes'
RESPONSE = {'ORR','CR','PR','DCR','pCR'}
Z = NormalDist().inv_cdf(.975)
NONINDEPENDENT = re.compile(r'\b(?:case.control|case.crossover|cross.over|crossover|'
    r'paired|matched|matching|cluster.randomi[sz]ed|within.patient|intra.patient|'
    r'propensity|inverse.probability|weighted analysis|externally controlled|historical control|'
    r'split.body|sequential cohorts?|indirect comparison|pooled analysis)\b',re.I)
NONBINARY = re.compile(r'\b(?:person.years?|per (?:100|1000|1,000|patient|person)|'
    r'lesion.level|lesions? (?:responding|assessed|evaluated)|cumulative incidence|'
    r'kaplan.meier|weighted (?:rate|percentage|proportion)|exposure.adjusted)\b',re.I)
AMBIGUOUS = re.compile(r'\b(?:unknown|unspecified treatment|all patients|pooled arms|all arms)\b', re.I)
AGGREGATE = re.compile(r'^(?:(?:first|second|third)[- ]line )?(?:any |all |other )?(?:(?:palliative|systemic|drug|treatment) )?'
                       r'(?:combination(?: (?:therapy|treatments?|regimens?))?|monotherapy|drug therapy|systemic therapy|'
                       r'palliative therapy|treatment arms?|combined treatments?|pooled regimens?)$',re.I)
CONTROL = re.compile(r'\b(?:placebo|best supportive care|observation|no treatment|standard (?:of )?care)\b', re.I)


def norm(value):
    return ' '.join(str(value).casefold().split()) if present(value) else ''


def score_context(row):
    return {k: (norm(row.get('endpoint_definition')) if k == 'definition' else
                row.get(k,NA) if k in ('endpoint','assessment_time') else norm(row.get(k)))
            for k in ('endpoint','definition','response_criteria','safety_attribution','assessment_time','time_unit','cutoff')}


def ingredients(arm):
    nodes=arm.get('nodes',[])
    if not nodes or any(n['kind']=='UNKNOWN' for n in nodes):
        return None
    names={norm(n['name']) for n in nodes if n['kind'] in ('drug','control','class') and present(n.get('name'))}
    return names if names and not any(AMBIGUOUS.search(name) or AGGREGATE.fullmatch(name) for name in names) else None


@lru_cache(maxsize=1)
def _treatment_taxonomy():
    registry=json.loads((Path(__file__).resolve().parents[2]/'config/treatment_registry.json').read_bytes())
    aliases={}; groups={}; memberships={}
    for a in registry['products']:
        memberships[a['id']]=set(a.get('memberships',[])) | {a['class_id'],a['broad_category']}
        for name in [a['id'],a['label'],*a.get('aliases',[])]:aliases[norm(name)]=a['id']
    for a in registry['generic_classes']:
        if not a.get('agent_unspecified'):continue
        main=a['class_id']
        general=main if not main.endswith('-unspecified') else a['broad_category']
        groups[a['id']]=general
        for name in [a['id'],a['label'],*a.get('aliases',[])]:aliases[norm(name)]=a['id']
    return aliases,groups,memberships


def alternatives(arm):
    """Complete possible regimens. An OR-pooled arm overlaps each constituent."""
    aliases,_,_=_treatment_taxonomy()
    nodes={n['id']:n for n in arm['nodes']}
    def visit(node):
        n=nodes[node]
        if n['kind'] not in ('AND','OR','SEQUENTIAL'):
            name=norm(n['name'])
            return {aliases.get(name,name)}
        children=[visit(c) for c in n['children']]
        if any(not child for child in children):return set()
        if n['kind']=='OR':
            return set().union(*children)
        if math.prod(map(len,children))>100:return set()
        return {(n['kind'],tuple(sorted(choice,key=repr) if n['kind']=='AND' else choice))
                for choice in product(*children)}
    return visit(arm['root_id'])


def overlapping_arms(left,right):
    a,b=alternatives(left),alternatives(right)
    if not a or not b or a & b:return True
    aliases,groups,memberships=_treatment_taxonomy()
    for broad,narrow,options in ((left,right,a),(right,left,b)):
        if len(options)!=1:continue
        label=next(iter(options));category=groups.get(label)
        if not category:continue
        components={aliases.get(name,name) for name in ingredients(narrow)}
        if label in components and len(components)>1:
            continue  # Adding a second drug to a specific shared backbone.
        if not components:continue
        explicitly_single=bool(re.search(r'\b(?:monotherapy|alone|single.agent)\b',broad['label'],re.I))
        if all(category in memberships.get(agent,set()) or groups.get(agent)==category for agent in components):
            if len(components)==1 or not explicitly_single:
                return True
    return False


def different_periods(left,right,pop,pops,design):
    words=lambda a:norm(a['id']+' '+a['label']).replace('_',' ').replace('-',' ')
    prior=r'\b(?:prior|previous|pre progression|before progression|first line)\b'
    post=r'\b(?:subsequent|salvage|post(?: progression)?|after progression|second line|third line|rechallenge)\b'
    a,b=words(left),words(right)
    if ((re.search(prior,a) and re.search(post,b)) or (re.search(prior,b) and re.search(post,a))):
        return True
    lineage=list(ancestors(pop,pops))
    # A "subsequent chemotherapy group" can have a second result for the
    # very same patients on prior nivolumab. Pairing them would double count.
    if not lineage:return False
    p=norm(lineage[0]['label'])
    if (left['population_id']==right['population_id']==pop and
            re.search(r'\b(?:subsequent|salvage|second.line|post.progression|re.challenge)\b',p)):
        belongs=lambda arm:any(name in p for name in ingredients(arm) if len(name)>3)
        if belongs(left)!=belongs(right):return True
    return False


def get_rate(row,derived=()):
    flags={f.get('field') for f in row.get('field_flags',[])}
    if flags & {'row','relationship','population_id','arm_id','endpoint','assessment_time','cutoff','endpoint_definition'}:
        return None
    pct=row.get('percentage') if 'percentage' not in flags else None
    pct=float(pct) if numeric(pct) and 0 <= pct <= 100 else None
    num,den=row.get('numerator'),row.get('denominator')
    counts=all(type(n) is int for n in (num,den)) and 0<=num<=den and den>0
    if ('numerator' in flags or 'denominator' in flags or
            {'numerator','denominator'} & set(derived)):
        counts=False
    if counts and pct is not None:
        # The last published decimal, not an absolute percentage-point tolerance.
        precision=len(str(pct).rstrip('0').partition('.')[2])
        if abs(100*num/den-pct) > 0.5*(10**-precision)+1e-9:
            return None
    if not counts and pct is None:
        return None
    return dict(row_id=row['id'],arm_id=row['arm_id'],population_id=row['population_id'],
                numerator=num if counts else None,denominator=den if counts else None,
                percentage=pct,rate=num/den if counts else pct/100,
                basis='reported_counts' if counts else 'reported_percentage')


def ratios(p,q):
    rr=p/q if q>0 else None
    divisor=q*(1-p)
    return {'RR':rr,'OR':p*(1-q)/divisor if divisor>0 else None}


def interval(measure,estimate,intervention,reference,independent):
    if not independent or estimate<=0 or any(a['numerator'] is None for a in (intervention,reference)):
        return None
    a,n=intervention['numerator'],intervention['denominator']
    c,m=reference['numerator'],reference['denominator']
    if min(a,c,n-a,m-c)<=0:
        return None
    var=1/a-1/n+1/c-1/m if measure=='RR' else 1/a+1/(n-a)+1/c+1/(m-c)
    return [math.exp(math.log(estimate)+z*math.sqrt(var)) for z in (-Z,Z)]


def choose_orientation(record,left,right):
    ids={left['id'],right['id']}
    directions={(e['intervention_arm_id'],e['reference_arm_id']) for e in record['effects']
                if e.get('origin')=='own_report' and {e['intervention_arm_id'],e['reference_arm_id']}==ids}
    if len(directions)==1:
        return next(iter(directions)), 'reported_arm_contrast'
    a,b=ingredients(left),ingredients(right)
    if not a or not b or a==b:
        return None,None
    if not any(n['kind'] in ('SEQUENTIAL','OR') for arm in (left,right) for n in arm['nodes']):
        if a < b:return (right['id'],left['id']), 'expanded_regimen_versus_backbone'
        if b < a:return (left['id'],right['id']), 'expanded_regimen_versus_backbone'
    lc=all(CONTROL.search(s) for s in a);rc=all(CONTROL.search(s) for s in b)
    if lc!=rc:
        return ((right['id'],left['id']) if lc else (left['id'],right['id'])), 'treatment_versus_control'
    ordered=sorted((left,right),key=lambda arm:(norm(regimen_label(arm)),arm['id']))
    return tuple(arm['id'] for arm in ordered), 'alphabetical_analytical_contrast'


def context_population(record,row,arm,pops):
    p=pops.get(row['population_id'])
    if not p or p.get('melanoma_only')!='yes':
        return None
    parent=pops.get(p.get('parent_id'))
    # Some extractions use a separate population for each treatment arm. Only
    # lift a pure treatment label into its common parent, never a biomarker,
    # response-conditioned subset, stage, follow-up or line of treatment.
    if parent and parent.get('melanoma_only')=='yes' and p['id']==arm['population_id']:
        label=norm(p['label'])
        for term in sorted((norm(arm['label']),norm(regimen_label(arm))),key=len,reverse=True):
            if term and term in label:
                residual=label.replace(term,' ')
                residual=re.sub(r'\b(?:patients?|participants?|treated|receiving|with|in|the|assigned|randomi[sz]ed|to|arm|group|cohort|alone|monotherapy)\b','',residual)
                if not re.search(r'[\w≥≤<>]',residual):
                    return parent['id']
    return p['id']


def _published_test(left,right,spans):
    """One explicit comparison of both matching rates and a single reported p."""
    if not all(numeric(r.get('percentage')) for r in (left,right)):
        return None
    expected=sorted([left['percentage'],right['percentage']])
    if expected[0]==expected[1]:
        return None
    matches={}
    for sid in sorted(set(left['evidence']) & set(right['evidence'])):
        for sentence in re.split(r'(?<=[.!?])\s+(?=[A-Z])',spans.get(sid,'')):
            if len(sentence)>1000 or not re.search(r'compar|\bvs\.?\b|versus|respectively',sentence,re.I):
                continue
            percentages=sorted(float(n) for n in re.findall(r'(\d+(?:\.\d+)?)\s*%',sentence))
            cues={'ORR':r'respons|respond|ORR','CR':r'complete respons|complete remission|\bCR\b',
                  'PR':r'partial respons|partial remission|\bPR\b','DCR':r'disease control|\bDCR\b',
                  'pCR':r'pathologic\w* complete|\bpCR\b'}
            if left['endpoint'] in cues:
                if not re.search(cues[left['endpoint']],sentence,re.I):continue
            elif not norm(left.get('endpoint_definition')) or norm(left['endpoint_definition']) not in norm(sentence):
                continue
            ps=re.findall(r'\bp\s*(<=|>=|=|<|>|≤|≥)\s*(\d*\.\d+|[01](?![\d.]))',sentence,re.I)
            if percentages==expected and len(ps)==1 and 0<=float(ps[0][1])<=1:
                matches[ps[0]]=sid
    if len(matches)!=1:
        return None
    (op,value),sid=next(iter(matches.items()))
    return {'operator':op,'value':float(value),'evidence':[sid],
            'test':'unspecified','sidedness':'unspecified','scope':'reported_arm_comparison'}


def _rate_signature(row):
    """Equivalent duplicates contribute one observation; differing values are ambiguous."""
    return (row['rate'],row['numerator'],row['denominator'],row['percentage'])


def _make_effects(record, rates, rows, direction, orientation, pop, context, independent, spans):
    from .binary_count_recovery import recover_pair
    iid,rid=direction
    lhs,rhs=rows[iid],rows[rid]
    intervention,reference=deepcopy(rates[iid]),deepcopy(rates[rid])
    recovery=None
    if independent and any(a['numerator'] is None for a in (intervention,reference)):
        recovery=recover_pair(record,lhs,rhs,spans)
        if recovery:
            for arm,side in ((intervention,'intervention'),(reference,'reference')):
                inferred=recovery[side]
                if arm['numerator'] is not None and (arm['numerator'],arm['denominator'])!=(inferred['numerator'],inferred['denominator']):
                    recovery=None
                    break
            if recovery:
                for arm,side in ((intervention,'intervention'),(reference,'reference')):
                    if arm['numerator'] is None:
                        arm.update(recovery[side],basis='reconstructed_counts')
                        arm['rate']=arm['numerator']/arm['denominator']
    evidence=list(dict.fromkeys([*lhs['evidence'],*rhs['evidence'],*((recovery or {}).get('evidence',[]))]))
    reported_test=_published_test(lhs,rhs,spans)
    reported_rates=(intervention['percentage'],reference['percentage'])
    from_percentages=ratios(*(p/100 for p in reported_rates)) if None not in reported_rates else None
    for side in (intervention,reference):
        source_arm=next(arm for arm in record['arms'] if arm['id']==side['arm_id'])
        side['label']=source_arm['label']
    direct_denoms=intervention['denominator'],reference['denominator']
    analysis_n=sum(direct_denoms) if independent and None not in direct_denoms else NA
    for measure,estimate in ratios(intervention['rate'],reference['rate']).items():
        if estimate is None:
            continue
        bounds=interval(measure,estimate,intervention,reference,independent)
        basis='log_wald_reconstructed_counts' if bounds and recovery else 'log_wald_reported_counts' if bounds else None
        calc=dict(method=METHOD,intervention=intervention,reference=reference,orientation=orientation,
                  interval_method=basis,outcome_context=context,from_reported_percentages=from_percentages,
                  reported_comparison_test=reported_test)
        if recovery:
            calc['count_recovery']=recovery
        topology=[record['source_sha256'],pop,iid,rid,measure,lhs['id'],rhs['id']]
        yield dict(id='calc-'+digest(canonical(topology))[:22],population_id=pop,intervention_arm_id=iid,
            reference_arm_id=rid,endpoint=lhs['endpoint'],endpoint_definition=lhs['endpoint_definition'],
            cutoff=lhs['cutoff'],origin='own_report',evidence=evidence,measure=measure,estimate=estimate,
            ci_lower=bounds[0] if bounds else NA,ci_upper=bounds[1] if bounds else NA,ci_level=95 if bounds else NA,
            analysis_n=analysis_n,adjusted='no',model='Crude comparison of two arm-specific probabilities',
            p_value=NA,p_test=NA,p_sidedness=NA,field_flags=[],calculation=calc)


MULTISTUDY = re.compile(r'\b(?:pooled|combined) (?:analysis|data|results)|\b(?:meta.analysis|literature review)|'
    r'\b(?:two|three|multiple|several|2|3) (?:phase [IV0-9]+ )?(?:randomi[sz]ed )?(?:clinical )?trials\b|'
    r'\banalys[ei]s of (?:randomi[sz]ed[^.]{0,40}) trials\b',re.I)
INDIRECT = re.compile(r'\b(?:indirect (?:[a-z-]+ )?comparison|network meta.analysis|case.control|'
                      r'matching.adjusted|cross.trial|systematic review|literature review)\b',re.I)
PLATFORM = re.compile(r'\b(?:umbrella|rolling.arm|platform trial|adaptive.design|master protocol)\b',re.I)
TRIAL = re.compile(r'\b(?:NCT\d{8}|(?:checkmate|keynote|relativity|SWOG|ECOG(?:.ACRIN)?)'
                   r'[ -]*(?:[a-z]{0,2})?\d{2,6}|[ES]\d{4})\b',re.I)


def ancestors(pop,pops):
    seen=set()
    while pop in pops and pop not in seen:
        seen.add(pop)
        yield pops[pop]
        pop=pops[pop].get('parent_id')


def trial_for(pop,pops):
    for ancestor in ancestors(pop,pops):
        trials={re.sub('[^A-Za-z0-9]','',s).upper() for s in TRIAL.findall(ancestor['label'])}
        if trials:
            return next(iter(trials)) if len(trials)==1 else None
    return None


def control_arm(arms,spans):
    tagged=set()
    for arm in arms.values():
        if re.search(r'\b(?:control|comparator|reference) (?:arm|group)|\((?:control|comparator)\)',arm['label'],re.I):
            tagged.add(arm['id'])
        drugs=ingredients(arm)
        names=[re.escape(s) for s in drugs]
        if not names:continue
        if all(CONTROL.fullmatch(s) for s in drugs):
            tagged.add(arm['id'])
        for passage in spans.values():
            if not re.search(r'control|comparator',passage,re.I):continue
            for match in re.finditer(r'(?:control|comparator) (?:arm|treatment|group) (?:of |was |received )?([^.;\n]{1,100})|'
                    r'([^.;\n]{1,100})\s*\((?:control|comparator)\)',passage,re.I):
                fragment=(match[1] or match[2]).casefold().split(' versus ')[-1].split(' vs ')[-1]
                # A preceding list of experimental regimens cannot identify the
                # control by a single ingredient it happens to share.
                fragment=re.split(r'[,;]|\bwhich\b|\bor\b',fragment)[0]
                if all(re.search(r'\b'+n+r'\b',fragment) for n in names):
                    named={drug for a in arms.values() for drug in ingredients(a) if
                           re.search(r'\b'+re.escape(drug)+r'\b',fragment)}
                    if named==drugs:tagged.add(arm['id'])
    return next(iter(tagged)) if len(tagged)==1 else None


def calculate(wrapper,clinical_rows,spans,title="",shared_design=""):

    record=wrapper['record']
    if record['decision']['status']!='retain' or record['study']['comparison_structure']!='comparative':
        return []
    pops={p['id']:p for p in record['populations']}
    arms={a['id']:a for a in record['arms'] if ingredients(a)}
    if len(arms)<2:
        return []
    design=' '.join(str(s or '') for s in (record.get('study_details',{}).get('design_description'),
                    record['study'].get('name'),title,shared_design))
    if INDIRECT.search(design):
        return []
    registrations={x['id'] for x in record['study'].get('identifiers',[]) if re.fullmatch(r'NCT\d{8}',x['id'],re.I)}
    # Methods can identify otherwise unlabelled arms as subsets recruited from
    # distinct trials. Keep direct, jointly randomized comparisons explicit.
    different_trials = re.compile(r'\b(?:patients|participants|subjects)\b[^.!?]{0,135}\b'
        r'(?:treated|recruited|enrolled|drawn|included|participating)\b[^.!?]{0,115}\b'
        r'(?:(?:two|three|four|multiple|several|[2-9]) (?:different )?|different )'
        r'(?:phase [0-9IVab/ .-]+(?:or (?:phase )?[0-9IVab/ .-]+)? )?(?:clinical )?trials\b',re.I)
    multitrial_source=any(different_trials.search(v) for v in spans.values())
    multiple=bool(MULTISTUDY.search(design)) or multitrial_source or len(registrations)>1
    # A treatment's marginal outcomes across several lines may include patients
    # who previously received the other regimen. They are not disjoint arms.
    recycled = re.compile(r'\b(?:second|third|fourth)[- ]line\s*\((?:after|following) '
                          r'(?:the )?(?:first|previous|earlier|other|prior) [^.)]{0,28}regimen',re.I)
    if any(recycled.search(v) for v in spans.values()):
        return []
    adaptive=len(arms)>2 and bool(PLATFORM.search(design))
    control=control_arm(arms,spans) if adaptive else None
    unusual_source=any(re.search(r'case.control (?:study|design)|(?:cluster.randomi[sz]ed|cross.over|matched.pair) (?:trial|study|design)',v,re.I)
                       for v in spans.values())
    if any(re.search(r'case.control (?:study|design)',v,re.I) for v in spans.values()):
        return []
    independent=not adaptive and not unusual_source and not NONINDEPENDENT.search(design) and (record['study'].get('randomized')=='yes' or
        bool(re.search(r'\bparallel[ -](?:group|arm)|independent (?:groups|cohorts)',design,re.I)))
    derivations=defaultdict(set)
    for d in record.get('derivations',[]):
        if d['section']=='binary':
            derivations[d['id']].add(d['field'])
    groups=defaultdict(lambda:defaultdict(list))
    for row in record['binary']:
        arm=arms.get(row['arm_id'])
        published=clinical_rows.get(row['id'])
        if not arm or row.get('origin')!='own_report' or not published or published.get('extraction_conflict'):
            continue
        if any(sid not in spans for sid in row.get('evidence',[])) or not row.get('evidence'):
            continue
        pop=context_population(record,row,arm,pops)
        context=score_context(row)
        if not pop or multiple and (not trial_for(row['population_id'],pops) or
                trial_for(row['population_id'],pops)!=trial_for(arm['population_id'],pops)):
            continue
        if (row['endpoint'] not in RESPONSE and not context['definition']) or NONBINARY.search(context['definition']):
            continue
        rate=get_rate(row,derivations[row['id']])
        if rate:
            groups[(pop,tuple(context.items()))][arm['id']].append((row,rate))
    reported=[(_scope(record,e),e) for e in record['effects'] if e.get('origin')=='own_report'
              and e['measure'] in ('RR','OR') and numeric(e['estimate'])]
    out=[]
    for (pop,attributes),by_arm in groups.items():
        data={arm:rs[0] for arm,rs in by_arm.items() if len({_rate_signature(rate) for row,rate in rs})==1}
        for left,right in combinations(sorted(data),2):
            if (ingredients(arms[left])==ingredients(arms[right]) or overlapping_arms(arms[left],arms[right]) or
                    different_periods(arms[left],arms[right],pop,pops,design)):
                continue
            direction,orientation=choose_orientation(record,arms[left],arms[right])
            if direction is None:
                continue
            if adaptive:
                if control and control in direction:
                    direction=(next(k for k in direction if k!=control),control)
                    orientation='source_designated_platform_control'
                elif control or orientation!='reported_arm_contrast':
                    # Only an unambiguous shared monotherapy backbone is an
                    # analytical comparator when the platform names no control.
                    l,r=ingredients(arms[left]),ingredients(arms[right])
                    if control or (len(l)!=1 or not l<r) and (len(r)!=1 or not r<l):
                        continue
                    direction=(right,left) if l<r else (left,right)
                    orientation='platform_addon_versus_common_monotherapy'

            rates={k:data[k][1] for k in direction}
            rows={k:data[k][0] for k in direction}
            for effect in _make_effects(record,rates,rows,direction,orientation,pop,dict(attributes),independent,spans):
                scope=_scope(record,effect)
                if not any(_same_context(scope,existing_scope,effect,existing) for existing_scope,existing in reported):
                    out.append(effect)
    return out


def _scope(record,effect):
    arms={a['id']:a for a in record['arms']}
    if effect['intervention_arm_id'] not in arms or effect['reference_arm_id'] not in arms:
        return None
    p=next((p for p in record['populations'] if p['id']==effect['population_id']),None)
    if not p:
        return None
    labels=tuple(sorted(norm(regimen_label(arms[aid])) for aid in (effect['intervention_arm_id'],effect['reference_arm_id'])))
    return (effect['endpoint'],effect['measure'],labels,p['scope'],norm(p['label']))


def _same_context(scope,other,effect,other_effect):
    if scope is None or other is None or scope[:3]!=other[:3]:
        return False
    if scope[3:]!=other[3:] and not scope[3]==other[3]=='overall':
        return False
    a=effect['calculation']['outcome_context']
    b=(other_effect.get('calculation') or {}).get('outcome_context',{})
    fields=('cutoff','assessment_time','time_unit','response_criteria','safety_attribution')
    for k in fields:
        av=norm(a.get(k));bv=norm(b.get(k,other_effect.get(k)))
        if av and bv and av!=bv:
            return False
    # Within adverse-event codes many different toxicities can be reported.
    # Keep separate terms, even if the two reports use the same generic code.
    definition=norm(b.get('definition',other_effect.get('endpoint_definition')))
    if scope[0] not in RESPONSE:
        return a['definition']==definition
    # An intracranial (or independently assessed) response need not equal the
    # systemic (or investigator-assessed) result even in the same population.
    qualifiers=(r'\bintracranial|brain metastas',r'extracranial',r'\blocal response|injected lesion',
                r'uninjected|non.injected',r'central review|central assessment|independent central|\bBICR\b',
                r'investigator.assess',r'irRECIST|iRECIST|immune.related response',
                r'\bfull analysis set\b|\bFAS\b')
    # The binary schema has a separate response-criteria field; the reported
    # ratio schema can express the identical assessor in the endpoint text.
    first=a['definition']+' '+norm(a.get('response_criteria'))
    second=definition+' '+norm(b.get('response_criteria',other_effect.get('response_criteria')))
    for term in qualifiers:
        if bool(re.search(term,first,re.I))!=bool(re.search(term,second,re.I)):
            # A sparse abstract may omit its assessor. A qualifier introduced
            # solely by a structured field does not alone establish a separate
            # assessment from an otherwise concordant abstract exposure.
            if re.search(term,a['definition'],re.I) or re.search(term,definition,re.I):
                return False
    return True


def _fuller_concordant(original,newer):
    """A later abstract-to-full-text refinement can omit a usable arm table."""
    earlier,effect,scope,_=original
    later,other,other_scope,_=newer
    if (earlier['stage']!='R2' or later['stage']!='R3' or
            not numeric(effect['ci_lower']) or numeric(other['ci_lower']) or
            not _same_context(scope,other_scope,effect,other)):
        return False
    def arm_map(record, value):
        names={a['id']:norm(regimen_label(a)) for a in record['arms']}
        return {names[side['arm_id']]:side for side in (value['calculation']['intervention'],value['calculation']['reference'])}
    a=arm_map(earlier['record'],effect);b=arm_map(later['record'],other)
    if a.keys()!=b.keys() or len(a)!=2:
        return False
    for key,left in a.items():
        right=b[key]
        if right['denominator'] is not None:
            if (left['numerator'],left['denominator'])!=(right['numerator'],right['denominator']):
                return False
        else:
            pct=right['percentage']
            if pct is None:return False
            digits=len(str(float(pct)).rstrip('0').partition('.')[2])
            if abs(left['rate']*100-pct)>0.5*10**(-digits)+1e-9:return False
    return True


def _clinical_projection(article,record,effect,by_id,comparisons):
    calc=effect['calculation']
    left=by_id[calc['intervention']['row_id']]
    right=by_id[calc['reference']['row_id']]
    prefix='CE-'+left['review_binding_sha256'][:24]+'-'
    evidence=[prefix+sid for sid in effect['evidence']]
    population=next(p for p in record['populations'] if p['id']==effect['population_id'])
    if left['population']['entity_id']==population['id']:
        p=deepcopy(left['population'])
    else:
        p={'entity_id':population['id'],'kind':'population','label':population['label'],
           'population_scope':'melanoma','parent_id':population['parent_id'] if present(population['parent_id']) else None,
           'evidence_ids':[prefix+sid for sid in population['evidence']],'result_scope':population['scope']}
    rid=prefix+'F-'+digest(canonical(['calculated_effect',effect['id']]))[:16]
    cid=prefix+'C-'+digest(canonical(['calculated_contrast',effect['population_id'],effect['intervention_arm_id'],effect['reference_arm_id']]))[:16]
    row={k:deepcopy(left[k]) for k in ('report_id','pmid','review_stage','reviewer','review_binding_sha256','source_input_sha256',
            'scope','evidence_origin','validated','API_verification_pending','record_kind','endpoint','variable',
            'clinical_validation','clinical_verified','pooling_eligible','report_R3_complete','final_R3_complete',
            'numerical_extraction_complete','source_report_coverage_complete')}
    row.update(result_id=rid,comparison_id=cid,measure=effect['measure'],display_measure=effect['measure'],
        measure_verbatim=None,population=p,population_id=prefix+population['id'],arm=None,arm_id=None,
        experimental_arm=deepcopy(left['arm']),comparator_arm=deepcopy(right['arm']),model_id=None,
        model=None,cutoff=deepcopy(left.get('cutoff')),contrast_type='treatment_comparison',result_relation='between_arm',
        evidence_ids=evidence,main_result_eligible=True,sample_size_basis='sum_binary_arm_denominators' if numeric(effect['analysis_n']) else 'missing',
        original_fact={'field':effect['endpoint'],'result_population_id':population['id'],'arm_id':None,
            'contrast_type':'treatment_comparison','scope':'observed','source_binary_results':[left['result_id'],right['result_id']]},
        quantitative_record=deepcopy(effect),scoped_sample_size={'n':effect['analysis_n'],'basis':'sum_binary_arm_denominators',
            'status':'available' if numeric(effect['analysis_n']) else 'missing','evidence_ids':evidence},
        reported_numbers=[],source_reported_numbers=[])
    row['endpoint']['definition']['evidence_ids']=evidence
    for key,field,role,unit in [('estimate','estimate','estimate',None),('ci_lower','ci_lower','ci_lower',None),
                    ('ci_upper','ci_upper','ci_upper',None),('confidence_level','ci_level','confidence_level','%'),
                    ('analysis_n','analysis_n','sample_size','patients'),('p_value','p_value','p_value',None),
                    ('numerator','numerator','numerator','patients'),('denominator','denominator','denominator','patients')]:
        n=wrap(effect.get(field),role,evidence,unit)
        if n['value'] is not None:
            n.update(status='calculated',derived=True,raw_text=None)
        row[key]=n
    row['denominator_type']='endpoint_specific'
    if cid not in comparisons:
        lc=comparisons[left['comparison_id']];rc=comparisons[right['comparison_id']]
        native=[]
        for comp,observation in ((lc,left),(rc,right)):
            graph=next((comp.get(k+'_native_regimen') for k in ('outcome','intervention','comparator')
                        if (comp.get(k+'_native_regimen') or {}).get('arm_id')==observation['arm']['entity_id']),None)
            if not graph:
                raise ValueError('Calculated treatment comparison missing original arm definition')
            native.append(deepcopy(graph))
        comparison={'comparison_id':cid,'kind':'treatment_comparison','result_relation':'between_arm',
            'scope':{**deepcopy(lc['scope']),'population_id':prefix+population['id']},'result_ids':[],
            'comparator_key':right['arm']['label'],'comparator_label':right['arm']['label'],
            'comparator_arm_id':effect['reference_arm_id'],'intervention_arm_id':effect['intervention_arm_id'],
            'additional_intervention_label':left['arm']['label'],'comparator_drug_ids':[],'intervention_drug_ids':[],
            'additional_intervention_drug_ids':[],'additional_intervention_ids':[],'population':p,
            'comparison_filter_eligible':True,'comparator_filter_eligible':True,
            'intervention_native_regimen':native[0],'comparator_native_regimen':native[1],
            'calculation_method':METHOD}
        article['comparisons'].append(comparison)
        comparisons[cid]=comparison
    comparisons[cid]['result_ids'].append(rid)
    article['quantitative_results'].append(row)


def apply(payload):
    """Rebuild derived comparisons on this public projection, never on the archived GPT record."""
    clinical=payload['clinical_evidence']
    by_pmid={a['pmid']:a for a in clinical['articles']}
    for compact in payload['articles']:
        article=by_pmid[compact['pmid']]
        article['quantitative_results']=[r for r in article['quantitative_results']
                   if r.get('quantitative_record',{}).get('calculation',{}).get('method')!=METHOD]
        article['comparisons']=[c for c in article['comparisons'] if c.get('calculation_method')!=METHOD]
        for wrapper in compact['records']:
            wrapper.pop('calculated_effects',None)
        if not article.get('current_main_eligible'):
            continue
        comparisons={c['comparison_id']:c for c in article['comparisons']}
        by_stage=defaultdict(dict)
        for row in article['quantitative_results']:
            r=row.get('quantitative_record',{})
            if 'percentage' in r and row.get('arm'):
                by_stage[row['review_stage']][r['id']]=row
        candidates=[]
        reported=[]
        from .source_preference import effective_record
        for wrapper in compact['records']:
            record=effective_record(wrapper)
            reported.extend((_scope(record,e),e) for e in record['effects'] if e['origin']=='own_report'
                            and numeric(e['estimate']) and e['measure'] in ('RR','OR'))
            src=by_stage[wrapper['stage']]
            if not src or not record['binary'] or record['study']['comparison_structure']!='comparative':
                continue
            prefix='CE-'+next(iter(src.values()))['review_binding_sha256'][:24]+'-'
            # Include every cited raw-row and denominator span, without scanning
            # the global registry once for every article.
            ids={sid for rows in (record['binary'],record['sample_sizes'])
                 for row in rows for sid in row['evidence']}
            ids.update(record.get('study',{}).get('evidence',[]))
            ids.update((record.get('study_details') or {}).get('evidence',[]))
            ids.update(sid for arm in record['arms'] for sid in arm.get('evidence',[]))
            spans={sid:clinical['evidence_registry'][prefix+sid]['supporting_quote'] for sid in ids
                   if prefix+sid in clinical['evidence_registry']}
            shared_design=' '.join((w['record'].get('study_details') or {}).get('design_description','')
                                   for w in compact['records'])
            for effect in calculate({**wrapper,'record':record},src,spans,article.get('title',''),shared_design):
                candidates.append((wrapper,effect,_scope(record,effect),src))
        candidates=[new for new in candidates if not any(_fuller_concordant(old,new) for old in candidates)]
        kept=[]
        for wrapper,effect,scope,src in sorted(candidates,key=lambda x:(x[0]['stage']=='R3',
                                                    numeric(x[1]['ci_lower'])),reverse=True):
            if any(_same_context(scope,s,effect,e) for s,e in reported):
                continue
            if any(w['stage']!=wrapper['stage'] and _same_context(scope,s,effect,e) for w,e,s in kept):
                continue
            _clinical_projection(article,wrapper['record'],effect,src,comparisons)
            wrapper.setdefault('calculated_effects',[]).append(effect)
            kept.append((wrapper,effect,scope))
    return payload
