from copy import deepcopy
from math import log,sqrt,exp
import unittest

from metamelanoma.binary_effects import calculate, get_rate, interval, ratios, _fuller_concordant


def fixture():
    def arm(key,drug):
        return {'id':key,'population_id':'p','label':drug,'nodes':[{'id':'n','kind':'drug','name':drug,'children':[]}],'root_id':'n'}
    def row(ident,arm,percentage,n,d):
        return dict(id=ident,arm_id=arm,population_id='p',endpoint='ORR',endpoint_definition='Objective response rate',origin='own_report',cutoff='NA',
                    assessment_time='NA',time_unit='NA',safety_attribution='NA',response_criteria='NA',numerator=n,denominator=d,percentage=percentage,evidence=['s'])
    record={'source_sha256':'source','study':{'comparison_structure':'comparative','randomized':'yes','identifiers':[],
            'name':'Study'},'decision':{'status':'retain'},'arms':[arm('a','drug A'),arm('b','placebo')],
            'populations':[{'id':'p','parent_id':'NA','label':'Trial participants','scope':'overall','melanoma_only':'yes'}],
            'binary':[row('qa','a',40,20,50),row('qb','b',20,10,50)],'effects':[],'sample_sizes':[]}
    return {'stage':'R2','record':record}, {'qa':{'arm':{}},'qb':{'arm':{}}}, {'s':'The objective response rate was 40% versus 20% (P = .08).'}


class BinaryComparisonTests(unittest.TestCase):
    def test_arm_specific_counts_and_original_test(self):
        inputs=fixture()
        results={r['measure']:r for r in calculate(*inputs)}
        self.assertEqual(set(results),{'RR','OR'})
        self.assertEqual(results['RR']['estimate'],2)
        self.assertAlmostEqual(results['OR']['estimate'],8/3)
        self.assertAlmostEqual(results['RR']['ci_lower'],exp(log(2)-1.95996398454*sqrt(1/20+1/10-2/50)))
        self.assertEqual(results['RR']['analysis_n'],100)
        self.assertEqual(results['RR']['calculation']['reported_comparison_test']['value'],.08)
        self.assertEqual(results['RR']['p_value'],'NA')
        self.assertEqual(results['RR']['calculation']['orientation'],'treatment_versus_control')

    def test_percentages_alone_and_zero_boundary(self):
        w,rows,spans=fixture()
        for r in w['record']['binary']:r.update(numerator='NA',denominator='NA')
        results=calculate(w,rows,spans)
        self.assertEqual([r['ci_lower'] for r in results],['NA','NA'])
        self.assertEqual(ratios(0,.5),{'RR':0,'OR':0})
        self.assertEqual(ratios(.3,0),{'RR':None,'OR':None})
        self.assertEqual(ratios(1,.5),{'RR':2,'OR':None})
        self.assertIsNone(get_rate({'numerator':1,'denominator':10,'percentage':50}))

    def test_distinct_timepoints_populations_and_terms(self):
        for field,value in [('assessment_time',2),('response_criteria','iRECIST'),('cutoff','April 2000'),('population_id','other'),
                            ('endpoint_definition','Intracranial objective response')]:
            w,rows,spans=fixture()
            w['record']['binary'][1][field]=value
            self.assertEqual(calculate(w,rows,spans),[],field)
        w,rows,spans=fixture()
        for r in w['record']['binary']:r.update(endpoint='AE_any',endpoint_definition='NA')
        self.assertEqual(calculate(w,rows,spans),[])

    def test_reported_precedence_and_citations(self):
        w,rows,spans=fixture()
        w['record']['effects']=[dict(id='pub',origin='own_report',measure='RR',estimate=2.1,reference_arm_id='b',intervention_arm_id='a',endpoint='ORR',population_id='p')]
        self.assertEqual([r['measure'] for r in calculate(w,rows,spans)],['OR'])
        w['record']['binary'][0]['origin']='cited_report'
        self.assertFalse(calculate(w,rows,spans))

    def test_distinct_toxicities_and_followup_do_not_block_new_comparisons(self):
        w,rows,spans=fixture()
        record=w['record']
        for r in record['binary']:
            r.update(endpoint='AE_any',endpoint_definition='Nausea',assessment_time=6,time_unit='months')
        reported=dict(id='pub',origin='own_report',measure='OR',estimate=2,reference_arm_id='b',
                      intervention_arm_id='a',endpoint='AE_any',population_id='p',
                      endpoint_definition='Diarrhea',assessment_time=6,time_unit='months')
        record['effects']=[reported]
        self.assertEqual({r['measure'] for r in calculate(w,rows,spans)},{'RR','OR'})
        reported.update(endpoint_definition='Nausea',assessment_time=12)
        self.assertEqual({r['measure'] for r in calculate(w,rows,spans)},{'RR','OR'})
        reported.update(assessment_time=6)
        self.assertEqual({r['measure'] for r in calculate(w,rows,spans)},{'RR'})
        for r in [reported,*record['binary']]:
            r.update(endpoint='ORR',endpoint_definition='Objective response rate')
        reported.update(assessment_time=12)
        self.assertEqual({r['measure'] for r in calculate(w,rows,spans)},{'RR','OR'})

    def test_reported_ratio_assessor_and_analysis_population(self):
        w,rows,spans=fixture()
        record=w['record']
        for r in record['binary']:
            r.update(endpoint_definition='Response in the full analysis set',response_criteria='BICR per RECIST v1.1')
        record['effects']=[dict(id='or',origin='own_report',measure='OR',estimate=1.59,reference_arm_id='b',
            intervention_arm_id='a',endpoint='ORR',population_id='p',endpoint_definition='BICR-assessed ORR in the full analysis set')]
        self.assertEqual({r['measure'] for r in calculate(w,rows,spans)},{'RR'})
        for r in record['binary']:
            r.update(endpoint_definition='Confirmed response',response_criteria='Independent central review per RECIST v1.1')
        self.assertEqual({r['measure'] for r in calculate(w,rows,spans)},{'RR','OR'})
        for r in record['binary']:
            r.update(endpoint_definition='Response in the full analysis set',response_criteria='Investigator assessment per RECIST v1.1')
        self.assertEqual({r['measure'] for r in calculate(w,rows,spans)},{'RR','OR'})

    def test_richer_compatible_earlier_interval_preferred(self):
        w,rows,spans=fixture()
        newer=deepcopy(w)
        newer['stage']='R3'
        for r in newer['record']['binary']:r.update(numerator='NA',denominator='NA')
        earlier=calculate(w,rows,spans)[0]
        later=calculate(newer,rows,spans)[0]
        scope=('ORR','RR',('drug a','placebo'),'overall','people')
        self.assertTrue(_fuller_concordant((w,earlier,scope,{}),(newer,later,scope,{})))
        later['calculation']['intervention']['percentage']=30
        self.assertFalse(_fuller_concordant((w,earlier,scope,{}),(newer,later,scope,{})))

    def test_multistudy_and_non_independent_designs(self):
        w,rows,spans=fixture()
        self.assertFalse(calculate(w,rows,spans,title='Combined analysis of two trials'))
        self.assertFalse(calculate(w,rows,spans,title='An indirect treatment comparison of two trials'))
        paired=calculate(w,rows,spans,title='A matched cohort study')
        self.assertEqual(len(paired),2)
        self.assertTrue(all(r['ci_lower']=='NA' for r in paired))

    def test_overlapping_and_longitudinal_arms_do_not_generate_effects(self):
        w,rows,spans=fixture()
        arms=w['record']['arms']
        def drug(arm,name):
            arm['label']=name
            arm['nodes'][0]['name']=name
        drug(arms[0],'immune checkpoint inhibitor');drug(arms[1],'nivolumab')
        self.assertFalse(calculate(w,rows,spans))
        drug(arms[0],'Drug combination')
        self.assertFalse(calculate(w,rows,spans))
        drug(arms[0],'nivolumab');drug(arms[1],'ipilimumab')
        arms[0]['label']='Prior nivolumab';arms[1]['label']='Subsequent ipilimumab'
        self.assertFalse(calculate(w,rows,spans))
        for methods in (
            'Patients with advanced melanoma participating in different phase 1/2 or phase 3 clinical trials were treated with the MEK inhibitor.',
            'Thirty-two patients with advanced cutaneous melanoma were treated with binimetinib (MEK162) in three different Phase 1b or 2 clinical trials.',
            'DBDT was used as first-line, second-line, and third-line (following the first two regimens in cases refractory to treatment).'
        ):
            w,rows,spans=fixture()
            self.assertFalse(calculate(w,rows,{**spans,'methods':methods}),methods)
        self.assertTrue(calculate(w,rows,{**spans,'methods':'Two concurrent phase II clinical trials (with randomization) in one study.'}))

    def test_ambiguous_rates_and_conflict(self):
        w,rows,spans=fixture()
        w['record']['binary'].append({**w['record']['binary'][0],'id':'qc','percentage':60,'numerator':30})
        rows['qc']={'arm':{}}
        self.assertEqual(calculate(w,rows,spans),[])
        del w['record']['binary'][-1];rows['qa']['extraction_conflict']=True
        self.assertFalse(calculate(w,rows,spans))
