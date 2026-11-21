import unittest

from metamelanoma.complementary_routing import describe, equivalent, model_row, plain, supplementary_only


class RoutingTests(unittest.TestCase):
    def test_additional_information_for_empty_fields(self):
        finding = {'target': {'field_path': '/populations/-'}, 'action': 'addition',
                   'reason': 'Adds the baseline PD-L1 negative stratum.'}
        self.assertTrue(supplementary_only(finding, None, {'label': 'PD-L1 negative'}))
        self.assertFalse(supplementary_only(finding, 'overall', 'PD-L1 negative'))

    def test_inequalities_survive_table_cleanup(self):
        self.assertEqual(plain('<b>PFS</b> p<0.01 and HR>1'), 'PFS p<0.01 and HR>1')

    def test_matching_number_can_have_a_disputed_counting_unit(self):
        loc = {'section': 'sample_sizes', 'field_path': '/sample_sizes/0/n', 'stage': 'R3'}
        target = {'record': {'sample_sizes': [{'id': 'n1', 'n': 84, 'count_purpose': 'treated'}]}}
        finding = {'target': loc, 'reason': 'The paper counts 84 specimens. The patient count is unclear.', 'id': 'f'}
        row = model_row({'PMID': '123'}, finding, target, 84, 84)
        self.assertEqual(row['gpt'], '84')
        self.assertIn('specimens', row['opus'])
        self.assertIn('unique patients', row['recommendation'])

    def test_registration_and_nested_labels_are_readable(self):
        self.assertEqual(describe({'registry':'EudraCT','id':'2012-000307-32'}), 'EudraCT 2012-000307-32')
        self.assertTrue(equivalent({'denominator':10}, {'denominator':10, 'evidence':['some source']}))
        self.assertFalse(equivalent({'denominator':11}, {'denominator':10}))

if __name__ == '__main__':
    unittest.main()
