import importlib.util
from pathlib import Path
import unittest

path=Path(__file__).resolve().parents[1]/'scripts/single_arm_denominators.py'
spec=importlib.util.spec_from_file_location('single_arm_denominators',path)
den=importlib.util.module_from_spec(spec)
spec.loader.exec_module(den)


class SingleArmDenominators(unittest.TestCase):
    def test_unique_count_and_published_percentage(self):
        band=den.precision_band(14.3,['3 partial responses (14.3%)'])
        self.assertEqual(den.n_from_count(band,3)['n'],21)
        self.assertIsNone(den.n_from_count((.245,.255),38))
        self.assertIsNone(den.n_from_count((0,.005),0))

    def test_exact_bounds_against_r_binom_test(self):
        # R stats::binom.test(1, 5) and binom.test(0, 22), default two-sided 95%.
        self.assertTrue(den.interval_matches('exact',1,5,(.0049,.0051),(.716,.717),.05,1.959964))
        self.assertTrue(den.interval_matches('exact',0,22,(0,.001),(.154,.155),.05,1.959964))
        self.assertFalse(den.interval_matches('exact',5,5,(.0049,.0051),(.716,.717),.05,1.959964))

    def test_unknown_method_and_ambiguous_rounded_bounds(self):
        known=den.infer((.195,.205),(.0045,.0055),(.7155,.7165),95,None,'exact')
        self.assertEqual((known['n'],known['status']),(5,'derived'))
        assumed=den.infer((.195,.205),(.0045,.0055),(.7155,.7165),95,None)
        self.assertEqual((assumed['n'],assumed['status']),(5,'approximate'))
        ambiguous=den.infer((0,.005),(0,.005),(.145,.155),95,None)
        self.assertEqual((ambiguous['n'],ambiguous['range'],ambiguous['status']),(22,[21,23],'approximate'))

    def test_unexplained_interval_has_no_denominator(self):
        self.assertIsNone(den.infer((.405,.40501),(.2,.20001),(.406,.4061),95,None))


if __name__=='__main__':
    unittest.main()
