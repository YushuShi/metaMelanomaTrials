import copy
import unittest
from decimal import Decimal

from metamelanoma.binary_count_recovery import _unique_counts, recover_pair


class TwoArmRecovery(unittest.TestCase):
    def setUp(self):
        self.rows = [dict(id=arm,arm_id=arm,population_id='response',percentage=rate,
                          endpoint='ORR',origin='own_report',evidence=['s'],
                          cutoff='NA',assessment_time='NA') for arm,rate in [('A',18.5),('B',10.2)]]
        self.total = dict(id='n',n=226,arm_id='NA',result_id='NA',method='reported',complete='yes',
                          population_id='response',count_purpose='response_evaluable',cutoff='NA',evidence=['s'])
        self.record = dict(study=dict(randomized='yes',comparison_structure='comparative'),
                           arms=[{'id':'A'},{'id':'B'}],populations=[{'id':'response'}],
                           sample_sizes=[self.total])
        self.text = {'s':'Tumor response was assessable in 226 patients. The response rate to B was 10.2% compared with 18.5% for A (P = .09).'}

    def recover(self):
        return recover_pair(self.record,*self.rows,self.text)

    def test_known_unique_solution_and_direction(self):
        result=self.recover()
        self.assertEqual((result['intervention'],result['reference']),(
            {'numerator':20,'denominator':108},{'numerator':12,'denominator':118}))
        self.rows.reverse()
        self.assertEqual(self.recover()['reference'],result['intervention'])

    def test_endpoint_denominator_and_arm_must_match(self):
        for field,value in [('count_purpose','randomized'),('arm_id','A'),('population_id','ITT')]:
            with self.subTest(field=field):
                old=self.total[field];self.total[field]=value
                self.assertIsNone(self.recover());self.total[field]=old
        self.record['arms'].append({'id':'C'})
        self.assertIsNone(self.recover())

    def test_require_coherent_endpoints_total_and_raw_numbers(self):
        self.record['sample_sizes'].append(dict(self.total,n=240,id='other'))
        self.assertIsNone(self.recover())
        self.record['sample_sizes'].pop()
        for bad in ['Adjusted response rates were 10.2% and 18.5%.',
                    'The rates at baseline were 10.2% and 18.5%.',
                    'The response rate was 10.2% to 18.5% (95% CI, 25%).']:
            with self.subTest(text=bad):
                self.text['s']='Tumor response was assessable in 226 patients. '+bad
                self.assertIsNone(self.recover())

    def test_ambiguous_and_incompatible_math(self):
        self.assertIsNone(_unique_counts(200, [Decimal('50'),Decimal('50')], (None,None), (None,None)))
        self.assertIsNone(_unique_counts(226,[Decimal('18.5'),Decimal('10.2')],(19,None),(None,None)))
        self.assertIsNone(_unique_counts(226,[Decimal('18.50'),Decimal('10.20')],(None,None),(None,None)))
        self.assertIsNone(_unique_counts(226,[Decimal('18.5'),Decimal('10.2')],(None,None),(113,113)))

    def test_incidental_percentages_and_between_cohort_pairing(self):
        self.rows[1]['population_id']='other'
        self.assertIsNone(self.recover())
        self.rows[1]['population_id']='response'
        self.rows[1]['evidence']=['different']
        self.assertIsNone(self.recover())

    def test_cohort_records_are_preserved(self):
        original=copy.deepcopy(self.record)
        self.recover()
        self.assertEqual(self.record,original)


if __name__ == '__main__':
    unittest.main()
