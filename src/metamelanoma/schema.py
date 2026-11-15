"""The active, source-bound clinical review contract. No historical imports."""
from copy import deepcopy
import hashlib
import json
import math
import unicodedata

SCHEMA_ID = 'melanoma-clinical-review'
MODELS = {'R2': 'gpt-6.1-sol', 'R3': 'gpt-6-luna'}
DOMAINS = ('study_identification', 'study_design', 'patient_demographics', 'general_health',
    'cancer_characteristics', 'treatment_history', 'biomarkers', 'treatment_regimens',
    'statistical_methods', 'efficacy_outcomes', 'safety_outcomes', 'trial_planning_quality')
ROLES = ('estimate', 'ci_lower', 'ci_upper', 'confidence_level', 'p_value', 'sample_size',
         'numerator', 'denominator', 'percentage', 'mean', 'median', 'SD', 'IQR_lower',
         'IQR_upper', 'minimum', 'maximum', 'follow_up', 'timepoint', 'other')
SUBTYPES = ('cutaneous', 'acral', 'mucosal', 'uveal', 'other_explicit', 'unspecified', 'mixed')
STATUSES = ('reported', 'not_reported', 'not_applicable', 'unclear')
ENDPOINTS = ('overall_survival', 'progression_free_survival', 'recurrence', 'response',
             'adverse_events', 'quality_of_life', 'other', 'not_applicable')
REGIMEN_CATEGORIES = ('immunotherapy', 'targeted_therapy', 'immunotherapy_targeted_therapy',
    'endocrine_combination', 'endocrine_only', 'conventional_cytotoxic_chemotherapy',
    'other', 'unclear', 'not_applicable')


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def norm(text):
    return ' '.join(unicodedata.normalize('NFKC', text).split())


def obj(properties):
    return {'type': 'object', 'additionalProperties': False, 'properties': properties, 'required': list(properties)}


def arr(items):
    return {'type': 'array', 'items': items}


def enum(*values):
    return {'type': 'string', 'enum': list(values)}


S = {'type': 'string'}
N = {'type': ['string', 'null']}
IDS = arr(S)
DEFS = {
    'evidence': obj({'evidence_id': S, 'span_id': S}),
    'number': obj({'role': enum(*ROLES), 'status': enum(*STATUSES),
        'value': {'type': ['number', 'null']}, 'raw_text': N, 'unit': N,
        'qualifier': enum('equal', 'less_than', 'less_or_equal', 'greater_than', 'greater_or_equal',
                          'not_reached', 'not_reported'), 'missing_reason': N, 'evidence_ids': IDS}),
    'entity': obj({'entity_id': S, 'kind': enum('population', 'arm', 'endpoint', 'cutoff', 'study', 'treatment_component'),
        'label': S, 'population_scope': enum('melanoma', 'mixed_cancers', 'other_cancer', 'nonhuman', 'unclear', 'not_applicable'),
        'parent_id': N, 'evidence_ids': IDS}),
    'variable': obj({'name': S, 'role': enum('adjustment', 'exposure', 'subgroup', 'interaction',
        'randomization_stratum', 'analysis_stratum', 'multiplicity', 'baseline', 'unclear'),
        'scope': enum('observed', 'planned', 'unclear'), 'evidence_ids': IDS}),
    'model': obj({'model_id': S, 'family': N, 'estimand': N,
        'analysis_population_id': N, 'endpoint_id': N, 'cutoff_id': N, 'arm_ids': IDS,
        'contrast_type': enum('treatment_comparison', 'single_arm', 'biomarker_association', 'prognostic', 'interaction', 'other'),
        'adjusted_status': enum('adjusted', 'unadjusted', 'not_reported', 'unclear'),
        'evidence_origin': enum('own_report_results', 'cited_other_report', 'planned', 'unclear'),
        'scope': enum('observed', 'planned', 'unclear'),
        'variables': arr({'$ref': '#/$defs/variable'}), 'evidence_ids': IDS}),
    'fact': obj({'fact_id': S, 'domain': enum(*DOMAINS), 'field': S, 'status': enum(*STATUSES),
        'text': N, 'measure': N, 'clinical_endpoint_family': enum(*ENDPOINTS),
        'evidence_origin': enum('own_report_results', 'cited_other_report', 'planned', 'unclear'),
        'scope': enum('observed', 'planned', 'unclear'), 'reported_trial': N,
        'result_population_id': N, 'arm_id': N, 'experimental_arm_id': N, 'comparator_arm_id': N,
        'endpoint_id': N, 'model_id': N, 'cutoff_id': N,
        'contrast_type': enum('treatment_comparison', 'single_arm', 'biomarker_association', 'prognostic', 'interaction', 'other', 'not_applicable'),
        'count_context': enum('enrolled', 'eligible', 'randomized', 'treated', 'response_evaluable', 'safety',
            'model_analysis', 'subgroup', 'event_count', 'not_applicable', 'not_reported'),
        'link_gaps': IDS, 'numbers': arr({'$ref': '#/$defs/number'}), 'evidence_ids': IDS}),
    'coverage': obj({'domain': enum(*DOMAINS), 'status': enum('reviewed', 'not_reported_in_supplied_source',
        'not_applicable', 'unreviewed', 'not_separable'), 'reason': S, 'evidence_ids': IDS})}
SCHEMA = {**obj({'schema_id': {'type': 'string', 'const': SCHEMA_ID}, 'report_id': S, 'pmid': S,
    'stage': enum('R2', 'R3'), 'source_sha256': S,
    'decision': obj({'status': enum('retain', 'exclude', 'uncertain'), 'reason': S,
        'reason_code': enum('eligible', 'non_melanoma', 'preclinical_only', 'no_actual_treated_human_link',
            'planned_only', 'ineligible_treatment', 'ineligible_design', 'scientific_abstract_unavailable',
            'unresolved_population', 'unresolved_design', 'unresolved_treatment', 'unresolved_report_kind', 'source_incomplete'),
        'melanoma_subtypes': arr(enum(*SUBTYPES)),
        'actual_human_treatment': enum('established', 'not_established', 'unclear'),
        'original_study_design': enum('established', 'not_established', 'unclear'), 'evidence_ids': IDS}),
    'evidence': arr({'$ref': '#/$defs/evidence'}), 'entities': arr({'$ref': '#/$defs/entity'}),
    'models': arr({'$ref': '#/$defs/model'}), 'facts': arr({'$ref': '#/$defs/fact'}),
    'field_coverage': arr({'$ref': '#/$defs/coverage'}), 'limitations': arr(S)}), '$defs': DEFS}

# The initial paid native requests remain strict, auditable contracts. A caller
# replaying one must supply its exact recorded request schema; absence of a new
# field never fabricates a model assertion or silently chooses an old contract.
INITIAL_NATIVE_SCHEMA = deepcopy(SCHEMA)
SCHEMA['properties']['treatment_context'] = obj({
    'experimental_regimen_category': enum(*REGIMEN_CATEGORIES),
    'experimental_concurrent_cytotoxic': enum('yes', 'no', 'unclear', 'not_applicable'),
    'chemotherapy_contexts': arr(enum('experimental_concurrent', 'comparator', 'prior', 'subsequent', 'unclear')),
    'evidence_ids': IDS})
SCHEMA['required'].append('treatment_context')

# These historical contracts remain exact replay authorities. New requests use
# CURRENT_SCHEMA, without silently upgrading old responses or adjudications.
PRE_REGIMEN_SCHEMA = deepcopy(SCHEMA)
CURRENT_SCHEMA = deepcopy(SCHEMA)
CURRENT_SCHEMA['$defs']['regimen_node'] = obj({
    'node_id': S, 'kind': enum('drug', 'class', 'other', 'AND', 'OR', 'SEQUENTIAL', 'UNKNOWN'),
    'name': N, 'drug_class': N, 'children': IDS, 'dose': N, 'route': N, 'schedule': N,
    'evidence_ids': IDS})
CURRENT_SCHEMA['properties']['arm_regimens'] = arr(obj({
    'arm_id': S, 'label': S, 'root_node_id': S,
    'nodes': arr({'$ref': '#/$defs/regimen_node'}), 'evidence_ids': IDS}))
CURRENT_SCHEMA['properties']['contrast_definitions'] = arr(obj({
    'contrast_id': S,
    'contrast_type': enum('treatment_comparison', 'single_arm', 'biomarker_association', 'prognostic', 'interaction', 'other'),
    'experimental_arm_id': N, 'reference_arm_id': N, 'single_arm_id': N,
    'population_id': N, 'endpoint_id': N, 'cutoff_id': N, 'evidence_ids': IDS}))
CURRENT_SCHEMA['required'].extend(['arm_regimens', 'contrast_definitions'])
CURRENT_SCHEMA['$defs']['fact']['properties']['contrast_id'] = N
CURRENT_SCHEMA['$defs']['fact']['required'].append('contrast_id')


def report_schema(catalog=None, *, source=None, structured=False, initial=False):
    """Bind an explicit current or historical contract, preserving old defaults."""
    if structured and initial:
        raise ValueError('Choose one native contract')
    result = deepcopy(CURRENT_SCHEMA if structured else INITIAL_NATIVE_SCHEMA if initial else PRE_REGIMEN_SCHEMA)
    if catalog is not None or source is not None:
        if not isinstance(source, dict) or any(not isinstance(source.get(key), str) or not source[key] for key in ('report_id', 'pmid', 'stage')) or source['stage'] not in MODELS:
            raise ValueError('Exact report/PMID/stage source identity required')
        if not isinstance(catalog, dict) or catalog.get('source_sha256') != digest(source):
            raise ValueError('Catalog must bind the exact source identity')
        for key in ('report_id', 'pmid', 'stage'):
            result['properties'][key] = enum(source[key])
        result['properties']['source_sha256'] = enum(digest(source))
        spans = catalog.get('spans') if isinstance(catalog, dict) else None
        if not isinstance(spans, list) or not spans:
            raise ValueError('Nonempty source span catalog required')
        identifiers = [span.get('span_id') if isinstance(span, dict) else None for span in spans]
        if any(not isinstance(ident, str) or not ident.strip() for ident in identifiers) or len(set(identifiers)) != len(identifiers):
            raise ValueError('Unique literal source span IDs required')
        result['$defs']['evidence']['properties']['span_id'] = enum(*identifiers)
    return result


def native_schema(recorded=None, *, catalog=None, source=None):
    """Accept exact legacy contracts or the five exact source identity leaves."""
    if recorded is None:
        return SCHEMA
    if recorded == SCHEMA or recorded == INITIAL_NATIVE_SCHEMA or recorded == CURRENT_SCHEMA:
        return recorded
    if catalog is not None:
        for options in ({}, {'initial': True}, {'structured': True}):
            if recorded == report_schema(catalog, source=source, **options):
                return recorded
    raise ValueError('Unrecognized recorded native request schema')


def check(value, contract, path='$', *, _defs=None):
    """Strict JSON subset; resolve refs from the actual recorded root contract."""
    definitions = contract.get('$defs', DEFS) if _defs is None else _defs
    if '$ref' in contract:
        reference = contract['$ref']
        if not isinstance(reference, str) or not reference.startswith('#/$defs/') or reference.count('/') != 2 or reference.rsplit('/', 1)[-1] not in definitions:
            raise ValueError(path + ': unsupported schema reference')
        contract = definitions[reference.rsplit('/', 1)[-1]]
    kinds = contract.get('type', [])
    kinds = kinds if isinstance(kinds, list) else [kinds]
    match = {'null': value is None, 'object': isinstance(value, dict), 'array': isinstance(value, list),
             'string': isinstance(value, str), 'number': type(value) in (int, float) and math.isfinite(value)}
    if kinds and not any(match.get(k, False) for k in kinds):
        raise ValueError(path + ': invalid type')
    if 'enum' in contract and value not in contract['enum']:
        raise ValueError(path + ': invalid enum')
    if 'const' in contract and value != contract['const']:
        raise ValueError(path + ': foreign constant')
    if isinstance(value, dict):
        props = contract.get('properties', {})
        if set(value) != set(contract.get('required', [])) or set(value) - set(props):
            raise ValueError(path + ': missing or additional fields')
        for key, item in value.items():
            check(item, props[key], path + '.' + key, _defs=definitions)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            check(item, contract['items'], path + '[' + str(index) + ']', _defs=definitions)
    return True
