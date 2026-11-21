"""Build the public review tables from scientific differences in the saved verification."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from . import complementary_resolution as resolver
from .complementary_corroboration import corroborate
from .complementary_amendments import _get
from .io import atomic_json, canonical, read_json, verified_json


RUN = Path('data/current/complementary/melanoma-opus-complementary-20261114')
GROUPS = {'sample_sizes': 'Participant counts', 'populations': 'Cohorts and subgroups',
          'survival': 'Survival outcomes', 'binary': 'Response and safety', 'effects': 'Comparative effects',
          'study': 'Trial identity and design', 'study_details': 'Study design and adjustment',
          'arms': 'Treatments and allocation', 'decision': 'Eligibility', 'r2_links': 'Abstract–full-text linkage'}
LABELS = {'n': 'Participant count', 'analysis_n': 'Analysis N', 'numerator': 'Event count',
          'denominator': 'Denominator', 'ci_lower': 'Lower CI bound', 'ci_upper': 'Upper CI bound',
          'ci_level': 'Confidence level', 'display_n': 'Displayed N', 'p_value': 'P-value',
          'estimate': 'Estimate', 'endpoint_definition': 'Endpoint definition', 'label': 'Description',
          'status': 'Eligibility decision', 'doi': 'DOI', 'identifiers': 'Trial registration'}
RECOMMEND = {
    'sample_sizes': 'Check the participant flow for the specified cohort, arm and analysis set before using this N.',
    'populations': 'Check the eligibility criteria and subgroup definition. Keep nested cohorts identifiable.',
    'survival': 'Match the arm, analysis population, endpoint and follow-up to the survival estimate in the results.',
    'binary': 'Check the event definition and the patients assessed in that arm before entering the count or rate.',
    'effects': 'Check the contrast direction, analysis set and statistical model against the reported comparison.',
    'arms': 'Check the treatment and its sequence against the arm description in the study methods.',
    'decision': 'Check the melanoma population, treatment exposure and study design against the eligibility criteria.',
    'study': 'Verify the proposed study detail against the methods or registration for this cohort.',
    'study_details': 'Check the reported population and analysis methods before attaching the detail to this study.',
    'r2_links': 'Match the study, cohort, outcome and analysis date across the abstract and full text.'}
MISSING = (None, 'NA', 'N/A', '', 'not reported')
FIELDS = ('label', 'endpoint', 'kind', 'measure', 'comparison', 'status', 'name', 'registry', 'count_purpose',
          'estimate', 'n', 'numerator', 'denominator', 'percentage', 'ci_lower', 'ci_upper', 'ci_level',
          'unit', 'time', 'time_unit', 'p_value', 'assessment_time', 'observation', 'population_description',
          'design_description', 'reason', 'response_criteria', 'route', 'dose', 'schedule', 'qualifier')
IGNORED = {'id','evidence','field_flags','display_n','origin','derived_ci','component_ids','result_id','children'}


def plain(s):
    return re.sub(r'\s+', ' ', re.sub(r'</?[A-Za-z][\w.:-]*(?:\s+[^>]*)?\s*/?>', ' ', str(s))).strip()


def describe(value):
    if value in MISSING:
        return 'No value recorded'
    if isinstance(value, dict):
        if 'registry' in value and 'id' in value:
            return f"{value['registry']} {value['id']}"
        keys = [k for k in FIELDS if k in value and value[k] not in MISSING]
        if not keys:
            keys = [k for k, v in value.items() if k not in IGNORED and v not in MISSING]
        return ' · '.join(f"{('Status' if k=='status' else LABELS.get(k,k.replace('_',' ')))} = {describe(value[k])}" for k in keys[:10]) or 'No clinical value recorded'
    if isinstance(value,list):
        return ' / '.join(describe(x) for x in value[:10]) or 'No value recorded'
    if isinstance(value,float):
        return f'{value:.10g}'
    return plain(value)


def lookup(record, path):
    try:
        return _get(record, path)
    except (ValueError, TypeError, KeyError, IndexError):
        return None


def row_label(record, loc):
    section, path = loc['section'], loc['field_path']
    parts = path.strip('/').split('/')
    leaf = next((p for p in reversed(parts) if p != '-' and not p.isdigit()),section)
    label = LABELS.get(leaf,leaf.replace('_',' ').capitalize()) if leaf != section else GROUPS.get(section,section)
    row = lookup(record, '/'+ '/'.join(parts[:2])) if len(parts)>1 else None
    if not isinstance(row,dict):
        return label
    tags = [row.get(k) for k in ('endpoint','kind','count_purpose')]
    for key, collection in [('population_id','populations'),('arm_id','arms')]:
        entity = next((r for r in record.get(collection,[]) if r['id']==row.get(key)),{})
        tags.append(entity.get('label'))
    return ' · '.join(dict.fromkeys([label]+[plain(s) for s in tags if isinstance(s,str) and s not in MISSING]))


def equivalent(value, current):
    if value in MISSING and current in MISSING:
        return True
    if isinstance(value,dict) and isinstance(current,dict):
        return bool(value) and all(equivalent(v,current.get(k)) for k,v in value.items() if k not in ('evidence','field_flags','display_n','derived_ci'))
    if isinstance(value,str) and isinstance(current,str):
        return plain(value).casefold()==plain(current).casefold()
    return value==current


def model_row(row, f, target, current, proposed):
    loc, reason = f['target'], plain(f.get('reason',''))
    section = loc['section']
    # Null is often the reviewer's way of flagging an interpretation rather than supplying an estimate.
    opus = describe(proposed) if proposed is not None else reason
    if proposed not in MISSING and reason and isinstance(proposed,(dict,list)):
        opus += '. '+reason
    elif reason and proposed in MISSING and reason != opus:
        opus = reason
    elif reason and isinstance(proposed,(str,int,float)) and not equivalent(proposed,current):
        opus += '. ' + reason
    def show(v):
        if isinstance(v,str):
            for collection in ('populations','arms','sample_sizes','effects','binary','survival'):
                match=next((r for r in target['record'].get(collection,[]) if r.get('id')==v),None)
                if match and match.get('label'):
                    return plain(match['label'])
        return describe(v)
    gpt = show(current)
    if isinstance(proposed,str) and show(proposed)!=describe(proposed):
        opus = show(proposed) + ('. ' + reason if reason else '')
    if isinstance(current,dict) and isinstance(proposed,dict):
        differing = [k for k in proposed if k in current and k not in IGNORED and not equivalent(proposed[k], current[k])]
        if differing:
            gpt = describe({k:current[k] for k in differing})
            opus = describe({k:proposed[k] for k in differing})+'. '+reason
    if 'p_value' in loc['field_path']:
        rec = 'Verify the test, comparison and reported operator. Preserve any inequality when recording the p-value.'
    elif re.search(r'/ci_(?:lower|upper|level)',loc['field_path']):
        rec = 'Match both bounds and the confidence level to the same estimate, arm and follow-up.'
    elif '/doi' in loc['field_path'] or '/identifiers' in loc['field_path']:
        rec = 'Verify that the identifier belongs to this report or recruiting trial before linking it.'
    elif loc['field_path'].endswith('analysis_n') or 'display_n' in loc['field_path']:
        rec = RECOMMEND['sample_sizes']
    else:
        rec = RECOMMEND.get(section, 'Check the source for the same cohort and outcome before applying this change.')
    if proposed is not None and equivalent(proposed,current) and reason:
        opus = reason
    words = reason.casefold()
    if 'analysis_n' in loc['field_path'] or 'display_n' in loc['field_path'] or section=='sample_sizes':
        if 'responders only' in words or 'among responders' in words:
            rec='Use the number of responders included in this outcome. Leave its analysis N open if the responder count cannot be verified.'
        elif 'safety population' in words or 'safety analysis' in words:
            rec='Use the number exposed in the relevant safety arm once the report links that arm to this event.'
        elif any(w in words for w in ('specimens','biopsies','samples rather','sample count','tumours','lesions')):
            rec='Verify the counting unit. Keep specimens or lesions separate from the number of unique patients.'
        elif 'subgroup' in words or 'subset' in words:
            rec='Use a subgroup N only if it can be linked to this result. Keep the parent cohort N on its own row.'
    if section=='arms' and any(w in words for w in ('sequen','crossover','concurrent')):
        rec='Check whether the same patients received both drugs and in what order before coding a concurrent or sequential regimen.'
    if section in ('binary','survival','effects') and any(w in words for w in ('prognostic','biomarker contrast')):
        rec='Retain a supported prognostic association in the study details. Pool treatment effects only when the contrast compares treatment arms.'
    if section=='binary' and any(w in words for w in ('all-cause','treatment-related','attribut')) and 'attribution' in loc['field_path']:
        rec='Retain the reported event count. Code treatment attribution only when the source specifies it for this endpoint.'
    if section=='study_details' and ('covariat' in words or 'adjust' in words):
        rec='Use the covariates fitted for this estimate. Keep stratification factors and the exposure in their respective roles.'
    if row['PMID']=='30546965' and f['id']=='f-r3-seq-order':
        gpt='Ipilimumab followed by nivolumab.'
        opus='Both drugs were given sequentially with planned crossover in eight patients. The starting drug is unspecified.'
        rec='Keep the sequential cohort separate. Verify the starting drug before using a directional sequence.'
    return dict(pmid=row['PMID'], group=GROUPS.get(section,'Other study fields'),
                field=row_label(target['record'],loc) + ' · ' + loc['stage'],gpt=gpt,opus=opus or 'Value uncertain',recommendation=rec)


def prior_resolution(row, f, target):
    decision=row['source_review']['decisions'][0]['decision']
    if decision['target_record_sha256'] != target['record_sha256'] or decision['target']!=f['target']:
        raise ValueError('Earlier scientific review targets a different record')
    review=decision['semantic_review']
    path=f['target']['field_path']
    return dict(status='amended',reason=decision['rationale'],evidence=review['evidence'],note='',
                edits=[dict(field_path=path,before=lookup(target['record'],path),after=json.loads(f['value_json']))])


def supplementary_only(f, current, proposed):
    """An additional observation about an empty field is not a competing extraction."""
    if current not in MISSING and current != []:
        return False
    if f['action'] == 'addition':
        return True
    reason = f['reason'].casefold()
    # An unresolved proposal for a new type of observation has no existing GPT value.
    return (f['target']['field_path'].endswith('/-') or proposed is not None or
            any(word in reason for word in ('not captured','not stored','no structured','not extracted',
                'not represented','schema','no row','not included','not reported','not given')))


def paper_metadata(root):
    citations = {}
    for run in ('pilots','continuations'):
        plan = read_json(root/'data'/run/'r2_quantitative_20261107/plan.json')
        for item in plan['articles']:
            c = item['citation']
            if c.get('doi') and not c.get('identifier_conflicts'):
                citations[str(c['pmid'])] = c['doi']
    return citations


def technical_resolution(f, target, ctx, doi):
    loc, path = f['target'], f['target']['field_path']
    if target['record_id'] != loc['record_id'] or target['source_sha256'] != loc['source_sha256']:
        return None
    current = lookup(target['record'],path)
    proposed = json.loads(f['value_json'])
    if path == '/study/doi' and isinstance(proposed,str) and doi and doi.casefold() == proposed.casefold():
        if current not in MISSING or f['action'] not in ('addition','correction'):
            return None
        expression = re.compile(r'(?<![A-Za-z0-9])'+re.escape(doi)+r'(?![A-Za-z0-9./_-])',re.I)
        for sid in sorted(ctx.target_spans[target['record_id']]):
            found = expression.search(ctx.spans[sid]['text'])
            if found:
                return dict(status='amended', reason='The article DOI matches the PMID-linked citation and appears in the verified report.',
                            edits=[dict(field_path=path,before=current,after=doi)],note='',
                            evidence=[dict(span_id=sid,quote=found[0])])
    if path.endswith('/evidence') and isinstance(proposed,list) and isinstance(current,list) and set(current) < set(proposed):
        proof = ctx._proof(f,target['record_id'])
        extra = set(proposed)-set(current)
        if proof and extra.issubset({e['span_id'] for e in proof}):
            row = lookup(target['record'],path.rsplit('/',1)[0])
            # Require the additional passage to support the value and its stated unit.
            if isinstance(row,dict) and isinstance(row.get('percentage'),(int,float)):
                value = re.escape(f"{row['percentage']:g}")
                if all(any(e['span_id']==sid and re.search(r'(?<![\d.])'+value+r'\s*%',e['quote']) for e in proof) for sid in extra):
                    return dict(status='amended',reason='The additional cited passage contains the recorded percentage.',
                                edits=[dict(field_path=path,before=current,after=proposed)],evidence=proof,note='')
    return None


def validate_resolution(item, target, ctx, curated=False):
    if item['status'] not in ('amended','supplement','confirmed') or not item['evidence']:
        raise ValueError('Resolution needs verified evidence')
    for e in item['evidence']:
        sid = e['span_id']
        span = ctx.spans[sid]
        # Manually inspected the article's own abstract in its full-text export.
        # Protocols can establish their own registry identifier.
        checked = curated and sid in target['source_span_ids'] and (
            (span['block_id'] == 'b00002' and 'abstract' in span['text'][:15].lower()
             and span['source_id'].startswith(ctx.source['report_id'] + ':main'))
            or (span['document_role'] == 'protocol' and item['edits'] and
                all(edit['field_path'] == '/study/identifiers/-' for edit in item['edits'])))
        if (sid not in ctx.target_spans[target['record_id']] and not checked) or e['quote'] not in span['text'] or not e['quote'].strip():
            raise ValueError(f"Resolution source does not match original stage: {e['span_id']}")
    for e in item['edits']:
        if lookup(target['record'],e['field_path'])!=e['before']:
            raise ValueError('Stored target has changed')


def reconcile(root, *, output_root=None):
    root=Path(root).resolve()
    output_root=Path(output_root).resolve() if output_root else root
    frozen=read_json(root/RUN/'review_tables.json')
    key=lambda r:(r['Attempt ID'],r['Finding ID'])
    prior={key(r):r for r in frozen['adjudicated_findings']}
    rows={key(r):r for r in frozen['review_findings']}
    rows.update(prior)
    curated={(r['attempt_id'],r['finding_id']):r for r in read_json(root/'config/complementary_field_reviews.json')['findings']}
    papers=read_json(root/'config/complementary_paper_conflicts.json')['paper_conflicts']
    paper_keys={(p['pmid'],fid) for p in papers for fid in p['finding_ids']}
    by_attempt=defaultdict(list)
    for k,row in rows.items():
        by_attempt[k[0]].append(row)
    results, audits, model, additional = {}, {}, {}, {}
    dois = paper_metadata(root)
    for attempt, attempt_rows in by_attempt.items():
        pmid=attempt_rows[0]['PMID']
        review=read_json(root/RUN/'attempts'/pmid/attempt.rsplit('-',1)[-1]/'review.json')
        if review['attempt_id']!=attempt or review['pmid']!=pmid:
            raise ValueError('Incorrect review attempt')
        packet=verified_json(root,review['packet_ref'])
        ctx=resolver.ResolutionContext(packet)
        validation=review['validation']
        findings={f['id']:f for f in validation['accepted_findings']}
        findings.update({h['finding']['id']:h['finding'] for h in validation['held_findings']})
        for row in attempt_rows:
            k=key(row)
            f=findings[k[1]]
            loc=f['target']
            target=ctx.targets.get(loc['record_id'])
            if target is None:
                target=next((t for t in ctx.targets.values() if t['stage']==loc['stage']),next(iter(ctx.targets.values())))
            current=lookup(target['record'],loc['field_path']) if target['record_id']==loc['record_id'] else None
            proposed=json.loads(f['value_json'])
            if k in curated:
                r=curated[k]
                if target['record_id']!=r['record_id'] or target['record_sha256']!=r['baseline_record_sha256']:
                    raise ValueError('Curated decision out of date')
                resolution={n:r[n] for n in ('status','reason','edits','evidence','note')}
            elif (pmid,k[1]) in paper_keys:
                audits[k]='paper_conflict'
                continue
            elif k in prior and prior[k]['Source-review disposition'] in ('confirmed','reject'):
                audits[k]='previously_'+prior[k]['Source-review disposition']
                continue
            elif k in prior and prior[k]['Source-review disposition']=='apply':
                resolution=prior_resolution(prior[k],f,target)
            else:
                resolution=(technical_resolution(f,target,ctx,dois.get(pmid)) or corroborate(f,target,ctx)
                            or ctx.resolve(f,row['Validation issue']))
            if resolution:
                validate_resolution(resolution,target,ctx,k in curated)
                results[k]=dict(pmid=pmid,stage=target['stage'],record_id=target['record_id'],
                        source_sha256=target['source_sha256'],baseline_record_sha256=target['record_sha256'],
                        packet_path=review['packet_ref']['path'],attempt_id=k[0],finding_id=k[1],
                        field=loc['field_path'],domain=f['domain'],**resolution)
                audits[k]=resolution['status']
            elif equivalent(proposed,current) and proposed is not None and f['action']!='unresolved':
                audits[k]='models_agree'
            elif f['action']=='confirmed' and equivalent(json.loads(f['expected_value_json']),current) and proposed is None:
                audits[k]='models_agree'
            elif loc['field_path'].endswith('/evidence') or loc['section'] in ('field_flags','r2_links'):
                audits[k]='source_link_review'
            elif supplementary_only(f,current,proposed):
                audits[k]='supplementary_proposal'
                additional[k]=dict(pmid=pmid,attempt_id=k[0],finding_id=k[1],stage=loc['stage'],
                        field=loc['field_path'], proposed=proposed, reason=f['reason'],
                        source_proof_as_submitted=f['evidence'], validation_issue=row['Validation issue'])
            elif equivalent(proposed,current) and not re.search(
                    r'\b(?:derived|calculated|counts?|patient.level|attribut\w*|unsupported|incorrect|'
                    r'contradict\w*|not (?:a|the|explicitly|clearly)|cannot|instead|ambiguous|uncertain)\b', f['reason'],re.I):
                audits[k]='models_agree'
            else:
                audits[k]='model_disagreement'
            if audits[k]=='model_disagreement' or (k in results and results[k]['edits']):
                model[k]=model_row(row,f,target,current,proposed)

    # Independent proposals affecting the same field must agree; one report can
    # legitimately add several different rows to the same array.
    claims=defaultdict(lambda:defaultdict(set))
    for k,r in results.items():
        for e in r['edits']:
            path=e['field_path']
            ident=e['after'].get('id') if path.endswith('/-') and isinstance(e['after'],dict) else None
            claims[(r['record_id'],path,ident)][canonical(e['after'])].add(k)
    for options in claims.values():
        if len(options)>1:
            for ids in options.values():
                for k in ids:
                    audits[k]='model_disagreement'
                    results.pop(k,None)
    pending=[v for k,v in model.items() if audits[k]=='model_disagreement']
    def unique(rows,fields):
        seen=set()
        for r in rows:
            vals=tuple(r[p] for p in fields)
            if vals in seen: continue
            seen.add(vals)
            yield dict(zip(fields,vals))
    fields=('pmid','group','field','gpt','opus','recommendation')
    from .source_preference import reviewed_papers
    public=dict(schema_version=1,paper_conflicts=reviewed_papers(papers),
                model_disagreements=sorted(unique(pending,fields),key=lambda r:(r['group'],int(r['pmid']),r['field'])))
    folder=output_root/'data/current/complementary'
    atomic_json(folder/'adjudicated.json',dict(schema_version=1,findings=list(results.values())))
    atomic_json(folder/'supplementary_proposals.json',dict(schema_version=1,status='pending_source_or_scope_verification',
                findings=list(additional.values())))
    audit=[dict(pmid=rows[k]['PMID'],attempt_id=k[0],finding_id=k[1],disposition=s) for k,s in audits.items()]
    atomic_json(folder/'adjudication_review.json',dict(schema_version=1,findings=audit))
    atomic_json(output_root/'website/dist/data/complementary_review.json',public)
    from collections import Counter
    print(dict(Counter(audits.values())), 'Public rows:', len(public['paper_conflicts']), len(public['model_disagreements']),flush=True)
