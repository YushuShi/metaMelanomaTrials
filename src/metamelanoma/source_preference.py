"""Select the main article's account of an abstract discrepancy in the published view."""
from collections import defaultdict
from copy import deepcopy
import json
import re

from .io import canonical, digest, owned
from .quantitative_export import numeric, present, wrap

SECTIONS = ('effects', 'survival', 'binary', 'sample_sizes')
NUMBERS = ('estimate', 'percentage', 'numerator', 'denominator', 'analysis_n', 'ci_lower', 'ci_upper', 'ci_level', 'p_value', 'n')


def effective_record(wrapper):
    """Inputs to calculations. The original stage record stays available in study details."""
    choices = wrapper.get('source_preferences', {})
    if not choices:
        return wrapper['record']
    record = dict(wrapper['record'])
    for section, decisions in choices.items():
        record[section] = [{**row, **decisions.get(row['id'], {}).get('values', {})} for row in record[section]
                           if decisions.get(row['id'], {}).get('status') != 'superseded_abstract']
        for ident, decision in decisions.items():
            if decision.get('derived_fields'):
                record['derivations'] = [*record.get('derivations',[]),*[{'section':section,'id':ident,'field':key,
                    'method':decision['derivation']} for key in decision['derived_fields']]]
    return record


def _section(row):
    if 'n' in row and 'count_purpose' in row:
        return 'sample_sizes'
    if 'kind' in row:
        return 'survival'
    return 'binary' if 'numerator' in row else 'effects'


def _compatible(old, new, section, links):
    """Only compare like analyses, using the study's own arm and population links."""
    for column, kind in [('population_id', 'populations'), ('arm_id', 'arms'),
                         ('intervention_arm_id', 'arms'), ('reference_arm_id', 'arms')]:
        a, b = old.get(column), new.get(column)
        if not present(a) and not present(b):
            continue
        if not present(a) or not present(b):
            return False
        targets = {l['r3_id'] for l in links if l['section'] == kind and l['r2_id'] == a}
        if targets != {b}:
            return False
    for field in ('origin', 'endpoint', 'kind', 'measure', 'time', 'time_unit', 'assessment_time',
                  'cutoff', 'response_criteria', 'safety_attribution', 'adjusted', 'model', 'count_purpose'):
        a, b = old.get(field), new.get(field)
        if present(a) and present(b) and str(a).casefold() != str(b).casefold():
            return False
    def site(row):
        descriptor = (row['id']+' '+str(row.get('endpoint_definition',''))).lower().replace('_',' ')
        return {label for label, token in [('intracranial',r'\b(?:intracranial|ipfs)\b'),('extracranial',r'\b(?:extracranial|epfs)\b'),
                ('bicompartmental',r'\bbicompartmental\b')] if re.search(token,descriptor)}
    if site(old) != site(new):
        return False
    if section == 'sample_sizes' and (present(old.get('result_id')) or present(new.get('result_id'))):
        return False
    # Distinct toxicities, assessment sites and models can share one coarse endpoint code.
    if any(present(row.get('endpoint_definition')) for row in (old,new)):
        norm = lambda row: ' '.join(str(row.get('endpoint_definition', '')).lower().split())
        if norm(old) != norm(new):
            return False
    return True


def _mentions(text, value):
    return any(float(token.replace(',', '')) == value for token in
               re.findall(r'(?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?(?!\w|\.\d)', text))


def main_document(source_id):
    return bool(re.search(r':main(?:-html|-pdf)?:', source_id))


def _source_body(anchor):
    block = re.fullmatch(r'b(\d+)', anchor.get('block_id') or '')
    return main_document(anchor.get('source_id', '')) and block and int(block[1]) > 2


def _linked_pairs(wrappers, indexed, evidence, protected):
    after = wrappers['R3']['record']
    links = after.get('r2_links', [])
    for link in links:
        section = link['section']
        if section not in SECTIONS or link['relation'] not in ('conflict','same','supplement'):
            continue
        old_key = ('R2', section, link['r2_id'])
        new_key = ('R3', section, link['r3_id'])
        if old_key in protected or new_key in protected:
            continue
        old_row, new_row = indexed.get(old_key), indexed.get(new_key)
        if not old_row or not new_row:
            continue
        old, new = old_row['quantitative_record'], new_row['quantitative_record']
        if not _compatible(old, new, section, links):
            continue
        differing = [k for k in NUMBERS if numeric(old.get(k)) and numeric(new.get(k)) and old[k] != new[k]]
        if differing == ['percentage'] and all(numeric(new.get(k)) for k in ('numerator','denominator')) and new['denominator']>0:
            # Do not attribute an arithmetical refinement of a printed rate to an unrelated percentage in a table.
            step = 10 ** -len(str(old['percentage']).rstrip('0').partition('.')[2])
            if abs(100*new['numerator']/new['denominator'] - old['percentage']) <= step/2:
                continue
        if not differing or any(numeric(old.get(k)) and not numeric(new.get(k)) for k in ('estimate','percentage','n')):
            continue
        # Require a unique pairing in both directions. Relations to other cutoffs and subsets stay separate.
        candidates = [l for l in links if l['section'] == section and (l['r2_id'] == old['id'] or l['r3_id'] == new['id'])]
        if len(candidates) != 1:
            continue
        def refs(row):
            prefix = 'CE-' + row['review_binding_sha256'][:24] + '-'
            return [(key,evidence[key]) for sid in row['quantitative_record']['evidence'] if (key:=prefix+sid) in evidence]
        abstract = [a['supporting_quote'] for _,a in refs(old_row) if a['block_id']=='abstract' and ':citation' in a['source_id']]
        main = [(k,a) for k,a in refs(new_row) if _source_body(a) and not any(a['supporting_quote'] in t or t in a['supporting_quote'] for t in abstract)]
        if not abstract or not all(any(_mentions(t,old[f]) for t in abstract) for f in differing):
            continue
        # A whole-document OCR block can contain both accounts. Each changed value must be
        # supported in a main passage without the competing abstract value for that field.
        witnesses = {f:[k for k,a in main if _mentions(a['supporting_quote'],new[f]) and not _mentions(a['supporting_quote'],old[f])] for f in differing}
        if section=='sample_sizes' and 'n' in differing:
            # Do not mistake a dose, a table row index, or a treatment duration for a patient count.
            n = new['n']
            count_phrase = rf'\b{n}\s+(?:(?:randomi[sz]ed|enrolled|treated|evaluable|eligible)\s+)?(?:patients|participants|subjects)\b|\b(?:patients|participants|subjects)\s*[(]?[Nn]\s*=\s*{n}\b'
            witnesses['n']=[k for k in witnesses['n'] if re.search(count_phrase,evidence[k]['supporting_quote'],re.I)]
        if all(witnesses.values()):
            yield new_key, old_key, sorted({k for keys in witnesses.values() for k in keys})


def _extended_refs(root, binding, report_id, pmid, prefix, evidence):
    if not binding.get('packet_path'):
        return []
    data = owned(root,binding['packet_path']).read_bytes()
    if digest(data) != binding['packet_file_sha256']:
        raise ValueError(f'Changed main article source for PMID {pmid}')
    packet = json.loads(data)
    if packet['report_id'] != report_id or not packet['main_full_text_verified'] or not packet['identity']['identity_verified'] or str(pmid) not in packet['identity'].get('matched_identifiers',{}).get('pmid',[]):
        raise ValueError(f'Unverified main article for PMID {pmid}')
    anchors = []
    for block_id in binding['blocks']:
        hits = [b for b in packet['blocks'] if b['block_id']==block_id and b['document_role']=='main_article' and
                b['source_id'].startswith(report_id+':main:') and not b.get('planned_only')]
        if len(hits) != 1:
            raise ValueError(f'Missing main article passage {block_id} in PMID {pmid}')
        block = hits[0]
        entry = {'block_id':block_id,'source_id':block['source_id'],'supporting_quote':block['text']}
        key = prefix+'span-'+digest(canonical(entry))[:24]
        evidence[key] = entry
        anchors.append(key)
    return anchors


def _reset(row):
    saved = row.pop('before_source_preference', None)
    row.pop('source_preference', None)
    if saved:
        for field in saved['absent']:
            row.pop(field, None)
        row.update(saved['fields'])


def _apply_row(row, decision, section, eligible):
    fields = ('main_result_eligible','display_duplicate_of','extraction_conflict','quantitative_record','estimate',
              'n','analysis_n','numerator','denominator','p_value','ci_lower','ci_upper','confidence_level',
              'reported_numbers','source_reported_numbers','evidence_ids','measure','display_measure')
    row['before_source_preference'] = {'absent':[k for k in fields if k not in row],
                                       'fields':{k:deepcopy(row[k]) for k in fields if k in row}}
    row['source_preference'] = decision
    if decision['status'] == 'superseded_abstract':
        row['main_result_eligible'] = False
        return
    if row.pop('display_duplicate_of', None):
        row['main_result_eligible'] = bool(eligible and row['population'].get('population_scope') == 'melanoma')
    row['extraction_conflict'] = False
    if not decision.get('values'):
        return
    changes = decision['values']
    source = decision['evidence_ids']
    q = {**row['quantitative_record'], **changes}
    row['quantitative_record'] = q
    for key, value in changes.items():
        dest = {'percentage':'estimate','ci_level':'confidence_level'}.get(key,key)
        if dest in row and isinstance(row[dest],dict) and 'role' in row[dest]:
            row[dest] = wrap(value,row[dest]['role'],source,row[dest]['unit'])
    if section == 'binary':
        field = 'percentage' if numeric(q.get('percentage')) else 'numerator'
        row['estimate'] = wrap(q.get(field),'estimate',source,'%' if field=='percentage' else 'patients')
        measure = ('participant_count' if field=='numerator' else q['endpoint'] if q['endpoint'] in ('ORR','CR','PR','DCR','pCR') else 'event_probability')
        row['measure'] = row['display_measure'] = measure
    if section != 'sample_sizes':
        row['main_result_eligible'] = bool(eligible and row.get('population') and row['population']['population_scope']=='melanoma' and numeric(row['estimate']['value']))
    derived = set(decision.get('derived_fields', []))
    if 'percentage' in derived or ('numerator' in derived and not numeric(q.get('percentage'))):
        derived.add('estimate')
    for key in derived:
        if isinstance(row.get(key),dict):
            row[key]['derived'] = True
    row['evidence_ids'] = list(dict.fromkeys([*source,*row.get('evidence_ids',[])]))
    for name in ('reported_numbers','source_reported_numbers'):
        if name in row:
            roles = [r['role'] for r in row[name]]
            for role in ['estimate','ci_lower','ci_upper','confidence_level','p_value','numerator','denominator']:
                if isinstance(row.get(role),dict) and row[role].get('value') is not None and role not in roles:
                    roles.append(role)
            row[name] = [deepcopy(row[r]) for r in roles if r in row and row[r].get('value') is not None
                         and (name!='source_reported_numbers' or not row[r].get('derived'))]


def apply(root, payload):
    config = root / 'config/complementary_paper_conflicts.json'
    by_pmid = defaultdict(list)
    if config.exists():
        for finding in json.loads(config.read_bytes())['paper_conflicts']:
            by_pmid[finding['pmid']].append(finding)
    clinical = payload['clinical_evidence']
    articles = {a['pmid']:a for a in clinical['articles']}
    evidence = clinical['evidence_registry']
    for article in payload['articles']:
        pmid = article['pmid']
        wrappers = {w['stage']:w for w in article['records']}
        for w in wrappers.values():
            w.pop('source_preferences',None)
            w.pop('main_text_choices',None)
        rows = articles[pmid]
        rows['sample_size_records'] = [r for r in rows['sample_size_records'] if not r.get('source_preference_generated')]
        indexed = {}
        for row in [*rows['quantitative_results'],*rows['sample_size_records']]:
            _reset(row)
            q = row.get('quantitative_record',{})
            if q.get('id') and 'calculation' not in q:
                indexed[row['review_stage'],_section(q),q['id']] = row
        if 'R3' not in wrappers or 'R2' not in wrappers or not wrappers['R3'].get('source_proof_ref'):
            continue
        originals = {(stage,section,q['id']):q for stage,w in wrappers.items() for section in SECTIONS for q in w['record'][section]}
        chosen = {}
        protected = set()
        for finding in by_pmid[pmid]:
            side = finding.get('main_text_side')
            if not side:
                continue
            choice = {'field':finding['field'],'value':finding.get('main_text_value') or finding[side],'source_reference':finding['source_reference']}
            wrappers['R3'].setdefault('main_text_choices',[]).append(choice)
            for binding in finding.get('bindings',[]):
                section = binding['section']
                def unpack(key):
                    stage, ident = key.split(':',1)
                    return stage,section,ident
                winner = unpack(binding['main']) if binding['main'] else None
                others = [unpack(r) for r in binding['abstract']]
                protected.update([*others, *([winner] if winner else [])])
                if any(key not in originals or digest(canonical(originals[key])) != value
                       for pointer,value in binding['row_hashes'].items() for key in [unpack(pointer)]):
                    continue
                if not winner:
                    for k in others:
                        chosen[k] = {'status':'superseded_abstract','selected_field':finding['field']}
                    continue
                row = indexed.get(winner)
                base = row or next((v for (stage,_,_),v in indexed.items() if stage==winner[0]), None)
                if not base:
                    continue
                prefix = 'CE-' + base['review_binding_sha256'][:24] + '-'
                body_blocks = set(binding.get('blocks', []))
                ids = [k for sid in originals[winner]['evidence'] if (k:=prefix+sid) in evidence and evidence[k]['block_id'] in body_blocks and main_document(evidence[k]['source_id'])]
                if binding.get('packet_path'):
                    ids = _extended_refs(root,binding,rows['report_id'],pmid,prefix,evidence)
                if not ids and body_blocks:
                    ids = [k for k,a in evidence.items() if k.startswith(prefix) and a['block_id'] in body_blocks and main_document(a['source_id'])]
                if not ids:
                    continue
                elected = {'status':'main_text','evidence_ids':ids}
                if binding.get('values'):
                    values = dict(binding['values'])
                    values['evidence'] = [key.removeprefix(prefix) for key in ids]
                    # A source adjudication can clear conflict flags on the fields actually settled.
                    values['field_flags'] = [f for f in originals[winner].get('field_flags',[])
                            if f.get('field') not in values or 'conflict' not in str(f.get('code','')).lower()]
                    elected['values'] = values
                    if binding.get('derived_fields'):
                        elected.update(derived_fields=binding['derived_fields'],derivation=binding['derivation'])
                if winner in chosen and chosen[winner] != elected:
                    raise ValueError(f'Two source preferences for the same row in PMID {pmid}, {winner}')
                chosen[winner] = elected
                for k in others:
                    chosen[k] = {'status':'superseded_abstract','selected':binding['main']}
        unresolved_blocks = {b for f in by_pmid[pmid] if 'main_text_side' not in f
                             for b in re.findall(r'b\d+', f['source_reference'])}
        for winner, other, ids in _linked_pairs(wrappers,indexed,evidence,protected):
            if any(evidence[k]['block_id'] in unresolved_blocks for k in ids):
                continue
            chosen[winner] = {'status':'main_text','evidence_ids':ids}
            chosen[other] = {'status':'superseded_abstract','selected':winner[0]+':'+winner[2]}
        for (stage,section,ident),decision in chosen.items():
            wrappers[stage].setdefault('source_preferences',{}).setdefault(section,{})[ident] = decision
            row = indexed.get((stage,section,ident))
            if not row and section=='sample_sizes' and decision['status']=='main_text':
                from .source_preference_sample import ensure_preferred_sample
                row = ensure_preferred_sample(rows,wrappers[stage],originals[stage,section,ident],decision,evidence)
            if row:
                _apply_row(row,decision,section,rows['current_main_eligible'])
        if chosen:
            from .source_preference_sample import refresh_preferred_sample_sizes
            refresh_preferred_sample_sizes(rows,wrappers,evidence)
    return payload


def reviewed_papers(papers):
    fields = ('pmid','group','field','source_a','source_b','recommendation','main_text_side','main_text_value')
    published = []
    for finding in papers:
        row = {key: finding[key] for key in fields if key in finding}
        if finding.get('main_text_side'):
            row['recommendation'] = finding.get('main_text_value') or 'Use the main-text result.'
        published.append(row)
    return published


def write_review(root):
    from .io import atomic_json
    config = root / 'config/complementary_paper_conflicts.json'
    public = root / 'website/dist/data/complementary_review.json'
    if config.is_file() and public.is_file():
        data = json.loads(public.read_bytes())
        data['paper_conflicts'] = reviewed_papers(json.loads(config.read_bytes())['paper_conflicts'])
        atomic_json(public, data)
