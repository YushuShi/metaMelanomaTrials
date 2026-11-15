"""Finite archive safety and conservation; all mutations use temporary roots."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from metamelanoma import maintenance as m


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve()
        self.files={
            'src/metacutaneous/old.py':b'# exact old source\n',
            'src/metasamplesize/old.py':b'# another exact source\n',
            'scripts/run_old.py':b'print("old launcher")\n',
            'tests/test_old.py':b'# old test\n',
            'tests/current/test_current.py':b'# current test\n',
            'website/scripts/old_exporter.py':b'# obsolete exporter\n',
            'website/scripts/article_progress.py':b'# current exporter\n',
            'website/tests/test_old_v1.py':b'# old UI test\n',
            'website/tests/test_article_progress.py':b'# current UI test\n',
            'website/dist/numeric_completion_v6_display.js':b'// old finite display\n',
            'website/dist/app.js':b'// canonical app\n',
            'website/dist/index.html':b'<!doctype html>canonical\n',
            'website/dist/data/studies.json':b'{"authoritative":"unchanged"}\n',
            'data/extraction/source.json':b'{"saved":"source"}\n',
            'runs/native/receipt.json':b'{"saved":"receipt"}\n',
            'website/ui_review/held/code.py':b'# immutable producing source\n',
            'website/release_history/baseline.json':b'{"saved":"release"}\n',
        }
        for path,raw in self.files.items():self.write(path,raw)

    def write(self,path,raw):
        target=self.root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw);return target

    def plan(self):
        plan=m.inventory(self.root);self.assertEqual(plan['blocked_paths'],[])
        return plan,m.save_plan(self.root,plan)

    def test_dry_run_does_not_move_or_remove(self):
        plan,ref=self.plan()
        self.assertEqual(plan['counts']['code_files'],7)
        self.assertFalse((self.root/'archive').exists())
        for path,raw in self.files.items():self.assertEqual((self.root/path).read_bytes(),raw)
        self.assertEqual(ref['bytes'],(self.root/ref['path']).stat().st_size)

    def test_no_move_without_explicit_go(self):
        plan,ref=self.plan()
        with self.assertRaises(PermissionError):m.archive(self.root,ref)
        self.assertTrue((self.root/'src/metacutaneous/old.py').is_file())

    def test_keep_names_only_apply_at_canonical_directory_root(self):
        self.write('website/scripts/old_copy/article_progress.py',b'# old duplicate\n')
        self.write('website/tests/old_copy/test_article_progress.py',b'# old duplicate test\n')
        plan,ref=self.plan();paths={r['path']for r in plan['entries']}
        self.assertIn('website/scripts/old_copy/article_progress.py',paths)
        self.assertIn('website/tests/old_copy/test_article_progress.py',paths)
        m.archive(self.root,ref,approved=True)
        self.assertTrue((self.root/'website/scripts/article_progress.py').is_file())

    def test_exact_archive_and_all_protected_history_conserved(self):
        plan,ref=self.plan();complete=m.archive(self.root,ref,approved=True)
        self.assertEqual(complete['status'],'complete')
        for item in plan['entries']:
            self.assertFalse((self.root/item['path']).exists())
            self.assertEqual((self.root/item['archive_path']).read_bytes(),self.files[item['path']])
        for path,raw in self.files.items():
            if path not in {item['path']for item in plan['entries']}:
                self.assertEqual((self.root/path).read_bytes(),raw)
        post=json.loads((self.root/complete['post_manifest']['path']).read_bytes())
        self.assertTrue(post['all_archive_hashes_verified'])
        self.assertTrue(post['protected_files_unchanged'])
        self.assertEqual(m.archive(self.root,ref,approved=True),complete)

    def test_credential_named_path_stops_before_any_content_read(self):
        self.write('scripts/credentials.json',b'never inspect this file')
        with patch.object(Path,'read_bytes',side_effect=AssertionError('content read')):
            plan=m.inventory(self.root)
        self.assertEqual(plan['status'],'blocked')
        self.assertEqual(plan['entries'],[])
        self.assertTrue(any(r['reason']=='credential_named_path_not_opened'for r in plan['blocked_paths']))
        self.assertFalse((self.root/'archive').exists())

    def test_new_credential_after_plan_stops_all_moves(self):
        plan,ref=self.plan();self.write('src/metacutaneous/recovery_codes.txt',b'not read')
        with self.assertRaises(ValueError):m.archive(self.root,ref,approved=True)
        self.assertFalse((self.root/'archive').exists())
        self.assertTrue((self.root/'src/metacutaneous/old.py').is_file())

    def test_source_alias_not_followed(self):
        target=self.write('private.env',b'no secret read')
        (self.root/'scripts/alias.py').symlink_to(target)
        plan=m.inventory(self.root)
        self.assertEqual(plan['status'],'blocked')
        self.assertTrue(any('alias'in r['reason']for r in plan['blocked_paths']))

    def test_archive_parent_alias_rejected_before_any_move(self):
        plan,ref=self.plan();outside=self.root/'unrelated';outside.mkdir()
        (self.root/'archive').symlink_to(outside,target_is_directory=True)
        with self.assertRaises(ValueError):m.archive(self.root,ref,approved=True)
        self.assertEqual(list(outside.iterdir()),[])
        self.assertTrue((self.root/'scripts/run_old.py').is_file())

    def test_source_drift_preflight_does_not_partially_move(self):
        plan,ref=self.plan();self.write('scripts/run_old.py',b'# newly changed\n')
        with self.assertRaises(ValueError):m.archive(self.root,ref,approved=True)
        self.assertFalse((self.root/'archive').exists())

    def test_destination_conflict_does_not_overwrite(self):
        plan,ref=self.plan();target=self.write('archive/legacy_code/scripts/run_old.py',b'# different saved code\n')
        with self.assertRaises(ValueError):m.archive(self.root,ref,approved=True)
        self.assertEqual(target.read_bytes(),b'# different saved code\n')
        self.assertTrue((self.root/'scripts/run_old.py').is_file())

    def test_old_success_receipt_cannot_clear_restored_active_code(self):
        plan,ref=self.plan();m.archive(self.root,ref,approved=True)
        self.write('scripts/run_old.py',self.files['scripts/run_old.py'])
        with self.assertRaises(ValueError):m.archive(self.root,ref,approved=True)
        self.assertTrue((self.root/'scripts/run_old.py').exists())

    def test_partial_move_has_truthful_receipt_and_can_resume(self):
        plan,ref=self.plan();real=m.os.rename;calls=[]
        def interrupt(source,target):
            calls.append(str(source))
            if len(calls)==2:raise OSError('temporary filesystem error')
            return real(source,target)
        with patch.object(m.os,'rename',side_effect=interrupt):
            with self.assertRaises(OSError):m.archive(self.root,ref,approved=True)
        self.assertFalse((self.root/'data/current/cleanup_complete.json').exists())
        receipts=list((self.root/Path(ref['path']).parent).glob('interrupted_*.json'))
        self.assertEqual(len(receipts),1)
        self.assertEqual(json.loads(receipts[0].read_bytes())['status'],'partial_archive_needs_resume')
        complete=m.archive(self.root,ref,approved=True)
        self.assertEqual(complete['archived_code_files'],len(plan['entries']))

    def test_only_disposable_caches_are_deleted(self):
        self.write('src/metacutaneous/__pycache__/old.cpython-314.pyc',b'bytecode')
        self.write('tests/.pytest_cache/README.md',b'reproducible cache')
        plan,ref=self.plan();self.assertEqual(len(plan['disposable_caches']),2)
        m.archive(self.root,ref,approved=True)
        for row in plan['disposable_caches']:
            self.assertFalse((self.root/row['path']).exists())
            self.assertFalse((self.root/'archive/legacy_code'/row['path']).exists())
        self.assertTrue((self.root/'tests/current/test_current.py').is_file())

    def test_unknown_content_in_bytecode_directory_is_preserved(self):
        raw=b'{"source_artifact":"must survive"}\n'
        path='src/metacutaneous/__pycache__/packet.json';self.write(path,raw)
        plan,ref=self.plan()
        self.assertIn(path,{r['path']for r in plan['entries']})
        self.assertNotIn(path,{r['path']for r in plan['disposable_caches']})
        m.archive(self.root,ref,approved=True)
        self.assertEqual((self.root/m.ARCHIVE_ROOT/path).read_bytes(),raw)

    def test_active_legacy_import_blocks_application(self):
        self.write('src/metamelanoma/helper.py',b'from metacutaneous import review\n')
        plan=m.inventory(self.root)
        self.assertEqual(plan['status'],'blocked')
        ref=m.save_plan(self.root,plan)
        with self.assertRaises(ValueError):m.archive(self.root,ref,approved=True)
        self.assertFalse((self.root/'archive').exists())

    def test_stale_active_asset_reference_blocks_archive(self):
        self.write('website/dist/index.html',b'<script src="numeric_completion_v6_display.js"></script>')
        plan=m.inventory(self.root)
        self.assertTrue(any(r['reason']=='active_reference_to_archived_asset'for r in plan['blocked_paths']))

    def test_saved_result_drift_stops_before_move(self):
        plan,ref=self.plan();self.write('website/dist/data/studies.json',b'changed by another release')
        with self.assertRaises(ValueError):m.archive(self.root,ref,approved=True)
        self.assertFalse((self.root/'archive').exists())

    def test_manipulated_plan_cannot_move_evidence_or_current_tests(self):
        original=m.inventory(self.root)
        for path in ('data/extraction/source.json','tests/current/test_current.py'):
            plan=copy.deepcopy(original)
            row={'path':path,'archive_path':m.ARCHIVE_ROOT+'/'+path,'bytes':1,'mode':0o600,'sha256':'0'*64}
            plan['entries'].append(row);plan['plan_id']=m._identity(plan)
            with self.assertRaises(ValueError):m.save_plan(self.root,plan)

    def test_manipulated_plan_cannot_remove_protected_directory(self):
        plan=m.inventory(self.root);plan['directories'].append('data/extraction');plan['plan_id']=m._identity(plan)
        with self.assertRaises(ValueError):m.save_plan(self.root,plan)


if __name__=='__main__':unittest.main()
