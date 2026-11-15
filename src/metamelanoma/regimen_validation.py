"""Pure, conservative source checks for the new structured treatment contract.

These checks establish bounded source consistency, not clinical verification.
Historical contracts never enter this module. Ambiguous relational evidence is
held rather than assigning a treatment, direction, dose or value by inference.
"""
from collections import Counter
from copy import deepcopy
import re
import unicodedata


def norm(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value)).replace('–', '-').replace('−', '-').split()).casefold()


def pattern(value):
    return re.compile(r'(?<!\w)' + re.escape(norm(value)).replace(r'\ ', r'\s+') + r'(?!\w)')


def present(value, text):
    return bool(value and pattern(value).search(norm(text)))


def clauses(text):
    return [part for part in re.split(r'[;\n]|(?<=[.!?])\s+(?=[A-Z])', text) if part.strip()]


class RegimenReview:
    def __init__(self, payload, evidence, entities):
        self.payload, self.evidence, self.entities = payload, evidence, entities
        self.arms, self.contrasts = {}, {}
        self.arm_results, self.contrast_results = [], []
        regimens = payload['arm_regimens']; definitions = payload['contrast_definitions']
        arm_counts = Counter(row['arm_id'] for row in regimens)
        nodes = [node['node_id'] for arm in regimens for node in arm['nodes']]
        node_counts = Counter(nodes); contrast_counts = Counter(c['contrast_id'] for c in definitions)
        existing = {row[key] for collection, key in [('entities', 'entity_id'), ('models', 'model_id'),
                    ('facts', 'fact_id'), ('evidence', 'evidence_id')] for row in payload[collection]}
        self.bad_nodes = {i for i, count in node_counts.items() if not i.strip() or count != 1 or i in existing or i in contrast_counts}
        self.bad_contrasts = {i for i, count in contrast_counts.items() if not i.strip() or count != 1 or i in existing or i in node_counts}
        self.declared = {a['arm_id']: a for a in regimens if arm_counts[a['arm_id']] == 1}
        for arm in regimens:
            errors = []
            try:
                if arm_counts[arm['arm_id']] != 1:
                    raise ValueError('Duplicate structured arm definition')
                self._arm(arm)
                self.arms[arm['arm_id']] = arm
            except (ValueError, KeyError) as exc:
                errors.append(str(exc))
            self.arm_results.append({'arm_id': arm['arm_id'], 'status': 'source_checked' if not errors else 'held', 'errors': errors})
        for contrast in definitions:
            errors = []
            try:
                if contrast['contrast_id'] in self.bad_contrasts:
                    raise ValueError('Duplicate/colliding contrast ID')
                self._contrast(contrast)
                self.contrasts[contrast['contrast_id']] = contrast
            except (ValueError, KeyError) as exc:
                errors.append(str(exc))
            self.contrast_results.append({'contrast_id': contrast['contrast_id'], 'status': 'source_checked' if not errors else 'held', 'errors': errors})

    def quotes(self, ids, required=True):
        if len(ids) != len(set(ids)) or any(i not in self.evidence for i in ids) or required and not ids:
            raise ValueError('Structured relationship needs unique owned source evidence')
        return [self.evidence[i]['quote'] for i in ids]

    def arm_quotes(self, arm, ids):
        """Use only an arm-labelled clause before another defined group begins.

        An unlabelled clause in a long shared quote is not evidence that a
        treatment was given to this arm (it may describe a historical cohort).
        """
        output = []
        for quote in self.quotes(ids):
            for part in clauses(quote):
                matches = []
                for ident, other in self.declared.items():
                    matches.extend((m.start(), m.end(), ident) for m in pattern(other['label']).finditer(norm(part)))
                matches.sort(key=lambda m: (m[0], -(m[1] - m[0])))
                selected = []
                for item in matches:
                    if not selected or item[0] >= selected[-1][1]:
                        selected.append(item)
                own = [i for i, item in enumerate(selected) if item[2] == arm['arm_id']]
                if own:
                    for index in own:
                        end = selected[index + 1][0] if index + 1 < len(selected) else len(norm(part))
                        output.append(norm(part)[selected[index][0]:end])
        return output

    @staticmethod
    def _actual_treatment(text):
        # Conservative ambiguity holds: none of these establishes positive
        # current-arm administration of a component. Sequence is checked by
        # the operator separately, since a positively reported sequence is a
        # valid regimen when its declared operator is SEQUENTIAL.
        return not re.search(r'\b(?:not|never|without|prior|previous|previously|historical|unrelated)\b|\bno\s+(?:treatment|therapy|immunotherapy|chemotherapy)\b', text)

    def _operator_witness(self, nodes, children, kind, text):
        if not self._actual_treatment(text):
            return False
        groups = []
        for child in children:
            names = [leaf['name'] for leaf in self._leaves(nodes, child) if leaf['name']]
            if not names or not all(present(name, text) for name in names):
                return False
            hits = [next(pattern(name).finditer(text)) for name in names]
            groups.append((min(m.start() for m in hits), max(m.end() for m in hits), child))
        ordered = sorted(groups)
        if any(a[1] > b[0] for a, b in zip(ordered, ordered[1:])):
            return False
        bridges = [text[a[1]:b[0]] for a, b in zip(ordered, ordered[1:])]
        connector = {'AND': r'\band\b|\bplus\b|\bwith\b|\bcombined\b|\+',
                     'OR': r'\bor\b',
                     'SEQUENTIAL': r'\bfollowed by\b|\bthen\b|\bsubsequently\b'}[kind]
        # A random "with" elsewhere in a population sentence cannot prove
        # concurrency; the connector must occur between the component groups.
        if not any(re.search(connector, bridge) for bridge in bridges):
            return False
        if any(not re.search(connector, bridge) and not re.fullmatch(r'\s*,\s*', bridge) for bridge in bridges):
            return False
        if kind == 'AND' and re.search(r'\bfollowed by\b|\bthen\b|\bsubsequently\b|\bor\b', ' '.join(bridges)):
            return False
        if kind == 'OR' and re.search(r'\band\b|\bplus\b|\bwith\b|\bfollowed by\b|\bthen\b|\+', ' '.join(bridges)):
            return False
        if kind == 'SEQUENTIAL' and groups != ordered:
            return False
        for child in children:
            if nodes[child]['kind'] in {'AND', 'OR', 'SEQUENTIAL'} and nodes[child]['kind'] != kind:
                names = [leaf['name'] for leaf in self._leaves(nodes, child) if leaf['name']]
                parenthetical = re.findall(r'\([^()]+\)', text)
                if not any(all(present(name, group) for name in names) for group in parenthetical) and not (nodes[child]['kind'] == 'OR' and 'either' in text):
                    return False
        return True

    def _arm(self, arm):
        entity = self.entities.get(arm['arm_id'])
        if not entity or entity['kind'] != 'arm' or norm(entity['label']) != norm(arm['label']):
            raise ValueError('Structured arm must bind its exact valid arm entity label')
        if not any(present(arm['label'], q) for q in self.quotes(arm['evidence_ids'])):
            raise ValueError('Arm definition label absent from its source evidence')
        nodes = {node['node_id']: node for node in arm['nodes']}
        if not nodes or arm['root_node_id'] not in nodes or any(i in self.bad_nodes for i in nodes):
            raise ValueError('Missing, duplicate or globally colliding regimen node')
        seen, visiting = set(), set()
        def walk(ident):
            if ident not in nodes or ident in visiting:
                raise ValueError('Foreign/cyclic regimen expression')
            if ident in seen:
                raise ValueError('Regimen expression reuses a node as multiple children')
            visiting.add(ident); node = nodes[ident]; kind = node['kind']; children = node['children']
            if len(children) != len(set(children)):
                raise ValueError('Duplicate regimen child')
            if kind in {'AND', 'OR', 'SEQUENTIAL'}:
                if len(children) < 2 or any(node[k] is not None for k in ['name', 'drug_class', 'dose', 'route', 'schedule']):
                    raise ValueError('Regimen operators need two children and no invented leaf metadata')
                for child in children: walk(child)
                if not any(self._operator_witness(nodes, children, kind, text) for text in self.arm_quotes(arm, node['evidence_ids'])):
                    raise ValueError('Regimen operator lacks positive same-arm component relationship evidence')
            else:
                if children:
                    raise ValueError('Regimen leaf cannot have children')
                if kind == 'UNKNOWN':
                    if any(node[k] is not None for k in ['drug_class', 'dose', 'route', 'schedule']):
                        raise ValueError('Unknown treatment cannot acquire inferred metadata')
                    if node['name'] is not None and not any(present(node['name'], q) for q in self.quotes(node['evidence_ids'])):
                        raise ValueError('Unknown component description absent from source')
                else:
                    if not node['name'] or not node['name'].strip():
                        raise ValueError('Named regimen leaf requires a source treatment name')
                    text = ' '.join(text for text in self.arm_quotes(arm, node['evidence_ids']) if self._actual_treatment(text))
                    if not present(node['name'], text):
                        raise ValueError('Treatment component absent from its same-arm source evidence')
                    for field in ['drug_class', 'dose', 'route', 'schedule']:
                        if node[field] is not None and not present(node[field], text):
                            raise ValueError('Treatment ' + field + ' is not explicitly reported in source')
                        if node[field] is not None:
                            tied = False
                            others = [n['name'] for n in nodes.values() if n['node_id'] != ident and n['name']]
                            for own in pattern(node['name']).finditer(text):
                                for detail in pattern(node[field]).finditer(text):
                                    bridge = text[min(own.end(), detail.end()):max(own.start(), detail.start())]
                                    if not any(present(other, bridge) for other in others) and not re.search(r'\band\b|\bor\b|\bplus\b|\+', bridge):
                                        tied = True
                            if not tied:
                                raise ValueError('Treatment ' + field + ' is not tied to the stated component')
            visiting.remove(ident); seen.add(ident)
        walk(arm['root_node_id'])
        if seen != set(nodes):
            raise ValueError('Orphan regimen node')

    @staticmethod
    def _leaves(nodes, ident):
        node = nodes[ident]
        return [node] if not node['children'] else [leaf for child in node['children'] for leaf in RegimenReview._leaves(nodes, child)]

    def _reference_ids(self, quotes):
        references = set()
        for text in [norm(part) for quote in quotes for part in clauses(quote)]:
            for ident, arm in self.declared.items():
                for own in pattern(arm['label']).finditer(text):
                    for ref in re.finditer(r'\breference(?: (?:group|category|arm))?\b', text):
                        bridge = text[min(own.end(), ref.end()):max(own.start(), ref.start())]
                        relation = re.sub(r'[\s():=,\[\]-]+', ' ', bridge).strip()
                        if relation in {'', 'was', 'is', 'the', 'as', 'as the', 'used as', 'used as the', 'was used as', 'was used as the', 'is used as', 'served as', 'served as the'} and not any(present(other['label'], bridge) for key, other in self.declared.items() if key != ident):
                            references.add(ident)
        return references

    def _ordered(self, experimental, reference, ids, *, quotes=None):
        quotes = self.quotes(ids) if quotes is None else quotes
        ordered, reverse, references = False, False, set()
        references = self._reference_ids(quotes)
        for part in [part for quote in quotes for part in clauses(quote)]:
            text = norm(part)
            if not re.search(r'\bhazard ratio\b|\brisk ratio\b|\bodds ratio\b|\brelative risk\b|\b(?:hr|rr|shr|tr|rd|md|smd)\b|\beffect estimate\b', text) and not re.search(r'\bOR\b', part):
                continue
            for left in pattern(experimental['label']).finditer(text):
                for right in pattern(reference['label']).finditer(text):
                    if left.end() <= right.start() and re.search(r'\bversus\b|\bvs\.?\b|\brelative to\b|\bcompared (?:with|to)\b', text[left.end():right.start()]):
                        ordered = True
                    if right.end() <= left.start() and re.search(r'\bversus\b|\bvs\.?\b|\brelative to\b|\bcompared (?:with|to)\b', text[right.end():left.start()]):
                        reverse = True
        if references:
            return references == {reference['arm_id']} and any(present(experimental['label'], q) for q in quotes)
        return ordered and not reverse

    def _contrast(self, c):
        self.quotes(c['evidence_ids'])
        for key, kind in [('population_id', 'population'), ('endpoint_id', 'endpoint'), ('cutoff_id', 'cutoff')]:
            if c[key] is not None and (c[key] not in self.entities or self.entities[c[key]]['kind'] != kind):
                raise ValueError('Contrast has foreign/wrong-kind ' + key)
        a, b, single = c['experimental_arm_id'], c['reference_arm_id'], c['single_arm_id']
        if c['contrast_type'] == 'single_arm':
            if single not in self.arms or a is not None or b is not None:
                raise ValueError('Single-arm contrast must name one supported actual arm')
        elif a is not None or b is not None or c['contrast_type'] == 'treatment_comparison':
            if a not in self.arms or b not in self.arms or a == b or single is not None:
                raise ValueError('Directed contrast requires two distinct supported arms')
            if not self._ordered(self.arms[a], self.arms[b], c['evidence_ids']):
                raise ValueError('Experimental/reference direction lacks explicit source support')
        elif single is not None:
            raise ValueError('Non-single-arm contrast cannot assert an unpaired single arm')

    def validate_fact(self, f, number_provenance=()):
        clinical = f['domain'] in {'efficacy_outcomes', 'safety_outcomes'}
        for key in ['arm_id', 'experimental_arm_id', 'comparator_arm_id']:
            if f[key] is not None and f[key] not in self.arms:
                raise ValueError('Fact depends on a missing/held structured arm definition')
        c = self.contrasts.get(f['contrast_id']) if f['contrast_id'] is not None else None
        if f['contrast_id'] is not None and c is None:
            raise ValueError('Fact depends on a missing/held directed contrast')
        if c is None and f['comparator_arm_id'] is not None:
            raise ValueError('An asserted reference arm needs its source-directed contrast')
        if clinical and f['contrast_type'] == 'treatment_comparison' and c is None:
            raise ValueError('Comparative clinical result needs a source-directed contrast')
        if c:
            if f['contrast_type'] == 'single_arm':
                allowed = {c['single_arm_id'], c['experimental_arm_id'], c['reference_arm_id']} - {None}
                if f['arm_id'] not in allowed:
                    raise ValueError('Descriptive outcome must bind its actual arm, not only the study contrast')
            elif f['contrast_type'] not in {'other', 'not_applicable', c['contrast_type']}:
                raise ValueError('Fact/contrast scientific type conflict')
            for field, expected in [('experimental_arm_id', c['experimental_arm_id']), ('comparator_arm_id', c['reference_arm_id'])]:
                if f[field] is not None and f[field] != expected:
                    raise ValueError('Fact reverses or changes the source-defined contrast')
            for field in ['endpoint_id', 'cutoff_id']:
                if f[field] is not None and c[field] is not None and f[field] != c[field]:
                    raise ValueError('Fact/contrast ' + field + ' conflict')
            if f['result_population_id'] is not None and c['population_id'] is not None and f['result_population_id'] != c['population_id']:
                raise ValueError('Fact/contrast result population conflict')
        between = bool(re.fullmatch(r'HR|OR|RR|SHR|TR|RD|MD|SMD|hazard ratio|odds ratio|risk ratio|relative risk', f['measure'] or '', re.I))
        model = next((m for m in self.payload['models'] if m['model_id'] == f['model_id']), None)
        if between and c is None and model and len(set(model['arm_ids'])) > 1:
            raise ValueError('A multi-arm effect model needs its source-directed contrast')
        if c and between and c['experimental_arm_id'] and c['reference_arm_id']:
            experimental, reference = self.arms[c['experimental_arm_id']], self.arms[c['reference_arm_id']]
            for index, number in enumerate(f['numbers']):
                if number['role'] != 'estimate' or number['status'] != 'reported' or number['value'] is None:
                    continue
                literal = next((p.get('source_literal') for p in number_provenance if p['number_index'] == index), None) or number['raw_text']
                value_clauses = [part for quote in self.quotes(number['evidence_ids']) for part in clauses(quote) if present(literal, part)]
                directional = self._ordered(experimental, reference, [], quotes=value_clauses)
                reference_only = self._reference_ids(self.quotes(c['evidence_ids'])) == {reference['arm_id']} and any(present(experimental['label'], q) and not present(reference['label'], q) for q in value_clauses)
                if not directional and not reference_only:
                    raise ValueError('Effect estimate is not tied to its directed source contrast')
        reported_values = any(n['status'] == 'reported' and n['value'] is not None and n['role'] != 'confidence_level' for n in f['numbers'])
        descriptive = not between and reported_values and (f['arm_id'] is not None or clinical and f['contrast_type'] in {'single_arm', 'treatment_comparison'})
        if descriptive:
            if f['arm_id'] not in self.arms:
                raise ValueError('Per-arm clinical result needs its actual structured arm')
            arm = self.arms[f['arm_id']]
            for index, number in enumerate(f['numbers']):
                if number['status'] != 'reported' or number['value'] is None or number['role'] == 'confidence_level':
                    continue
                tied = False
                literal = next((p.get('source_literal') for p in number_provenance if p['number_index'] == index), None) or number['raw_text']
                for quote in self.quotes(number['evidence_ids']):
                    for part in clauses(quote):
                        if not present(arm['label'], part) or not present(literal, part):
                            continue
                        other_labels = [a['label'] for ident, a in self.arms.items() if ident != f['arm_id'] and present(a['label'], part)]
                        if not other_labels:
                            tied = True; break
                        for own in pattern(arm['label']).finditer(norm(part)):
                            for value in pattern(literal).finditer(norm(part)):
                                bridge = norm(part)[min(own.end(), value.end()):max(own.start(), value.start())]
                                if not re.search(r'\band\b|\bor\b|\bversus\b|\bwhereas\b', bridge) and not any(present(label, bridge) for label in other_labels):
                                    tied = True
                if not tied:
                    raise ValueError('Reported value lacks an unambiguous tie to its actual arm')

    def result(self):
        return {'arm_regimen_results': deepcopy(self.arm_results), 'contrast_results': deepcopy(self.contrast_results),
                'validated_arm_regimens': deepcopy(list(self.arms.values())),
                'validated_contrast_definitions': deepcopy(list(self.contrasts.values()))}
