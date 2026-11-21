import json
import unittest
from types import SimpleNamespace

from metamelanoma.complementary_corroboration import corroborate


class TableCorroborationTests(unittest.TestCase):
    def setUp(self):
        self.markup = """<table-wrap><caption>Response to therapy in melanoma</caption>
<table><thead><tr><th rowspan="2">Response</th><th colspan="2">Drug A (N=40)</th><th>Drug B (N=20)</th></tr>
<tr><th>No.</th><th>%</th><th>N (%)</th></tr></thead>
<tbody><tr><td>CR</td><td>10</td><td>25</td><td>8 (40)</td></tr>
<tr><td>PR</td><td>8</td><td>20</td><td>2 (10)</td></tr></tbody></table></table-wrap>"""
        self.pop = {'id':'all','scope':'overall','melanoma_only':'yes','label':'Melanoma'}
        self.row = dict(id='result', origin='own_report', population_id='all', arm_id='b', endpoint='CR',
                        numerator='NA', percentage=40, denominator=20, evidence=['span'])
        self.record = dict(populations=[self.pop], binary=[self.row], arms=[
            {'id':'a','label':'Drug A'}, {'id':'b','label':'Drug B'}])
        self.target = dict(record_id='r',stage='R3',source_sha256='hash',record=self.record)
        self.finding = dict(target=dict(stage='R3',source_sha256='hash',record_id='r',row_id='result',
                            section='binary',field_path='/binary/0/numerator'),scope_relation='same',
                            action='addition',value_json='8',expected_value_json='"NA"',reason='Table gives this count.')
        self.context=SimpleNamespace(spans={'span':{'document_role':'main_article_table','text':self.markup}},
                                     _proof=lambda f, rid: [{'span_id':'span','quote':'8 (40)'}])

    def resolve(self, proposed=None):
        if proposed is not None:
            self.finding['value_json']=json.dumps(proposed)
        return corroborate(self.finding,self.target,self.context)

    def test_distinct_columns_and_cell_roles(self):
        result=self.resolve(8)
        self.assertEqual(result['edits'],[dict(field_path='/binary/0/numerator',before='NA',after=8)])
        self.assertTrue(any('Drug B' in e['quote'] for e in result['evidence']))
        self.assertTrue(any('<tr><td>CR' in e['quote'] for e in result['evidence']))
        self.assertIsNone(self.resolve(40))
        self.assertIsNone(self.resolve(10))
        self.row.update(arm_id='a',percentage=25,denominator=40)
        self.assertIsNone(self.resolve(8))
        self.assertIsNotNone(self.resolve(10))
        self.row.update(numerator=10,percentage='NA')
        self.finding['target']['field_path']='/binary/0/percentage'
        self.assertIsNotNone(self.resolve(25))

    def test_refuses_subgroup_duplicates_and_incompatible_denominator(self):
        self.pop['scope']='subgroup'
        self.assertIsNone(self.resolve())
        self.pop['scope']='overall'
        self.row['denominator']=40
        self.assertIsNone(self.resolve())
        self.row['denominator']=20
        self.context.spans['span']['text']=self.markup.replace('<td>PR</td>','<td>CR</td>')
        self.assertIsNone(self.resolve())

    def test_rejects_unsupported_scope_and_allocation(self):
        self.finding['reason']='The tables are inconsistent.'
        self.assertIsNone(self.resolve())
        self.finding['reason']='Additional count.'
        self.row['arm_id']='a'
        self.record['arms'][0]['label']='Drug A or Drug B'
        self.assertIsNone(self.resolve())
        self.row['arm_id']='b'
        self.record['arms'].append({'id':'b2','label':'Drug B'})
        self.assertIsNone(self.resolve())

    def test_subgroup_count_requires_analysis_population_and_correct_reference(self):
        table="""<table-wrap><caption>OS in melanoma patients treated with Agent B</caption><table>
<thead><tr><th/><th>N</th><th>Hazard ratio</th></tr></thead><tbody>
<tr><td colspan="3">IFNG expression</td></tr><tr><td>High</td><td>19</td><td>1.00</td></tr>
<tr><td>Low</td><td>3</td><td>1.10</td></tr></tbody></table></table-wrap>"""
        self.context.spans['span']['text']=table
        self.context._proof=lambda f,rid:[{'span_id':'span','quote':'<td>19</td>'}]
        self.pop.update(scope='subgroup',label='Melanoma, high IFNG expression (survival analysis)')
        self.record.update(arms=[{'id':'b','label':'Agent B'}],survival=[
            dict(id='os',population_id='all',arm_id='b',endpoint='OS')],sample_sizes=[
            dict(id='ss',population_id='all',arm_id='b',result_id='os',count_purpose='outcome_analysis',
                 component_ids=[],n='NA',evidence=['span'],cutoff='NA',method='reported')])
        self.finding['target'].update(section='sample_sizes',field_path='/sample_sizes/0/n',row_id='ss')
        self.assertIsNotNone(self.resolve(19))
        self.assertIsNone(self.resolve(3))
        self.record['survival'][0]['endpoint']='PFS'
        self.assertIsNone(self.resolve(19))
        self.record['survival'][0]['endpoint']='OS'
        self.record['sample_sizes'][0]['count_purpose']='enrolled'
        self.assertIsNone(self.resolve(19))


if __name__=='__main__':
    unittest.main()
