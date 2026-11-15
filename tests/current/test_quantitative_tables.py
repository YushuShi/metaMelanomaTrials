from copy import deepcopy
import unittest

from metamelanoma.io import digest
from metamelanoma.quantitative_tables import patient_count


TABLE = '''<section><h3>Baseline Patient Characteristics at Time of Diagnosis of Brain Metastases</h3>
<table><thead><tr><th rowspan="2">Characteristic</th><th colspan="2">No. (%)</th><th rowspan="2">P Value</th></tr>
<tr><th>No Immunotherapy<br>(n=365)</th><th>Immunotherapy<br>(n=115)</th></tr></thead><tbody>
<tr><td>Sex</td><td></td><td></td><td>.13</td></tr>
<tr><td>Male</td><td>199 (55)</td><td>72 (63)</td><td></td></tr>
<tr><td>Primary cancer</td><td></td><td></td><td>&lt;.001</td></tr>
<tr><td>Melanoma</td><td>73 (20)</td><td>72 (63)</td><td></td></tr>
<tr><td>NSCLC</td><td>256 (70)</td><td>38 (33)</td><td></td></tr>
<tr><td>Extracranial disease sites</td><td></td><td></td><td></td></tr>
<tr><td>Lung</td><td>169 (46)</td><td>72 (63)</td><td></td></tr>
</tbody></table></section>'''
DEFINITION = ('We identified480 patients with newly diagnosed brain metastases from melanoma and other cancers; '
    'of these, 115 patients received immunotherapeutic checkpoint inhibitors (ipilimumab, pembrolizumab, or nivolumab) '
    'whereas365 did not. Patients received immunotherapy for a median of14months.')


def span(ident, text, role='main_article'):
    return {'span_id': ident, 'source_id': 'source', 'block_id': ident, 'text': text,
        'text_sha256': digest(text.encode()), 'is_target': True, 'planned_only': False,
        'document_role': role}


class TablePatientCountTests(unittest.TestCase):
    def setUp(self):
        self.spans = {'table': span('table', TABLE, 'main_article_table'),
                      'definition': span('definition', DEFINITION)}
        self.populations = {
            'all': {'id': 'all', 'melanoma_only': 'no', 'label': 'Patients with brain metastases from melanoma and other cancers',
                    'scope': 'overall', 'parent_id': 'NA', 'cutoff': 'NA', 'evidence': ['definition']},
            'mel': {'id': 'mel', 'melanoma_only': 'yes', 'label': 'Melanoma patients with brain metastases',
                    'scope': 'subgroup', 'parent_id': 'all', 'cutoff': 'NA', 'evidence': ['definition', 'table']}}
        self.arms = {
            'io': {'id': 'io', 'population_id': 'mel', 'label': 'Immunotherapy (ipilimumab, pembrolizumab, or nivolumab)',
                   'root_id': 'or', 'nodes': [{'id': 'or', 'kind': 'OR', 'name': 'NA', 'children': ['ipi', 'pembro', 'nivo']},
                       *[{'id': ident, 'kind': 'drug', 'name': drug, 'children': []}
                         for ident, drug in [('ipi', 'ipilimumab'), ('pembro', 'pembrolizumab'), ('nivo', 'nivolumab')]]],
                   'evidence': ['definition', 'table']},
            'control': {'id': 'control', 'population_id': 'mel', 'label': 'No immunotherapy',
                        'root_id': 'no', 'nodes': [{'id': 'no', 'kind': 'control', 'name': 'No immunotherapy', 'children': []}],
                        'evidence': ['table']}}
        self.row = {'id': 'count', 'population_id': 'mel', 'arm_id': 'io', 'count_purpose': 'outcome_analysis',
                    'method': 'reported', 'cutoff': 'NA', 'evidence': ['table']}

    def check(self, value=72):
        return patient_count(self.row, value, self.spans, self.populations, self.arms)

    def replace_table(self, text):
        self.spans['table'] = span('table', text, 'main_article_table')

    def test_expanded_header_preserves_count_row_column_and_raw_proof(self):
        before = deepcopy((self.row, self.spans, self.populations, self.arms))
        proof = self.check()
        self.assertEqual(proof['value'], 72)
        self.assertEqual(proof['column_heading'], 'Immunotherapy')
        self.assertEqual(proof['column_total'], 115)
        self.assertEqual(proof['row_group'], 'Primary cancer')
        self.assertEqual(proof['row_label'], 'Melanoma')
        self.assertEqual(proof['cell_literal'], '72 (63)')
        self.assertEqual(proof['column_index'], 2)
        self.assertEqual(proof['cell_raw_html'], TABLE[proof['cell_char_start_in_span']:proof['cell_char_end_in_span']])
        self.assertEqual(proof['arm_binding']['method'], 'source_defined_or_regimen_and_header_total')
        self.assertEqual((self.row, self.spans, self.populations, self.arms), before)
        self.row['arm_id'] = 'control'
        self.assertEqual(self.check(73)['column_heading'], 'No Immunotherapy')

    def test_reversed_arms_percentages_and_mixed_group_totals_do_not_pass(self):
        for arm, value in [('io', 73), ('control', 72), ('io', 63), ('control', 20), ('io', 115), ('control', 365)]:
            with self.subTest(arm=arm, value=value):
                self.row['arm_id'] = arm
                self.assertIsNone(self.check(value))

    def test_repeated_number_in_other_rows_is_not_support(self):
        self.replace_table(TABLE.replace('<td>Melanoma</td><td>73 (20)</td><td>72 (63)</td>',
                                         '<td>Melanoma</td><td>73 (20)</td><td>71 (62)</td>'))
        self.assertIsNone(self.check(72))
        self.assertIsNotNone(self.check(71))

    def test_duplicate_disease_rows_or_treatment_columns_are_ambiguous(self):
        duplicate = '<tr><td>Melanoma</td><td>73 (20)</td><td>72 (63)</td><td></td></tr>'
        self.replace_table(TABLE.replace('</tbody>', duplicate + '</tbody>'))
        self.assertIsNone(self.check())
        self.replace_table(TABLE.replace('No Immunotherapy<br>(n=365)', 'Immunotherapy<br>(n=115)'))
        self.assertIsNone(self.check())

    def test_wrong_population_restriction_or_cutoff_is_not_melanoma_row(self):
        for update in [{'melanoma_only': 'no'}, {'label': 'Male melanoma patients with brain metastases'},
                       {'label': 'BRAF-mutant melanoma patients with brain metastases'}, {'parent_id': 'NA'}]:
            original = deepcopy(self.populations['mel'])
            self.populations['mel'].update(update)
            self.assertIsNone(self.check())
            self.populations['mel'] = original
        self.row['cutoff'] = 'different'
        self.assertIsNone(self.check())

    def test_event_or_lesion_count_tables_and_missing_units_are_rejected(self):
        for old, new in [('Primary cancer', 'Metastatic lesions'),
                         ('Baseline Patient Characteristics', 'Events per patient'),
                         ('No. (%)', 'Percent'), ('No. (%)', 'Events (%)')]:
            self.replace_table(TABLE.replace(old, new))
            self.assertIsNone(self.check())

    def test_no_broad_class_inference_or_AND_OR_confusion(self):
        original = deepcopy(self.arms['io'])
        self.arms['io']['nodes'][0]['kind'] = 'AND'
        self.assertIsNone(self.check())
        self.arms['io'] = deepcopy(original)
        self.arms['io']['nodes'][0]['children'] = ['ipi']
        self.assertIsNone(self.check())
        self.arms['io'] = deepcopy(original)
        self.arms['io']['label'] = 'Immunotherapy'
        self.assertIsNone(self.check())
        self.arms['io'] = deepcopy(original)
        self.arms['io']['evidence'] = ['table']
        self.assertIsNone(self.check())

    def test_source_definition_must_contain_exact_regimen_and_group_n(self):
        for old, new in [('115 patients', '116 patients'), ('or nivolumab', 'and nivolumab'),
                         ('ipilimumab, pembrolizumab, or nivolumab', 'ipilimumab or nivolumab')]:
            self.spans['definition'] = span('definition', DEFINITION.replace(old, new))
            self.assertIsNone(self.check())

    def test_supplement_protocol_foreign_and_changed_bytes_are_rejected(self):
        original = deepcopy(self.spans['table'])
        for update in [{'document_role': 'protocol'}, {'document_role': 'main_article'},
                       {'is_target': False}, {'planned_only': True}, {'text_sha256': 'changed'}]:
            self.spans['table'] = {**original, **update}
            self.assertIsNone(self.check())
        self.spans['table'] = original
        self.row['evidence'] = ['missing']
        self.assertIsNone(self.check())

    def test_malformed_or_incomplete_grid_and_inconsistent_percentage_rejected(self):
        for changed in [TABLE.replace('</table>', ''), TABLE.replace('rowspan="2"', 'rowspan="999"'),
                        TABLE.replace('colspan="2"', 'colspan="3"'),
                        TABLE.replace('72 (63)', '72 (99)'),
                        TABLE.replace('<td>Melanoma</td>', '<td rowspan="2">Melanoma</td>')]:
            self.replace_table(changed)
            self.assertIsNone(self.check())

    def test_only_sample_size_role_and_nonnegative_integers(self):
        for value in [True, 72.0, '72', -72]:
            self.assertIsNone(self.check(value))
        for purpose in ['safety', 'randomized', 'response_evaluable', 'enrolled']:
            self.row['count_purpose'] = purpose
            self.assertIsNone(self.check())


if __name__ == '__main__':
    unittest.main()
