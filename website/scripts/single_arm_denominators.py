"""Recover missing endpoint denominators of unadjusted single-arm trial proportions."""
import gzip
import json
import math
import os
import re
import sys
from decimal import Decimal
from pathlib import Path
from statistics import NormalDist

# Methods checked in the corresponding paper, scoped to its stated endpoints.
# These supplement method sentences that are not in the published result excerpts.
REVIEWED = {
    '30134131': ('DCR', 'Clopper–Pearson for clinical benefit rates, Statistical Analysis'),
    '33979178': ('ORR', 'Clopper–Pearson for ORR, Statistical Analysis'),
    '35596181': ('ORR DCR', 'Clopper–Pearson for ORR and DCR, Statistical Analysis'),
    '38900987': ('ORR DCR', 'Clopper–Pearson for ORR and disease control, Statistical Analysis'),
    '39366752': ('ORR DCR', 'Clopper–Pearson for ORR and DCR, Statistical Analysis'),
}
NAMES = {'exact': 'Clopper–Pearson', 'score': 'Wilson', 'wald': 'Wald'}
INVALID = re.compile(r'\bweighted|\badjusted|standardized|kaplan.{0,3}meier|cumulative incidence|competing risk|bayesian|posterior|bootstrap|person[- ](?:years|time)|lesion[- ]level|per lesion|per injection', re.I)


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def precision_band(value, quotes):
    """Keep the coarsest matching printed precision, allowing either rounding tie."""
    normalized = ' '.join(quotes).replace('·', '.').replace('⋅', '.')
    tokens = re.findall(r'(?<![\d.])(?:\d+(?:\.\d+)?|\.\d+)(?!\d)', normalized)
    places = [max(0, -Decimal(t).as_tuple().exponent) for t in tokens if Decimal(t) == Decimal(str(value))]
    if not places:
        return None
    half = 0.5 * 10 ** -min(places)
    return max(0, (value - half) / 100), min(1, (value + half) / 100)


def binomial_tail(k, n, p):
    """P[X<=k]. Evaluate the smaller tail using logarithmic binomial probabilities."""
    if k < 0 or p >= 1 and k < n:
        return 0.0
    if k >= n or p <= 0:
        return 1.0
    if k >= n*p:
        return 1 - lower_tail(n-k-1, n, 1-p)
    return lower_tail(k, n, p)


def lower_tail(k, n, p):
    if k < 0 or p >= 1:
        return 0.
    if p <= 0:
        return 1.
    log_term = math.lgamma(n+1)-math.lgamma(k+1)-math.lgamma(n-k+1)+k*math.log(p)+(n-k)*math.log1p(-p)
    term = math.exp(log_term)
    total = term
    for i in range(k, 0, -1):
        term *= i / (n-i+1) * ((1-p)/p)
        total += term
        if term <= total*1e-15:
            break
    return total


def interval_matches(method, k, n, low, high, alpha, z):
    eps=1e-12
    if method == 'exact':
        # A CP endpoint solves a one-sided tail probability of alpha/2.
        # Testing the printed rounding bins avoids numerical inverse-beta searches.
        return ((low[0] == 0 if k == 0 else
                 binomial_tail(k-1,n,low[0])+eps >= 1-alpha/2 >= binomial_tail(k-1,n,low[1])-eps)
                and (high[1] == 1 if k == n else
                     binomial_tail(k,n,high[0])+eps >= alpha/2 >= binomial_tail(k,n,high[1])-eps))
    p=k/n
    if method=='wald':
        center=p
        half=z*math.sqrt(p*(1-p)/n)
    else:
        scale=1+z*z/n
        center=(p+z*z/(2*n))/scale
        half=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/scale
    return low[0]-eps<=max(0,center-half)<=low[1]+eps and high[0]-eps<=min(1,center+half)<=high[1]+eps


def n_from_count(rate, count):
    if count is None or count<=0 or rate[0]<=0:
        return None
    smallest=max(count,math.ceil(count/rate[1]-1e-9))
    largest=math.floor(count/rate[0]+1e-9)
    if smallest==largest:
        return {'n':smallest,'range':[smallest,smallest],'status':'derived',
                'methods':['reported count and percentage']}
    return None


def infer(rate, low, high, level, count, known_method=None):
    if not 0<level<100 or low[0]>=high[1]:
        return None
    alpha=1-level/100
    z=NormalDist().inv_cdf(1-alpha/2)
    # At either reported limit, Hoeffding bounds a CP tail. Wilson's inverted
    # score and Wald's standard error are bounded by z/(2 sqrt(n)).
    # This is a proof of the search ceiling; never use a truncated enumeration.
    gap=max(rate[0]-low[1],high[0]-rate[1])
    if gap<=0:
        return None
    upper=math.ceil(max(-math.log(alpha/2)/2,z*z/4)/gap**2)+1
    if count is not None and count>0 and rate[0]>0:
        upper=min(upper,math.floor(count/rate[0]+1e-9))
    if upper>20000:
        return None
    methods=(known_method,) if known_method else tuple(NAMES)
    compatible={}
    for n in range(1,upper+1):
        start=max(0,math.ceil(n*rate[0]-1e-10))
        end=min(n,math.floor(n*rate[1]+1e-10))
        if count is not None:
            start=max(start,count)
            end=min(end,count)
        for k in range(start,end+1):
            for method in methods:
                if interval_matches(method,k,n,low,high,alpha,z):
                    compatible.setdefault(n,set()).add(method)
    if not compatible:
        return None
    ns=sorted(compatible)
    return {'n':ns[(len(ns)-1)//2],'range':[ns[0],ns[-1]],
            'status':'derived' if known_method and len(ns)==1 else 'approximate',
            'methods':[NAMES[m] for m in methods if any(m in matches for matches in compatible.values())]}


def scoped_method(pmid, endpoint, quotes):
    check=REVIEWED.get(pmid)
    if check and endpoint in check[0].split():
        return 'exact',check[1]
    # Match an explicitly named method and its endpoint in the same sentence.
    # Generic "exact" alone permits several constructions for discrete data.
    terms={'ORR':r'\bORR\b|response rates?', 'DCR':r'\bDCR\b|disease control rates?', 'PR':r'partial response', 'CR':r'complete response'}
    if endpoint not in terms:
        return None,None
    methods=set()
    for sentence in re.split(r'[\n;]|(?<=[.!?])\s+(?=[A-Z])',' '.join(quotes)):
        if not re.search(terms[endpoint],sentence,re.I) or re.search(r'one[- ]sided|continuity|sample size|planned|assuming',sentence,re.I):
            continue
        for name,pattern in [('exact',r'Clopper.{0,3}Pearson'),('score',r'Wilson'),('wald',r'\bWald\b')]:
            if re.search(pattern,sentence,re.I):methods.add(name)
    if len(methods)==1:
        return methods.pop(),'Method specified in the cited result passage'
    return None,None


def recover(row, article, wrapper, registry, reviews):
    q=row.get('quantitative_record') or {}
    if (not row.get('main_result_eligible') or row.get('contrast_type')!='single_arm'
        or row.get('result_relation')!='arm_specific' or q.get('origin')!='own_report'
        or row.get('scoped_sample_size',{}).get('status')!='missing'
        or q.get('display_n',{}).get('status')=='CONFLICTING' or row.get('extraction_conflict')
        or number(q.get('denominator')) or number(q.get('analysis_n')) or q.get('derived_ci')
        or q.get('complementary_count_scope')=='source_reviewed_unavailable'):
        return None
    s=wrapper['record']['study']
    # Do not relabel patients pooled from different trials as a single-arm trial.
    if article['pmid']=='30202085' or re.search(r'pooled analysis (?:of|from) (?:two|three|four|multiple|several) (?:clinical )?(?:trials|studies)',article.get('title',''),re.I):
        return None
    if s.get('study_type')!='interventional_trial' or s.get('comparison_structure')!='single_group':
        return None
    if 'percentage' not in q or not all(number(q.get(k)) for k in ('ci_lower','ci_upper')):
        return None
    inputs=[q[k] for k in ('percentage','ci_lower','ci_upper','ci_level','numerator')]
    review=reviews.get(row['result_id'])
    if review and review['pmid']==article['pmid'] and review['values']==inputs:
        result={'n':review['n'],'range':[review['n'],review['n']],'status':review['status'],
                'methods':['source verification'],'method_source':review['source'],'url':review['url']}
        if 'percentage' in review:
            result['reported_percentage']=review['percentage']
        return result
    if not number(q['percentage']):
        return None
    p,l,h=(q[k] for k in ('percentage','ci_lower','ci_upper'))
    if not 0<=l<=p<=h<=100 or l==h or INVALID.search(str(q.get('endpoint_definition',''))):
        return None
    if any(flag.get('field') in ('percentage','numerator','ci_lower','ci_upper') for flag in q.get('field_flags',[])):
        return None
    quotes=[registry.get(i,{}).get('supporting_quote','') for i in row.get('evidence_ids',[])]
    bands=[precision_band(v,quotes) for v in (p,l,h)]
    if any(b is None for b in bands):return None
    level=q.get('ci_level')
    fixed=q.get('numerator') if type(q.get('numerator')) is int and q.get('numerator')>=0 else None
    direct=n_from_count(bands[0],fixed)
    if direct:
        return direct
    if not number(level) or any(f.get('field')=='ci_level' for f in q.get('field_flags',[])):return None
    method,source=scoped_method(article['pmid'],q['endpoint'],quotes)
    result=infer(*bands,level,fixed,method)
    if result and source:result['method_source']=source
    return result


def build(payload, reviewed=()):
    reviews_by_result={r['result_id']:r for r in reviewed}
    reviews={a['pmid']:{w['record']['source_sha256']:w for w in a['records']} for a in payload.get('articles',[])}
    clinical=payload.get('clinical_evidence') or {}
    registry=clinical.get('evidence_registry',{})
    index={}
    for article in clinical.get('articles',[]):
        if not article.get('current_main_eligible') or article.get('current_screening_status')!='retain':continue
        for row in article.get('quantitative_results',[]):
            wrapper=reviews.get(article['pmid'],{}).get(row.get('source_input_sha256'))
            if not wrapper:continue
            result=recover(row,article,wrapper,registry,reviews_by_result)
            if result:
                q=row['quantitative_record']
                result['input']=[q['percentage'],q['ci_lower'],q['ci_upper'],q['ci_level'],q['numerator']]
                result['scope']=[article['pmid'],row['source_input_sha256'],q['endpoint'],q['population_id'],q['arm_id']]
                index[row['result_id']]=result
    return index


def publish(root):
    target=root/'website/dist/data/quantitative_extraction.json'
    reviews=root/'config/single_arm_denominator_reviews.json'
    reviewed=json.loads(reviews.read_text()) if reviews.is_file() else []
    opener=open if target.exists() else gzip.open
    with opener(target if target.exists() else target.with_suffix('.json.gz'),'rb') as f:
        index=build(json.load(f),reviewed)
    contents=('/* Endpoint-specific single-arm trial denominators generated from the saved quantitative evidence. */\n'
              '(function(root){const rows=Object.freeze('+json.dumps(index,separators=(',',':'),sort_keys=True,ensure_ascii=False)+');\n'
              "if(typeof module==='object'&&module.exports)module.exports=rows;else root.SingleArmDenominators=rows;})(globalThis);\n")
    dest=root/'website/dist/single_arm_denominators.js'
    if not dest.exists() or contents!=dest.read_text():
        tmp=dest.with_suffix('.tmp-'+str(os.getpid()))
        tmp.write_text(contents)
        tmp.replace(dest)
    return index


if __name__=='__main__':
    publish(Path(sys.argv[1]).resolve())
