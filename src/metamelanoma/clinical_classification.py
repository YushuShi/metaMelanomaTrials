"""Versioned source-bound advanced-filter classifications. No model transport.

The result, its population and explicit arm own these attributes. Registry
identity is a conservative count key, never a claim of pooling compatibility.
Raw extractions and numerical results are not changed.
"""
from __future__ import annotations
from collections import Counter, defaultdict
from copy import deepcopy
import argparse
import json
import re
from pathlib import Path

from .io import atomic_bytes, canonical, digest, owned

SCHEMA_VERSION = 1
CLASSIFICATION_VERSION = '1.1.1'
PUBLIC = 'website/dist/data/clinical_classifications.json'
SOURCE = 'website/dist/data/quantitative_extraction.json'
FIELDS = ('setting', 'stage', 'subtype', 'braf', 'advanced_line', 'baseline_ldh')
CATEGORIES = {
    'setting': ('neoadjuvant_perioperative', 'adjuvant_resected', 'unresectable_metastatic'),
    'stage': ('i', 'ii', 'iii', 'iv'),
    'subtype': ('cutaneous', 'mucosal', 'uveal'),
    'braf': ('mutated', 'wild_type'),
    'advanced_line': ('first_line', 'second_or_later'),
    'baseline_ldh': ('normal', 'elevated'),
}


def norm(value):
    text=re.sub(r'\s+', ' ', str(value or '').replace('–', '-').replace('−', '-').replace('—', '-')).strip().lower()
    return re.sub(r'\bbraf(?=v\d)', 'braf ', text)


def has(pattern, text):
    return bool(re.search(pattern, text, re.I))


def na(reason='not_reported', *, details=None, evidence_ids=()):
    return {'status': 'NA', 'categories': [], 'reason': reason, 'details': details or {},
            'evidence_ids': list(evidence_ids), 'inherited_from': None}


def fact(categories, *, evidence_ids, wording, reason='source_supported_population', details=None):
    values = sorted(set(categories))
    return {'status': 'supported' if len(values) == 1 else 'mixed', 'categories': values,
            'reason': reason if len(values) == 1 else 'inseparable_mixed_population',
            'details': {'original_wording': wording, **(details or {})},
            'evidence_ids': sorted(set(evidence_ids)), 'inherited_from': None}


def without_negated_traits(field, value):
    """Remove only explicit negated traits; their opposite is not established."""
    text=norm(value);negated=set()
    patterns={
        'braf': {
            'mutated': r'\b(?:(?:not|no|without)[- ]+|non[- ]*)(?:a |any )?braf[- ]+(?:mutant|mutated|mutations?)\b|\bbraf(?: status)?[- ]+(?:is |was |were )?(?:not[- ]+|non[- ]*)(?:mutant|mutated|mutations?)\b|\b(?:(?:not|no|without)[- ]+|non[- ]*)(?:mutant|mutated)[- ]+braf\b',
            'wild_type': r'\b(?:not[- ]+|non[- ]*)braf[- ]+(?:wild[- ]?type|wt)\b|\bbraf(?: status)?[- ]+(?:is |was |were )?(?:not[- ]+|non[- ]*)(?:wild[- ]?type|wt)\b',
        },
        'baseline_ldh': {
            'elevated': r'\b(?:(?:not|no|without)[- ]+|non[- ]*)(?:elevated|elevation(?: of)?)[- ]+(?:baseline[- ]+|serum[- ]+)?ldh\b|\bldh(?: levels?)?(?: at baseline)?(?: (?:is|was|were))?[- :,/]+(?:not[- ]+|non[- ]*)elevated\b',
            'normal': r'\b(?:not[- ]+|non[- ]*)normal[- ]+(?:baseline[- ]+|serum[- ]+)?ldh\b|\bldh(?: levels?)?(?: at baseline)?(?: (?:is|was|were))?[- :,/]+(?:not[- ]+|non[- ]*)normal\b',
        },
    }
    # Negation without the relevant biomarker is not evidence about this field.
    if field=='braf' and not has(r'\bbraf\b',text):return text,negated
    if field=='baseline_ldh' and not has(r'\bldh\b|lactate dehydrogenase',text):return text,negated
    for category,pattern in patterns.get(field,{}).items():
        pattern=r'(?<!with or )(?<!with and )(?:'+pattern+')'
        if has(pattern,text):
            negated.add(category)
            # Preserve the biomarker context for an independently explicit state.
            text=re.sub(pattern,' braf ' if field=='braf' else ' ldh ',text,flags=re.I)
    return text,negated


def stage_mentions(value):
    """Explicit disease stages only: phase, Clark level and metastatic are not stages."""
    text=re.sub(r'<[^>]+>',' ',norm(value))
    text=re.sub(r'\((?:unresectable|resectable|resected|completely resected)\)',' ',text)
    text=text.replace('(',' ').replace(')',' ')
    token=r'(?:iv|iii|ii|i|[1-4])[a-d]?'
    body=token+r'(?:\s*(?:/|,(?:\s*(?:and|or))?|and|or|to|through|-)\s*(?:stages?\s*)?(?:'+token+r'|[a-d]))*'
    spans=[]
    for m in re.finditer(r'\bstages?(?:\s+at (?:initial )?(?:diagnosis|presentation|baseline))?\s*[:=-]?\s*('+body+r')\b',text):
        if has(r'(?:not|non|excluding|excluded|without)[- ]+$',text[max(0,m.start()-20):m.start()]):continue
        spans.append(m.group(1))
    # Explicit substages may be used as compact population labels, without "stage".
    for m in re.finditer(r'\biii[a-d](?:\s*[-/]\s*(?:iii)?[a-d])?\b',text):
        if has(r'\bphase\s*$',text[max(0,m.start()-15):m.start()]):continue
        if has(r'(?:not|non|excluding|excluded|without)[- ]+$',text[max(0,m.start()-20):m.start()]):continue
        spans.append(m.group())
    values=set();ordered=['i','ii','iii','iv']
    for span in spans:
        tokens=re.findall(r'\b(iv|iii|ii|i|[1-4])[a-d]?\b',span)
        majors=[ordered[int(t)-1] if t.isdigit() else t for t in tokens]
        values.update(majors)
        if len(majors)==2 and has(r'-|\bto\b|\bthrough\b',span):
            lo,hi=sorted(ordered.index(t) for t in majors);values.update(ordered[lo:hi+1])
    return values,sorted(set(spans))


def labels(field, value):
    """Parse an explicit scoped descriptor, not an entire paper/title search."""
    text, _ = without_negated_traits(field, value)
    if not text or text == 'na': return set()
    out = set()
    if field == 'stage':
        return stage_mentions(text)[0]
    if field == 'setting':
        # Prior adjuvant exposure is history, not the current treatment setting.
        text = re.sub(r'(?:previous|prior|previously received|after (?:completion of )?)\s+adjuvant\s+(?:therapy|treatment|immunotherapy)', '', text)
        neo = has(r'\b(?:neo-?adjuvant|peri-?operative|pre-?operative)\b|before (?:planned |definitive )?(?:surgery|resection)', text)
        adj = has(r'\badjuvant\b', text)
        if neo:
            out.add('neoadjuvant_perioperative')
            if adj and has(r'versus|\bvs\.?\b|adjuvant[- ]only|or (?:to )?surgery followed by', text): out.add('adjuvant_resected')
        elif adj or has(r'after (?:definitive )?(?:surgery|resection)',text): out.add('adjuvant_resected')
        elif has(r'\bunresectable\b|\binoperable\b|\bmetastatic\b|\badvanced\b', text) and not has(r'\b(?:completely |fully )?resected\b|no evidence of disease|\bned\b', text):
            out.add('unresectable_metastatic')
    elif field == 'subtype':
        text = re.sub(r'\b(?:excluding|excluded|without|non[- ])\s*(?:uveal|ocular|mucosal|cutaneous)(?: melanoma)?', '', text)
        if has(r'\bcutaneous\b|\bacral\b|\bskin melanoma\b', text): out.add('cutaneous')
        if has(r'\bmucosal\b', text): out.add('mucosal')
        if has(r'\buveal\b|\bchoroidal\b|\bocular melanoma\b', text): out.add('uveal')
    elif field == 'braf':
        if has(r'\bbraf\b', text):
            if has(r'\b(?:wild[- ]?type|wt|mutation[- ]negative|non[- ]mutat)', text): out.add('wild_type')
            if has(r'\b(?:mutant|mutated|mutation[- ]positive|mutations? (?:positive|present)|v600[ekrd])\b', text): out.add('mutated')
            if has(r'\bbraf(?:[- ]v\d+[a-z]*)?[- ]mutations?\b', text) and not has(r'negative|absence|absent|without|no braf', text): out.add('mutated')
    elif field == 'advanced_line':
        if has(r'\bfirst[- ]line\b|\b1l\b|(?:previously |systemically )?untreated[, ]+(?:advanced|metastatic|unresectable)', text): out.add('first_line')
        if has(r'\b(?:second|third|fourth|later|subsequent)[- ]line\b|\b[2-9]l\b|previous(?:ly)? (?:systemic )?treat(?:ment|ed) (?:for|of) (?:advanced|metastatic|unresectable)', text): out.add('second_or_later')
    elif field == 'baseline_ldh':
        text=re.sub(r'(?:upper|lower) limit of normal', 'uln', text)
        if has(r'\bldh\b|lactate dehydrogenase', text):
            if has(r'\bnormal\b|within (?:the )?(?:normal|reference) range|(?:≤|<=)\s*1\s*(?:x|×)?\s*(?:uln|upper limit)|(?:≤|<=)\s*(?:uln|upper limit)', text): out.add('normal')
            if has(r'\belevated\b|\babove\b|(?:(?<![<≥])>|≥\s*(?=2))\s*(?:1|2)?\s*(?:x|×)?\s*(?:uln|upper limit)|greater than (?:the )?(?:uln|upper limit|[12]\s*(?:x|times)?\s*uln)', text): out.add('elevated')
    return out


def limited_braf_negative(text):
    text = norm(text)
    return has(r'(?:braf.{0,12})?v600(?:[a-z](?:/[a-z])?)?.{0,35}(?:negative|wild[- ]?type|absen|not detected)|(?:no|without|absence of).{0,20}braf.{0,12}v600', text)


def evidence_quotes(ids, registry, prefix):
    return [(i, registry[i]['supporting_quote']) for i in dict.fromkeys(ids)
            if i.startswith(prefix) and i in registry and registry[i].get('source_id')
            and registry[i].get('block_id') and isinstance(registry[i].get('supporting_quote'), str)]


def direct(field, wording, proofs, *, baseline_context=()):
    values = labels(field, wording)
    detail = {'original_wording': wording}
    _,negated=without_negated_traits(field,wording)
    source_negated=[(i,t) for i,t in proofs if without_negated_traits(field,t)[1] and not labels(field,t)]
    if field == 'setting' and has(r'\bincomplete(?:ly)?\s+(?:(?:surgical|tumou?r)\s+)?resect(?:ion|ed)\b|\bnot completely resected\b|\bwithout complete resection\b',wording):
        return na('complete_resection_explicitly_not_established',details=detail)
    if field == 'stage' and has(r'\b(?:unknown|unreported|not reported|undetermined)\s+stage\b|\bstage\s+(?:unknown|unreported|not reported|undetermined)\b|\b(?:not|non|excluding|excluded|without)[- ]+stage',wording):
        return na('stage_unknown_or_negated',details=detail)
    if field == 'stage' and len(values)==1 and has(r'\bstage\s+(?:iv|iii|ii|i|[1-4])[a-d]?\s+(?:or|and)\s+(?:metastatic|advanced|recurrent|unresectable)\b',norm(wording)):
        return na('inseparable_other_population_without_explicit_stage',details=detail)
    if field == 'braf' and limited_braf_negative(wording):
        return na('limited_BRAF_testing_scope', details={**detail, 'testing_scope': 'BRAF V600 only'})
    if has(r'unknown|not reported|not tested|unavailable|undetermined',wording) and ((field=='braf' and has(r'braf',wording)) or (field=='baseline_ldh' and has(r'ldh|lactate dehydrogenase',wording)) or (field=='subtype' and has(r'unknown primary|unknown subtype',wording))):
        return na('explicitly_unknown',details=detail)
    if not values:
        if negated or source_negated:
            return na('explicit_trait_negation',details=detail,evidence_ids=[i for i,_ in source_negated])
        return na(details=detail)
    if field == 'braf' and 'wild_type' in values and limited_braf_negative(wording):
        return na('limited_BRAF_testing_scope', details={**detail, 'testing_scope': 'BRAF V600 only'})
    supporting = [(i, text) for i, text in proofs if values <= labels(field, text)]
    # A short normalized population label can refine the source's longer statement.
    if not supporting:
        if any(values & without_negated_traits(field,t)[1] for _,t in source_negated):
            return na('source_trait_negated',details=detail,evidence_ids=[i for i,_ in source_negated])
        return na('descriptor_not_confirmed_by_bound_source', details=detail)
    if field == 'setting' and 'adjuvant_resected' in values:
        supporting = [(i, t) for i, t in supporting if has(r'\b(?:completely |fully |radically )?resected\b|\bcomplete (?:surgical )?resection|after (?:definitive )?surgery|following (?:complete )?(?:resection|surgery)|no evidence of disease|(?:surgery|resection) followed by.{0,140}adjuvant', t)]
        supporting=[(i,t) for i,t in supporting if not has(r'\bincomplete(?:ly)?\s+(?:(?:surgical|tumou?r)\s+)?resect(?:ion|ed)\b|\bnot completely resected\b|\bwithout complete resection\b',t)]
        if not supporting: return na('complete_resection_not_established', details=detail)
    if field == 'braf' and 'wild_type' in values:
        broad = [(i,t) for i,t in supporting if not limited_braf_negative(t)]
        if not broad: return na('limited_BRAF_testing_scope', details={**detail, 'testing_scope':'BRAF V600 only'}, evidence_ids=[i for i,_ in supporting])
        supporting = broad
    if field == 'baseline_ldh':
        if has(r'on[- ]treatment|at progression|after (?:treatment|therapy)|post[- ]treatment', wording):
            return na('not_baseline_LDH', details=detail)
        baseline = [(i,t) for i,t in [*supporting,*baseline_context] if has(r'(?:baseline characteristics|baseline demographics).{0,15000}(?:\bldh\b|lactate dehydrogenase)|(?:baseline|pre[- ]?treatment).{0,100}(?:\bldh\b|lactate dehydrogenase)|(?:\bldh\b|lactate dehydrogenase).{0,100}(?:at baseline|before (?:treatment|therapy))', t)]
        if not baseline: return na('baseline_timing_not_established', details=detail)
        supporting = list(dict(supporting + baseline).items())
        detail['reported_thresholds'] = re.findall(r'(?:>|<|≤|≥|>=|<=)\s*[\d.]*\s*(?:x|×)?\s*(?:uln|upper limit of normal)|(?:normal|elevated) ldh', norm(wording))
        detail['overlap_warning'] = 'Elevated LDH thresholds can overlap; do not count or pool them as independent cohorts.'
    if field == 'braf':
        detail['reported_variants'] = sorted(set(re.findall(r'\bv\d+[a-z](?:/[a-z])?\b', norm(wording + ' ' + ' '.join(t for _,t in supporting)))))
        detail['testing_scope'] = 'As reported; source evidence retained'
    if field == 'stage':
        detail['reported_stages']=stage_mentions(wording)[1]
        detail['staging_edition_wording']=sorted(set(re.findall(r'\b(?:ajcc|uicc).{0,50}?\b(?:[1-9](?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)[- ]edition\b|\b(?:[1-9](?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)[- ]edition.{0,30}?\b(?:ajcc|uicc)\b',norm(wording+' '+' '.join(t for _,t in supporting)))))
        detail['stage_scope']='Reported disease stage for this population; not inferred from setting or treatment.'
        detail['reported_stage_timing']=sorted(set(re.findall(r'\bat (?:initial )?(?:diagnosis|presentation|baseline)\b',norm(wording))))
    return fact(values, evidence_ids=[i for i,_ in supporting], wording=wording, details=detail)


class RecordContext:
    def __init__(self, raw, binding, registry):
        self.raw, self.binding, self.registry = raw, binding, registry
        self.prefix = 'CE-' + binding[:24] + '-'
        self.pops = {p['id']:p for p in raw.get('populations', [])}
        self.arms = {a['id']:a for a in raw.get('arms', [])}
        self.cache = {}
        self.abbreviations=[]
        for pattern,alias,expansion in [(r'metastatic uveal melanoma\s*\(mUM\)',r'\bmUM\b','metastatic uveal melanoma'),
                                         (r'uveal melanoma\s*\(UM\)',r'\bUM\b','uveal melanoma')]:
            definitions=[(i,v['supporting_quote']) for i,v in registry.items() if i.startswith(self.prefix) and has(pattern,v.get('supporting_quote',''))]
            if definitions:self.abbreviations.append((alias,expansion,definitions[0]))
        self.study_proofs = self.proofs(raw.get('study', {}).get('evidence', []))
        self.common = self.common_fields()

    def proofs(self, ids):
        proofs=evidence_quotes([self.prefix+i for i in ids], self.registry, self.prefix)
        out=[]
        for ident,quote in proofs:
            for pattern,expansion,definition in self.abbreviations:
                if re.search(pattern,quote):
                    quote=re.sub(pattern,expansion,quote);out.append(definition)
            out.append((ident,quote))
        return list(dict(out).items())

    def common_fields(self):
        study = self.raw.get('study', {})
        mapping = {'setting': ('setting', {'neoadjuvant':'neoadjuvant', 'perioperative':'perioperative', 'adjuvant':'adjuvant', 'advanced':'advanced metastatic disease'}),
                   'subtype': ('melanoma_subtype', {'cutaneous':'cutaneous melanoma','mucosal':'mucosal melanoma','uveal':'uveal melanoma'}),
                   'braf': ('braf', {'mutant':'BRAF-mutant','wild_type':'BRAF wild-type'})}
        out = {f:na() for f in FIELDS}
        for f,(key,words) in mapping.items():
            value = study.get(key)
            if value == 'mixed':
                out[f] = {'status':'mixed','categories':[], 'reason':'study_reports_mixed_population', 'details':{'study_value':value},'evidence_ids':[i for i,_ in self.study_proofs],'inherited_from':None}
                continue
            if value not in words: continue
            candidate = direct(f, words[value], self.study_proofs)
            if f == 'setting' and value == 'adjuvant' and candidate['status'] != 'supported':
                # Some abstracts describe the resected trial population and its
                # primary recurrence-free endpoint without repeating "adjuvant".
                # Require both bound statements plus the accepted study setting;
                # resected history or disease stage alone is not sufficient.
                resected = [(i,t) for i,t in self.study_proofs
                            if has(r'\bpatients? with (?:completely |fully |radically )?resected stage\b', t)
                            and not has(r'\bincomplete(?:ly)?\b|not completely resected|without complete resection|\bunresectable\b', t)]
                recurrence = [(i,t) for i,t in self.study_proofs
                              if has(r'primary (?:end ?point|outcome).{0,100}recurrence[- ]free survival', t)]
                if resected and recurrence:
                    supporting = list(dict(resected + recurrence).items())
                    candidate = fact(['adjuvant_resected'], evidence_ids=[i for i,_ in supporting],
                                     wording='Adjuvant treatment of a resected trial population',
                                     reason='source_supported_resected_recurrence_trial',
                                     details={'support_basis':'Accepted adjuvant study setting; bound resected-patient and primary recurrence-free endpoint statements'})
            if candidate['status'] != 'supported': continue
            # A study descriptor cannot homogenize explicitly different enrolled populations.
            different = set().union(*(labels(f,p.get('label')) for p in self.pops.values())) - set(candidate['categories'])
            if different:
                out[f] = na('study_descriptor_not_uniform_across_populations', details={'study_value':value,'other_population_categories':sorted(different)})
                continue
            # Study metadata describes this entire report, but requires a source statement
            # about enrollment/eligibility/cohort rather than a title/background mention.
            proofs = [(i,t) for i,t in self.study_proofs if i in candidate['evidence_ids'] and has(r'\bpatients?\b|\bparticipants?\b|\bsubjects?\b|\bcohort\b|\benrolled\b|\brandom',t)]
            if proofs:
                candidate['evidence_ids']=[i for i,_ in proofs]
                candidate['reason']='source_supported_whole_study_population'
                candidate['details']['study_value']=value
                out[f]=candidate
        # Untreated alone may refer to earlier-stage treatment; explicit advanced context is required.
        if study.get('previous_systemic') in ('untreated','previously_treated'):
            statements=[]
            for i,t in self.study_proofs:
                for sentence in re.split(r'(?<=[.;])\s+',t):
                    expected='first_line' if study['previous_systemic']=='untreated' else 'second_or_later'
                    if not has(r'^background:|preferred|recommend',sentence) and has(r'\benrolled\b|\brandom(?:ized|ly assigned)\b|\breceived\b|\bscreened\b',sentence) and labels('advanced_line',sentence)=={expected}:statements.append((i,sentence))
            choices=set().union(*(labels('advanced_line',t) for _,t in statements))
            if len(choices)==1 and out['setting']['categories']==['unresectable_metastatic']:
                out['advanced_line']=fact(choices,evidence_ids=[i for i,_ in statements],wording=' | '.join(t for _,t in statements),reason='source_supported_whole_study_population')
        arm_values=[self.arm_explicit_setting(a) for a in self.arms.values()]
        represented=sorted({c for v in arm_values if v['status']=='supported' for c in v['categories']})
        for _,quote in self.study_proofs:
            if has(r'random(?:ized|ly assigned)|assigned to',quote) and len(labels('setting',quote))>1:
                represented=sorted(set(represented)|labels('setting',quote))
        if len(represented)>1:
            out['setting']=fact(represented,evidence_ids=[e for v in arm_values for e in v['evidence_ids']],wording='Different settings explicitly represented by treatment arms')
        return out

    def population(self, ident, seen=()):
        if ident in self.cache:return deepcopy(self.cache[ident])
        p=self.pops.get(ident)
        if not p or ident in seen:return {f:na('missing_or_cyclic_population') for f in FIELDS}
        proofs=self.proofs(p.get('evidence',[]));wording=p.get('label','')
        fields={f:direct(f,wording,proofs,baseline_context=self.study_proofs) for f in FIELDS}
        parent=p.get('parent_id')
        inherited=self.population(parent,(*seen,ident)) if parent in self.pops else self.common
        for f in FIELDS:
            if fields[f]['status']=='NA' and (fields[f]['reason']=='not_reported' or fields[f]['reason']=='descriptor_not_confirmed_by_bound_source' and labels(f,wording) <= set(inherited[f]['categories'])) and inherited[f]['status']=='supported':
                fields[f]=deepcopy(inherited[f]);fields[f]['inherited_from']=self.prefix+parent if parent in self.pops else 'study:'+self.binding
                fields[f]['reason']='whole_parent_population_inheritance'
            elif fields[f]['status']=='NA' and fields[f]['reason']=='not_reported' and inherited[f]['status']=='mixed':
                fields[f]=deepcopy(inherited[f]);fields[f]['inherited_from']=self.prefix+parent if parent in self.pops else 'study:'+self.binding
        if fields['setting']['status']=='supported' and set(fields['setting']['categories']) <= {'neoadjuvant_perioperative','adjuvant_resected'}:
            fields['advanced_line']=na('not_applicable_to_exclusively_neoadjuvant_or_adjuvant_population')
        elif fields['advanced_line']['status']=='supported' and fields['setting']['categories']!=['unresectable_metastatic']:
            fields['advanced_line']=na('advanced_disease_context_not_established',details=fields['advanced_line']['details'],evidence_ids=fields['advanced_line']['evidence_ids'])
        self.cache[ident]=deepcopy(fields);return fields

    def arm_explicit_setting(self, arm):
        wording=arm.get('label','')+'; '+'; '.join(str(n.get('schedule','')) for n in arm.get('nodes',[]) if n.get('schedule') not in (None,'NA'))
        nodes={n['id']:n for n in arm.get('nodes',[])};root=nodes.get(arm.get('root_id'),{})
        if root.get('kind')=='SEQUENTIAL':
            kinds=[nodes.get(i,{}) for i in root.get('children',[])]
            surgery=[i for i,n in enumerate(kinds) if norm(n.get('name')) in ('surgery','resection','definitive surgery')]
            if len(surgery)==1:
                index=surgery[0]
                if index>0 and any(n.get('kind') in ('drug','class','AND') for n in kinds[:index]):wording+='; treatment before surgery (neoadjuvant/perioperative)'
                elif index==0 and any(n.get('kind') in ('drug','class','AND') for n in kinds[1:]):wording+='; adjuvant treatment after surgery'
        value=direct('setting',wording,self.proofs(arm.get('evidence',[])))
        if value['status']=='supported':value['details']['arm_id']=self.prefix+arm['id']
        return value

    def arm_setting(self, ident):
        arm=self.arms.get(ident)
        if not arm:return na('arm_not_reported')
        value=self.arm_explicit_setting(arm)
        return value if value['status']!='NA' or value['reason']!='not_reported' else self.population(arm.get('population_id'))['setting']

    def independence(self):
        own=self.raw.get('study',{}).get('identifiers',[])
        valid=[];evidence=[]
        for row in own:
            ident=re.sub(r'\s+','',str(row.get('id',''))).upper()
            if not re.fullmatch(r'NCT\d{8}|ISRCTN\d{8}',ident):continue
            supports=[i for i,t in self.study_proofs if ident in re.sub(r'\s+','',t).upper() and has(r'\btrial\b|\bstudy\b|registered|clinicaltrials',t)]
            if supports:valid.append(ident);evidence.extend(supports)
        valid=sorted(set(valid))
        return {'verified':len(valid)==1 and len(own)==1,'cohort_ids':['trial:'+i for i in valid],
                'overlap_ids':['trial:'+i for i in valid], 'evidence_ids':sorted(set(evidence)),
                'reason':'single_source_supported_own_trial_registration' if len(valid)==1 and len(own)==1 else 'no_unique_source_supported_trial_identity',
                'pooling_compatibility_verified':False}

    def entry(self, q):
        rawq=q.get('quantitative_record',{});pop=rawq.get('population_id')
        fields=self.population(pop);arm_settings={}
        if rawq.get('intervention_arm_id') in self.arms and rawq.get('reference_arm_id') in self.arms:
            arm_settings={self.prefix+rawq[role]:self.arm_setting(rawq[role]) for role in ('intervention_arm_id','reference_arm_id')}
        elif rawq.get('arm_id') in self.arms:
            arm_settings={self.prefix+rawq['arm_id']:self.arm_setting(rawq['arm_id'])}
        cross=False
        if arm_settings and all(v['status']=='supported' for v in arm_settings.values()):
            cats=sorted({c for v in arm_settings.values() for c in v['categories']})
            if len(cats)>1 and len(arm_settings)==2:
                cross=True;fields['setting']=fact(cats,evidence_ids=[e for v in arm_settings.values() for e in v['evidence_ids']],wording='Comparison spans different treatment settings')
                fields['setting'].update(status='supported',reason='source_supported_cross_setting_comparison')
            elif len(cats)==1:
                fields['setting']=deepcopy(next(iter(arm_settings.values())))
        if fields['setting']['status']=='supported' and set(fields['setting']['categories']) <= {'neoadjuvant_perioperative','adjuvant_resected'}:
            fields['advanced_line']=na('not_applicable_to_exclusively_neoadjuvant_or_adjuvant_population')
        return {'pmid':q['pmid'],'report_id':q['report_id'],'population_id':q['population_id'],
                'raw_population_id':pop,'raw_population_scope':self.pops.get(pop,{}).get('scope'),'raw_population_label':self.pops.get(pop,{}).get('label'),'review_binding_sha256':q['review_binding_sha256'],
                'source_input_sha256':q['source_input_sha256'],'review_stage':q['review_stage'],
                'fields':fields,'arm_settings':arm_settings,'cross_setting_comparison':cross,
                'independence':self.independence()}

    def result(self, q):
        return {**self.entry(q),'result_id':q['result_id']}

    def sample(self, q):
        raw=q.get('quantitative_record',{})
        return {**self.entry(q),'sample_record_id':q['sample_record_id'],'raw_sample_id':raw['id'],
                'arm_id':q.get('arm_id'),'raw_arm_id':raw.get('arm_id')}


def build(payload, *, source_file_sha256):
    clinical=payload.get('clinical_evidence',{});registry=clinical.get('evidence_registry',{})
    contexts={};by_prefix=defaultdict(dict)
    for ident,anchor in registry.items():by_prefix[ident[:28]][ident]=anchor
    for article in payload.get('articles',[]):
        for review in article.get('records',[]):
            raw=review['record'];binding=digest(canonical({'task_id':review['task_id'],'record':raw}))
            contexts[binding]=RecordContext(raw,binding,by_prefix['CE-'+binding[:24]+'-'])
    results={};samples={};used=set();counts={f:Counter() for f in FIELDS};sample_counts={f:Counter() for f in FIELDS}
    for article in clinical.get('articles',[]):
        for q in article.get('quantitative_results',[]):
            ctx=contexts.get(q.get('review_binding_sha256'))
            if not ctx or ctx.raw['source_sha256']!=q.get('source_input_sha256') or str(ctx.raw['pmid'])!=str(q.get('pmid')):
                raise ValueError('Clinical classification requires an exact current source/review binding')
            entry=ctx.result(q);results[q['result_id']]=entry
            for f,v in entry['fields'].items():
                counts[f][v['status']+(':'+','.join(v['categories']) if v['categories'] else '')]+=1;used.update(v['evidence_ids'])
            used.update(entry['independence']['evidence_ids'])
            for v in entry['arm_settings'].values():used.update(v['evidence_ids'])
        for q in article.get('sample_size_records',[]):
            ctx=contexts.get(q.get('review_binding_sha256'))
            raw=q.get('quantitative_record',{})
            saved=next((s for s in ctx.raw.get('sample_sizes',[]) if s['id']==raw.get('id')),None) if ctx else None
            expected_arm=ctx.prefix+raw['arm_id'] if ctx and raw.get('arm_id') not in (None,'NA') else None
            if not ctx or not saved or ctx.raw['source_sha256']!=q.get('source_input_sha256') or str(ctx.raw['pmid'])!=str(q.get('pmid')) or q.get('sample_record_id')!=ctx.prefix+'N-'+str(raw.get('id')) or q.get('population_id')!=ctx.prefix+str(raw.get('population_id')) or q.get('arm_id')!=expected_arm or any(saved.get(f)!=raw.get(f) for f in ('population_id','arm_id')):
                raise ValueError('Clinical sample classification requires an exact current sample/source/review/population binding')
            entry=ctx.sample(q);samples[q['sample_record_id']]=entry
            for f,v in entry['fields'].items():
                sample_counts[f][v['status']+(':'+','.join(v['categories']) if v['categories'] else '')]+=1;used.update(v['evidence_ids'])
            used.update(entry['independence']['evidence_ids'])
            for v in entry['arm_settings'].values():used.update(v['evidence_ids'])
    profiles={}
    for entry in [*results.values(),*samples.values()]:
        profile={key:entry.pop(key) for key in ('fields','arm_settings','cross_setting_comparison','independence')}
        key=digest(canonical(profile));profiles.setdefault(key,profile);entry['profile_id']=key
    out={'schema_version':SCHEMA_VERSION,'classification_version':CLASSIFICATION_VERSION,
         'record_kind':'source_bound_clinical_classifications','source_file_sha256':source_file_sha256,
         'clinical_content_sha256':clinical.get('content_sha256'),'source_path':SOURCE,
         'fields':list(FIELDS),'categories':{k:list(v) for k,v in CATEGORIES.items()},
         'results':results,'samples':samples,'profiles':profiles,'evidence_registry':{i:registry[i] for i in sorted(used)},
         'summary':{'results':len(results),'samples':len(samples),'records':len(contexts),'field_states':{f:dict(sorted(c.items())) for f,c in counts.items()},'sample_field_states':{f:dict(sorted(c.items())) for f,c in sample_counts.items()},
                    'source_supported_registered_results':sum(profiles[e['profile_id']]['independence']['verified'] for e in results.values())},
         'limitations':['NA is retained where source scope, baseline timing, complete resection or broad BRAF testing is not established.',
                        'Generic melanoma and unknown primary are not automatically cutaneous.',
                        'Only one source-supported own trial registration verifies a count identity; other cohorts require linkage review.',
                        'Study classification requires source support and uniform population descriptors; parent inheritance never constructs marginal-subgroup intersections.']}
    out['content_sha256']=digest(canonical(out));return out


def write(root, payload=None, *, source_bytes=None):
    root=Path(root).resolve()
    source_bytes=owned(root,SOURCE).read_bytes() if source_bytes is None else source_bytes
    payload=json.loads(source_bytes) if payload is None else payload
    result=build(payload,source_file_sha256=digest(source_bytes));content=canonical(result)
    archive=owned(root,'data/current/clinical_classifications/'+CLASSIFICATION_VERSION+'/'+digest(content)+'.json')
    if archive.exists() and archive.read_bytes()!=content:raise ValueError('Classification history hash collision')
    if not archive.exists():atomic_bytes(archive,content)
    public=owned(root,PUBLIC)
    if not public.exists() or public.read_bytes()!=content:atomic_bytes(public,content)
    return {'public':PUBLIC,'archive':str(archive.relative_to(root)),'sha256':digest(content),'source_file_sha256':digest(source_bytes),'summary':result['summary']}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',default='.')
    args=parser.parse_args();print(json.dumps(write(args.root),indent=2))

if __name__=='__main__':main()
