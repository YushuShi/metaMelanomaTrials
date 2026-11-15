from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from metamelanoma.pipeline import namespace_graph, aggregate_fragments, pack_fulltext
from metamelanoma.registry import Registry
from test_registry_pipeline import graph, citation


class RegimenPipelineTests(unittest.TestCase):
    def graph(self):
        value=graph()
        value['entities'].append({'entity_id':'A1','evidence_ids':['E1']})
        value['arm_regimens']=[{'arm_id':'A1','root_node_id':'N1','nodes':[{'node_id':'N1','children':['N2','N3'],'evidence_ids':['E1']},{'node_id':'N2','children':[],'evidence_ids':['E1']},{'node_id':'N3','children':[],'evidence_ids':['E1']}],'evidence_ids':['E1']}]
        value['contrast_definitions']=[{'contrast_id':'C1','single_arm_id':'A1','population_id':'P1','evidence_ids':['E1']}]
        value['facts'][0]['contrast_id']='C1'
        return value

    def test_graph_namespaces_all_expression_nodes_and_directed_contrast_links(self):
        original=self.graph();before=deepcopy(original);out=namespace_graph(original,'fragment')
        self.assertEqual(original,before)
        arm=out['arm_regimens'][0]
        self.assertEqual((arm['arm_id'],arm['root_node_id']),('fragment:A1','fragment:N1'))
        self.assertEqual(arm['nodes'][0]['children'],['fragment:N2','fragment:N3'])
        self.assertEqual(out['facts'][0]['contrast_id'],'fragment:C1')
        self.assertEqual(out['contrast_definitions'][0]['single_arm_id'],'fragment:A1')
        self.assertEqual(out['evidence'][0]['source_id'],'original-source')

    def test_mixed_historical_and_structured_fragments_keep_both_graphs_separate(self):
        with TemporaryDirectory() as tmp:
            registry=Registry(Path(tmp))
            try:
                registry.add_articles([citation()]);registry.save_decision('1','R2','r2','retain','eligible',graph(),{})
                for task,payload in [('old',graph()),('new',self.graph())]:registry.save_fragment(task,'1','R3','retain','eligible',payload,{'sha256':task})
                self.assertTrue(aggregate_fragments(registry,{'task_id':'new','stage':'R3','metadata':{'pmid':'1','article_task_ids':['old','new']}}))
                payload=registry.latest('1','R3')['payload']
                self.assertEqual(len(payload['facts']),2);self.assertEqual(len(payload['arm_regimens']),1)
                self.assertEqual(payload['contrast_definitions'][0]['contrast_id'],'new:C1')
                self.assertNotIn('contrast_id',payload['facts'][0])
            finally:registry.close()
