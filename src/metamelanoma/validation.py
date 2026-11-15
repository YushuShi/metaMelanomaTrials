"""Source/model checks with independent per-fact results and retained originals."""
from collections import Counter
from copy import deepcopy
from decimal import Decimal
import re
from . import schema, normalization
from .screening import catalog_for, mixed_subtype_only_reason


def validate(payload, source, catalog=None, *, registered_encodings=None, request_schema=None):
    """Return a validation view; consumers use validated_facts, never raw facts.

    Files, native requests, accounting and document identity are verified by
    the caller. This pure function checks the exact supplied source/catalog,
    clinical schema, local graph, normalization and each field's evidence.
    Offline replay of an initial native response requires its actual recorded
    request_schema, verified by the caller with the original request artifact.
    """
    original = deepcopy(payload)
    result = {'original_payload': original, 'normalized_payload': deepcopy(payload),
        'decision_valid': False, 'decision_errors': [], 'fact_results': [], 'model_results': [],
        'validated_facts': [], 'validated_models': [], 'validated_entities': [], 'evidence': [],
        'counts': {'source_checked_facts': 0, 'held_facts': 0},
        'global_errors': [], 'field_coverage_errors': [], 'originals_changed': False,
        'treatment_policy': {'status':'not_recorded','priority':'review',
            'reason':'No treatment context was asserted in the recorded native contract.',
            'eligibility_decision_changed':False,'inferred_drug_class':False},
        'clinical_verified': False, 'pooling_eligible': False, 'whole_source_coverage_complete': False,
        'full_R3_extraction_complete': False}
    try:
        contract = schema.native_schema(request_schema, catalog=catalog_for(source), source=source)
        schema.check(payload, contract)
        result['native_schema_sha256'] = schema.digest(contract)
        if any(payload[k] != source[k] for k in ('report_id', 'pmid', 'stage')) or payload['source_sha256'] != schema.digest(source):
            raise ValueError('Foreign report/PMID/stage/source')
        if source['stage'] == 'R2' and any(b['block_id'] not in {'title', 'abstract'} for b in source['blocks']):
            raise ValueError('R2 uses title and abstract only')
        if source['stage'] == 'R3' and (source.get('main_full_text_verified') is not True or
            (source.get('upstream_R2') or {}).get('decision', {}).get('status') not in {'retain', 'uncertain', 'unclear', 'retain_for_full_text'}):
            raise ValueError('R3 requires verified main and truthful retained/unclear R2')
        expected = catalog_for(source)
        if catalog is not None and catalog != expected:
            raise ValueError('Exact supplied source catalog changed')
        catalog = expected
    except (ValueError, KeyError, TypeError) as exc:
        result['counts']['held_facts'] = len(payload.get('facts', [])) if isinstance(payload, dict) and isinstance(payload.get('facts'), list) else 0
        result['global_errors'].append(str(exc)); return result
    spans = {s['span_id']: s for s in catalog['spans']}
    evidence = {}; bad_ev = set()
    counts = Counter(e['evidence_id'] for e in payload['evidence'])
    for e in payload['evidence']:
        eid = e['evidence_id']; span = spans.get(e['span_id'])
        if not eid.strip() or counts[eid] != 1 or span is None:
            bad_ev.add(eid); continue
        evidence[eid] = {'evidence_id': eid, 'span_id': e['span_id'], 'source_id': span['source_id'],
            'block_id': span['block_id'], 'quote': span['text'], 'is_target': span['is_target'],
            'planned_only': span['planned_only'], 'document_role': span['document_role']}
    result['evidence'] = list(evidence.values())

    def ev(ids, required=True):
        if len(ids) != len(set(ids)) or set(ids) - set(evidence) or set(ids) & bad_ev or required and not ids:
            raise ValueError('Missing/foreign/duplicate evidence reference')
        return [evidence[i] for i in ids]

    def actual(ids):
        return any(not e['planned_only'] and e['document_role'] not in {'bibliography', 'references', 'metadata', 'protocol', 'SAP'} for e in ev(ids))

    # Scheduling is distinct from scientific eligibility. Chemotherapy is not
    # an exclusion, and prior/comparator/subsequent use never downgrades a core
    # experimental regimen. Missing class evidence stays explicitly in review.
    context = payload.get('treatment_context')
    if context is not None:
        treatment = {'status':'source_checked','priority':'review','original_context':deepcopy(context),
            'eligibility_decision_changed':False,'inferred_drug_class':False,'evidence_ids':context['evidence_ids']}
        try:
            category=context['experimental_regimen_category']; concurrent=context['experimental_concurrent_cytotoxic']
            timings=set(context['chemotherapy_contexts'])
            if len(timings)!=len(context['chemotherapy_contexts']):
                raise ValueError('Duplicate chemotherapy timing context')
            ev(context['evidence_ids'],category not in {'unclear','not_applicable'})
            if category not in {'unclear','not_applicable'} and not actual(context['evidence_ids']):
                raise ValueError('Treatment classification needs original source support')
            if concurrent=='no' and 'experimental_concurrent' in timings:
                raise ValueError('Concurrent cytotoxic status conflicts with timing metadata')
            if category=='conventional_cytotoxic_chemotherapy' and concurrent=='no':
                raise ValueError('Experimental cytotoxic category conflicts with no concurrent cytotoxic treatment')
            if concurrent=='yes' or 'experimental_concurrent' in timings or category=='conventional_cytotoxic_chemotherapy':
                priority='deferred';reason='Experimental concurrent conventional cytotoxic treatment is retained in the deferred queue.'
            elif category=='endocrine_only':
                priority='separate';reason='Endocrine-only treatment has a separate scheduling queue.'
            elif category in {'immunotherapy','targeted_therapy','immunotherapy_targeted_therapy','endocrine_combination'} and concurrent in {'no','not_applicable'}:
                priority='core';reason='Supported core regimen; comparator, prior or subsequent chemotherapy does not downgrade it.'
            elif category=='not_applicable':
                priority='not_applicable';reason='No experimental treatment classification applies to this report.'
            else:
                priority='review';reason='Experimental treatment class or concurrent cytotoxic timing remains unresolved.'
            treatment.update(priority=priority,reason=reason)
        except ValueError as exc:
            treatment.update(status='held',reason=str(exc),priority='review')
        result['treatment_policy']=treatment

    def unique(rows, key):
        c = Counter(r[key] for r in rows)
        return {r[key]: r for r in rows if r[key].strip() and c[r[key]] == 1}, {k for k, n in c.items() if n != 1 or not k.strip()}

    entities, bad_entity = unique(payload['entities'], 'entity_id')
    models, bad_model = unique(payload['models'], 'model_id')
    facts, bad_fact = unique(payload['facts'], 'fact_id')
    collisions = (set(entities) & set(models)) | (set(entities) & set(facts)) | (set(models) & set(facts))
    bad_entity |= collisions; bad_model |= collisions; bad_fact |= collisions

    def link(ident, kind):
        if ident is not None and (ident in bad_entity or ident not in entities or entities[ident]['kind'] != kind):
            raise ValueError('Foreign/wrong-kind ' + kind + ' link')

    for ident, e in entities.items():
        try:
            if ident in bad_entity or not e['label'].strip():
                raise ValueError('Empty/colliding entity')
            ev(e['evidence_ids']); seen = set(); cur = e
            while cur['parent_id'] is not None:
                if cur['entity_id'] in seen or cur['parent_id'] not in entities:
                    raise ValueError('Foreign/cyclic parent entity')
                seen.add(cur['entity_id']); cur = entities[cur['parent_id']]
        except ValueError:
            bad_entity.add(ident)
    # A dependent child never survives a held ancestor.
    for _ in range(len(entities)):
        bad_entity |= {i for i, e in entities.items() if e['parent_id'] in bad_entity}
    result['validated_entities'] = [deepcopy(e) for i, e in entities.items() if i not in bad_entity]
    regimen_review = None
    if 'arm_regimens' in contract['properties']:
        from .regimen_validation import RegimenReview
        regimen_review = RegimenReview(payload, evidence, {i: e for i, e in entities.items() if i not in bad_entity})
        result.update(regimen_review.result())

    decision = payload['decision']
    try:
        if not decision['reason'].strip():
            raise ValueError('Decision needs a recorded reason')
        ev(decision['evidence_ids'], decision['status'] != 'uncertain')
        if decision['status'] == 'retain':
            if decision['reason_code'] != 'eligible' or decision['actual_human_treatment'] != 'established' or decision['original_study_design'] != 'established' or not actual(decision['evidence_ids']):
                raise ValueError('Retention needs actual treated-human and design support')
            text = ' '.join(e['quote'] for e in ev(decision['evidence_ids']))
            positive = re.sub(r'\bnon[\s\-‐‑–—]*melanomas?\b', '', text, flags=re.I)
            if not re.search(r'\bmelanomas?\b|\bSKCM\b', positive, re.I):
                raise ValueError('Actual melanoma needs positive source support; non-melanoma is not positive')
            if re.search(r'cell lines?|in vitro|murine|xenograft', text, re.I) and not re.search(r'patients?|participants?|subjects?|clinical (?:trial|cohort)', text, re.I):
                raise ValueError('Human-derived material is not an established treated-patient population')
            sentences = re.split(r'(?<=[.!?])\s+|\n+', text)
            other_disease = r'(?:other\s+)?(?:solid\s+tumou?rs?|cancers?|malignanc(?:y|ies)|lymphoma|sarcoma|renal\s+cell|lung\s+cancer|carcinoma|leukemia|RCC|NSCLC)'
            def alternative_population(sentence):
                return bool(re.search(r'\bmelanoma\s+or\s+(?:[\w+\-/]+\s+){0,8}'+other_disease+r'\b|\b'+other_disease+r'\s+or\s+melanoma\b', sentence, re.I))
            mixed_or = any(alternative_population(sentence) for sentence in sentences)
            direct = any(re.search(r'\bmelanoma\b.{0,35}\b(?:patients?|participants?|subjects?)\b|\b(?:patients?|participants?|subjects?)(?:\s*\(\s*\d+(?:\.\d+)?\s*%\s*\))?\s+(?:with|having|had)\b.{0,60}\bmelanoma\b', sentence, re.I)
                         and re.search(r'patients?|participants?|subjects?|clinical (?:cohort|dataset)', sentence, re.I)
                         and re.search(r'treated|received|enrolled|included|underwent|observed|response|survival|randomi[sz]ed|randomly assigned|\bdied\b|\bremain(?:ed)?\b|\bresponded\b|\brecurred\b|\b(?:complete|partial)\s+regression\b', sentence, re.I)
                         and not alternative_population(sentence) for sentence in sentences)
            # An explicitly observed melanoma count can appear in the next
            # sentence after the treated mixed-cohort description. It is not
            # an eligibility list, and no count is calculated by this guard.
            observed_count = any(re.search(r'(?<![\w.−-])(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:\(\d+\)\s*)?(?:patients?|participants?|subjects?)\s+had\s+(?:malignant\s+)?melanoma\b', sentence,re.I)
                and not re.search(r'\beligib|\bcould\b|\bmay\b|\bplanned\b|\bif\b|\bwould\b',sentence,re.I) for sentence in sentences)
            # A printed observed diagnosis comparison establishes both groups,
            # even when the methods use a disjunctive mixed-cohort description.
            diagnosis_comparison = any(re.search(r'\bpatients?\s+with\s+renal\s+(?:cell\s+)?carcinoma\s*\(\s*v(?:s\.?)?\s+melanoma\s*\)',sentence,re.I)
                and re.search(r'\b(?:occurred|had|experienced|showed)\b',sentence,re.I)
                and not re.search(r'\beligib|\bcould\b|\bmay\b|\bplanned\b|\bif\b|\bwould\b',sentence,re.I) for sentence in sentences)
            direct = direct or observed_count or diagnosis_comparison
            if mixed_or and not direct:
                raise ValueError('Melanoma eligibility among alternatives does not establish actual melanoma enrollment')
            if re.search(r'\bTCGA\b|\bSKCM\b', text) and not re.search(r'patients?|participants?|subjects?', text, re.I):
                raise ValueError('TCGA/SKCM label alone does not establish treated melanoma patients')
        if decision['status'] == 'exclude':
            if decision['reason_code'].startswith('unresolved') or decision['reason_code'] in {'eligible', 'source_incomplete'}:
                raise ValueError('Unresolved evidence is not a source-supported exclusion')
            if payload['facts'] or payload['models'] or payload['entities']:
                raise ValueError('Excluded reports must have empty scientific graphs')
        if decision['status'] == 'uncertain':
            if decision['reason_code']=='no_actual_treated_human_link':
                if decision['actual_human_treatment']!='unclear':
                    raise ValueError('Uncertain treated-human linkage needs an explicitly unclear linkage flag')
            elif decision['reason_code'] not in {'unresolved_population', 'unresolved_design', 'unresolved_treatment', 'unresolved_report_kind', 'source_incomplete'}:
                raise ValueError('Uncertainty must name an unresolved non-subtype question')
        if decision['reason_code'] == 'scientific_abstract_unavailable' and source.get('scientific_abstract_availability') != 'authoritatively_unavailable':
            raise ValueError('A blank local abstract does not prove unavailable scientific abstract')
        # Source subtype is a label, never an exclusion/uncertainty reason.
        # A contrast clause explicitly saying that subtype is NOT the basis
        # must not itself become a subtype-only reason. Keep native text exact.
        subtype_basis = re.sub(r',\s*not\s+(?:unspecified\s+)?(?:melanoma\s+)?subtype\b','',decision['reason'],flags=re.I)
        subtype_reason = re.search(r'\b(?:cutaneous|subtype|primary skin)\b',subtype_basis,re.I) and re.search(r'\b(?:missing|no|not|lack|absence|unspecified|unclear|unknown|unconfirmed|cannot|unable)\b',subtype_basis,re.I)
        explicit_subtype_only = re.search(r'\b(?:uveal|mucosal|acral)[ -]only\b|\bonly\s+(?:uveal|mucosal|acral)\b',subtype_basis,re.I)
        other_reason = re.search(r'preclinical|cell lines?|murine|non.melanoma|planned.only|(?:systematic|narrative|literature) review|review (?:article|report)|no (?:actual )?(?:human|treated)|actual.{0,30}(?:enrollment|population|design).{0,35}(?:unresolved|unknown|unclear|not established)|(?:treatment|therapy|design|genre).{0,20}(?:unclear|unresolved|unsupported)|(?:unclear|unresolved|unsupported).{0,20}(?:treatment|therapy|design|genre)|no separable.{0,20}(?:melanoma|outcomes)|no (?:identifiable |original |actual )*(?:treated cohort|study design)|(?:clinical report|clinical overview).{0,70}(?:unresolved|not identified|not established)|not an eligible drug regimen',decision['reason'],re.I)
        if decision['status'] != 'retain' and ((subtype_reason or explicit_subtype_only) and not other_reason
                or mixed_subtype_only_reason(decision['reason'])):
            raise ValueError('Melanoma subtype alone cannot exclude or cause uncertainty')
        result['decision_valid'] = True
    except ValueError as exc:
        result['decision_errors'].append(str(exc))

    valid_models = set()
    for ident, m in models.items():
        errors = []
        try:
            if ident in bad_model:
                raise ValueError('Duplicate/colliding model ID')
            ev(m['evidence_ids']); link(m['analysis_population_id'], 'population'); link(m['endpoint_id'], 'endpoint'); link(m['cutoff_id'], 'cutoff')
            for arm in m['arm_ids']: link(arm, 'arm')
            if regimen_review and any(arm not in regimen_review.arms for arm in m['arm_ids']):
                raise ValueError('Model depends on a missing/held structured arm definition')
            if m['scope'] == 'observed' and (m['evidence_origin'] == 'planned' or not actual(m['evidence_ids'])):
                raise ValueError('Observed model cannot use planned-only support')
            for variable in m['variables']:
                variable_evidence = ev(variable['evidence_ids'])
                if not variable['name'].strip() or not any(schema.norm(variable['name']).casefold() in schema.norm(e['quote']).casefold() for e in variable_evidence):
                    raise ValueError('Model variable name absent from its own source evidence')
                if variable['role'] == 'adjustment' and m['adjusted_status'] != 'adjusted':
                    raise ValueError('Adjustment variable requires explicitly adjusted model')
                if m['scope'] == 'observed' and variable['scope'] == 'planned':
                    raise ValueError('Planned variable is not an actual fitted covariate')
            if m['adjusted_status'] == 'adjusted' and not any(v['role'] == 'adjustment' for v in m['variables']):
                text = ' '.join(e['quote'] for e in ev(m['evidence_ids']))
                if re.search(r'FDR|false discovery|multiplicity|multiple testing', text, re.I) and not re.search(r'adjusted for|covariate|multivaria', text, re.I):
                    raise ValueError('Multiplicity/FDR does not establish covariate adjustment')
            valid_models.add(ident)
        except ValueError as exc:
            errors.append(str(exc))
        result['model_results'].append({'model_id': ident, 'status': 'source_checked' if not errors else 'held', 'errors': errors})
    result['validated_models'] = [deepcopy(m) for i, m in models.items() if i in valid_models]
    for fact in payload['facts']:
        f = deepcopy(fact); errors = []; provenance = []; link_provenance = []
        try:
            if f['fact_id'] in bad_fact:
                raise ValueError('Duplicate/colliding fact ID')
            if f['status'] in {'not_reported', 'not_applicable'} and (f['text'] is not None or f['numbers']):
                raise ValueError('Missing clinical field cannot contain reported text/numbers')
            ev(f['evidence_ids'], f['status'] in {'reported', 'unclear'})
            for key, kind in [('result_population_id', 'population'), ('arm_id', 'arm'), ('experimental_arm_id', 'arm'), ('comparator_arm_id', 'arm'), ('endpoint_id', 'endpoint'), ('cutoff_id', 'cutoff')]:
                link(f[key], kind)
            if f['reported_trial'] is not None and not any(schema.norm(f['reported_trial']) in schema.norm(e['quote']) for e in ev(f['evidence_ids'])):
                raise ValueError('Fact trial attribution absent from quote')
            if f['scope'] == 'observed' and (f['evidence_origin'] == 'planned' or f['numbers'] and not actual(f['evidence_ids'])):
                raise ValueError('Observed result requires actual source support')
            if f['domain'] in {'efficacy_outcomes', 'safety_outcomes'} and f['scope'] == 'planned':
                raise ValueError('Planned assumptions are not observed clinical outcomes')
            if f['experimental_arm_id'] is not None and f['experimental_arm_id'] == f['comparator_arm_id']:
                raise ValueError('An arm cannot compare with itself')
            if f['model_id'] is not None:
                if f['model_id'] not in valid_models:
                    raise ValueError('Missing/held model dependency')
                m = models[f['model_id']]
                if f['evidence_origin'] != m['evidence_origin'] and 'unclear' not in {f['evidence_origin'], m['evidence_origin']}:
                    raise ValueError('Own/cited model scope conflict')
                if f['scope'] == 'observed' and m['scope'] == 'planned':
                    raise ValueError('Observed fact linked to planned model')
                for key in ('endpoint_id', 'cutoff_id'):
                    if f[key] is not None and m[key] is not None and f[key] != m[key]:
                        raise ValueError('Fact/model ' + key + ' conflict')
                if f['contrast_type'] not in {'other', 'not_applicable', m['contrast_type']}:
                    raise ValueError('Fact/model contrast conflict')
                arms = {f[k] for k in ('arm_id', 'experimental_arm_id', 'comparator_arm_id') if f[k]}
                if m['arm_ids'] and not arms <= set(m['arm_ids']):
                    raise ValueError('Fact/model arm scope conflict')
                result_pop, analysis_pop = f['result_population_id'], m['analysis_population_id']
                if result_pop and analysis_pop and result_pop != analysis_pop:
                    cur = entities[result_pop]; ancestors = set()
                    while cur['parent_id'] is not None:
                        ancestors.add(cur['parent_id']); cur = entities[cur['parent_id']]
                    if analysis_pop not in ancestors or not set(entities[result_pop]['evidence_ids']) & set(entities[analysis_pop]['evidence_ids']):
                        raise ValueError('Result subgroup lacks source-supported analysis-population relationship')
            roles = [n['role'] for n in f['numbers']]
            if len(roles) != len(set(roles)):
                raise ValueError('Repeated numeric roles require separate scoped results')
            if f['domain'] in {'efficacy_outcomes', 'safety_outcomes'} and f['numbers']:
                for key, gap in [('result_population_id', 'population'), ('endpoint_id', 'endpoint'), ('cutoff_id', 'cutoff')]:
                    if f[key] is None and gap not in f['link_gaps']:
                        if gap != 'cutoff':
                            raise ValueError('Clinical result must link ' + gap + ' or explicitly record a gap')
                        f['link_gaps'].append('cutoff')
                        link_provenance.append({'field':'cutoff_id','original':None,'normalized':None,
                            'metadata_field':'link_gaps','added_gap':'cutoff','origin':'validator_unresolved_link_annotation',
                            'reason':'No cutoff entity was linked in the native fact; no date or whole-source absence is inferred.',
                            'source_sha256':schema.digest(source)})
            if re.fullmatch(r'HR|OR|RR|SHR|TR|RD|MD|SMD|hazard ratio|odds ratio|risk ratio|relative risk', f['measure'] or '', re.I) and f['model_id'] is None and 'model' not in f['link_gaps']:
                raise ValueError('Missing effect model requires an explicit gap')
            if any(r in roles for r in ('ci_lower', 'ci_upper')) and 'confidence_level' not in roles:
                raise ValueError('CI level requires a reported or explicit missing wrapper; never default95')
            for index, number in enumerate(f['numbers']):
                own = ev(number['evidence_ids'], number['raw_text'] is not None or number['value'] is not None)
                if number['status'] == 'reported':
                    own = [e for e in own if e['is_target']]
                    if not own: raise ValueError('New reported number needs its own target source')
                encoding = (registered_encodings or {}).get((f['fact_id'], index))
                try:
                    view = normalization.normalize_number(number, evidence=own, fact=f, registered_encoding=encoding)
                except normalization.HarmonizationHold:
                    if encoding is not None or normalization._unit(number['unit']) not in {'probability', 'proportion'} or not re.search(r'%|\bpercent\b', number['raw_text'] or '', re.I):
                        raise
                    # Code-generated registration after exact source/catalog
                    # verification: both units and the exact ratio are explicit.
                    # A native normalization flag cannot grant this capability.
                    proof = {'kind': 'supplied_source_payload', 'sha256': schema.digest(source), 'catalog_sha256': schema.digest(catalog)}
                    capability = normalization.register_percent_probability(number, evidence=own, fact=f,
                        source_proof_ref=proof, verify_source_proof=lambda supplied: supplied == proof)
                    view = normalization.normalize_number(number, evidence=own, fact=f, registered_encoding=capability)
                n = view['number']; n['missing_reason'] = view['missing_reason'] or number['missing_reason']
                if view.get('non_scalar_source_literal'):
                    raise ValueError('Non-scalar source annotation is not an extracted clinical point value')
                if n['value'] is not None and n['role'] in {'sample_size', 'numerator', 'denominator'} and (n['value'] < 0 or Decimal(str(n['value'])) % 1 or '%' in str(number['raw_text'] or '')):
                    raise ValueError('Patient/event count must be an explicit nonnegative integer, never from percent')
                if n['role'] == 'p_value' and n['value'] is not None and not 0 <= n['value'] <= 1:
                    raise ValueError('P value outside probability range')
                f['numbers'][index] = n; provenance.append({'number_index': index, **view})
            if regimen_review:
                regimen_review.validate_fact(f, provenance)
            values = {n['role']: n['value'] for n in f['numbers'] if n['value'] is not None}
            if values.get('ci_lower', float('-inf')) > values.get('ci_upper', float('inf')):
                raise ValueError('Reversed printed CI stays held; do not repair')
        except (ValueError, KeyError) as exc:
            errors.append(str(exc))
        status = 'source_checked' if not errors else 'held'
        result['fact_results'].append({'fact_id': f['fact_id'], 'status': status, 'errors': errors,
            'normalized_fact': f if not errors else None, 'normalization_provenance': provenance,
            'link_provenance':link_provenance})
        if not errors: result['validated_facts'].append(f)
    by_valid = {f['fact_id']: f for f in result['validated_facts']}
    result['normalized_payload']['facts'] = [deepcopy(by_valid.get(f['fact_id'], f)) for f in payload['facts']]
    coverage = payload['field_coverage']
    if len(coverage) != len(schema.DOMAINS) or {c['domain'] for c in coverage} != set(schema.DOMAINS):
        result['field_coverage_errors'].append('Exactly one clinical coverage status per domain required')
    for c in coverage:
        try:
            ev(c['evidence_ids'], False)
            if c['status'] == 'not_reported_in_supplied_source' and any(f['domain'] == c['domain'] and f['status'] == 'reported' for f in payload['facts']):
                raise ValueError('Reported fact conflicts with domain absence claim')
        except ValueError as exc:
            result['field_coverage_errors'].append(c['domain'] + ': ' + str(exc))
    result['counts'] = {'source_checked_facts': len(result['validated_facts']),
        'held_facts': sum(r['status'] == 'held' for r in result['fact_results'])}
    # A pure field validator cannot certify article-wide coverage or pooling.
    return result
