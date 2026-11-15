"""Pure mock scheduling only: no HTTP, model, journal or Registry instances."""
import contextlib
import importlib.util
import importlib
import io
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[2]/'data/proposed_changes/r3_cached_boundary_flush'


def load(name):
    if name == 'candidate':
        return importlib.import_module('metamelanoma.pipeline')
    spec = importlib.util.spec_from_file_location('metamelanoma._boundary_'+name, BASE/(name+'_pipeline.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def simulate(module, cached_fragments, uncached_count, *, workers=128, uncached_success=False, hold_at_dispatch=False):
    events = []; batches = []; fetched = []; compiled = []; documents = {}; citations = []
    for index, count in enumerate(cached_fragments, 1):
        citation = {'pmid':str(index), 'report_id':'r'+str(index), 'doi':None, 'pmcid':None}
        citations.append(citation)
        documents[str(index)] = {'citation':citation, 'document':{'main_full_text_verified':True, 'raw_ref':{}, 'parts':count}}
    for index in range(len(cached_fragments)+1, len(cached_fragments)+uncached_count+1):
        citations.append({'pmid':str(index), 'report_id':'r'+str(index), 'doi':None, 'pmcid':None})

    class Registry:
        def candidates(self, phase, stage): return list(citations) if stage == 'R3' else []
        def latest(self, *args): return {'payload':{'treatment_policy':{'priority':'core'}}}
        def fragments(self, tasks): return []
        def source(self, *args): return None
        def save_source(self, *args): pass
        def snapshot(self): return {'unit':'mock articles'}

    class Sources:
        def __init__(self, *args): pass
        def recover_abstracts(self, citations):
            assert not citations
            return {}
        def fulltext(self, citation):
            if not fetched:
                events.append({'event':'first_uncached_fetch', 'compiled':len(compiled),
                               'dispatched':sum(b['tasks'] for b in batches)})
            fetched.append(citation['pmid'])
            return {'main_full_text_verified':True, 'raw_ref':{}, 'parts':1} if uncached_success else {
                'main_full_text_verified':False, 'reason':'Mock persistent public-source failure'}

    def pack(root, citation, document, upstream, config):
        tasks = [{'task_id':'r3-'+citation['pmid']+'-'+str(n), 'stage':'R3'} for n in range(document['parts'])]
        compiled.extend(t['task_id'] for t in tasks)
        return tasks, []

    def execute(tasks, **kwargs):
        if not tasks: return
        if hold_at_dispatch: raise module.PipelineHeld('Mock source/model boundary HOLD')
        batches.append({'tasks':len(tasks), 'fetched':len(fetched), 'ids':[t['task_id'] for t in tasks]})

    with TemporaryDirectory() as folder:
        pipeline = module.Pipeline.__new__(module.Pipeline)
        pipeline.root = Path(folder).resolve(); pipeline.registry = Registry()
        pipeline.config = {'max_workers':workers, 'include_deferred_treatments':True, 'include_separate_treatments':False}
        pipeline.journal = SimpleNamespace(status=lambda: {}, db=SimpleNamespace(execute=lambda query: []))
        pipeline.open_execution_route = lambda: None; pipeline.publish = lambda **kwargs: None
        pipeline.execute_tasks = execute
        held = False
        with patch.object(module, 'PublicSources', Sources), patch.object(module, 'pack_fulltext', pack), \
                patch.object(module, 'atomic_json', lambda *args: None), \
                patch('metamelanoma.prefetch.verified_cached_documents', return_value=documents), \
                contextlib.redirect_stdout(io.StringIO()):
            try: pipeline.run()
            except module.PipelineHeld: held = True
    return {'events':events, 'batches':batches, 'fetched':len(fetched), 'compiled':compiled, 'held':held}


class BoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = load('baseline'); cls.candidate = load('candidate')

    def test_current_880_sources_1136_fragments_strand112_behind1108_failed_fetches(self):
        result = simulate(self.baseline, [2]*256+[1]*624, 1108)
        self.assertEqual(result['events'], [{'event':'first_uncached_fetch', 'compiled':1136, 'dispatched':1024}])
        self.assertEqual(result['batches'][-1]['tasks'], 112)
        self.assertEqual(result['batches'][-1]['fetched'], 1108)

    def test_proposal_flushes_same112_before_first_uncached_fetch_without_any_task_change(self):
        old = simulate(self.baseline, [2]*256+[1]*624, 1108)
        new = simulate(self.candidate, [2]*256+[1]*624, 1108)
        self.assertEqual(new['events'], [{'event':'first_uncached_fetch', 'compiled':1136, 'dispatched':1136}])
        self.assertEqual(new['batches'][-1]['tasks'], 112); self.assertEqual(new['batches'][-1]['fetched'], 0)
        self.assertEqual(new['compiled'], old['compiled'])
        self.assertEqual([x for b in new['batches'] for x in b['ids']], old['compiled'])

    def test_boundary_is_once_only_and_preserves_subsequent_uncached_batching(self):
        result = simulate(self.candidate, [1], 5, workers=3, uncached_success=True)
        self.assertEqual([(b['tasks'],b['fetched']) for b in result['batches']], [(1,0),(3,3),(2,5)])

    def test_boundary_dispatch_hold_propagates_before_fetch_and_is_not_a_source_failure(self):
        result = simulate(self.candidate, [2], 3, workers=3, hold_at_dispatch=True)
        self.assertTrue(result['held']); self.assertEqual(result['fetched'], 0)

    def test_empty_cache_and_all_cached_paths_keep_existing_threshold_and_final_flush(self):
        for cached, count in [([],5), ([1,1,1,1,1],0)]:
            old = simulate(self.baseline,cached,count,workers=3,uncached_success=True)
            new = simulate(self.candidate,cached,count,workers=3,uncached_success=True)
            self.assertEqual(new,old)


if __name__ == '__main__': unittest.main()
