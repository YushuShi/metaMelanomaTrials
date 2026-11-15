"""Reviewed finite PMID31580492 Registry append; dry-run is the default API."""
from contextlib import contextmanager
from copy import deepcopy
import argparse
import json
from pathlib import Path
import sqlite3

from . import regimen_repairs as repair
from .io import atomic_json, canonical, digest, evidence_path, owned, reference
from .pipeline import aggregate_fragments
from .registry import Registry

PRODUCERS = ['src/metamelanoma/'+name+'.py' for name in
             ('regimen_repair_application','registry','pipeline')]


def application_producers(root):
    return [reference(Path(root).resolve(),path) for path in PRODUCERS]


def _database(root):
    path=evidence_path(root,'data/current/articles.sqlite3')
    if not path.is_file():raise ValueError('Existing canonical Registry required')
    for suffix in ('','-wal','-shm','-journal'):
        item=Path(str(path)+suffix)
        if item.is_symlink() or item.exists() and (not item.is_file() or item.stat().st_nlink!=1):
            raise ValueError('Registry and sidecars must be owned regular files')
    return path


def _snapshot(db):
    orders={'articles':'pmid','decisions':'id','fragments':'task_id',
            'fragment_history':'revision_sha256','attempts':'task_id','sources':'id'}
    return {table:[dict(row) for row in db.execute(
        'SELECT * FROM '+table+' WHERE pmid=? ORDER BY '+order,(repair.PMID,))]
        for table,order in orders.items()}


@contextmanager
def _readonly(root):
    path=_database(root)
    sides=[Path(str(path)+s) for s in ('-wal','-shm','-journal')]
    immutable=not any(p.exists() for p in sides)
    stamp=lambda:tuple(getattr(path.stat(),k) for k in ('st_dev','st_ino','st_size','st_mtime_ns','st_ctime_ns'))
    before=stamp()
    db=sqlite3.connect(path.as_uri()+'?mode=ro'+('&immutable=1' if immutable else ''),uri=True)
    db.row_factory=sqlite3.Row
    try:
        db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
        yield db
    finally:
        db.close()
        if immutable and (stamp()!=before or any(p.exists() for p in sides)):
            raise ValueError('Checkpointed Registry changed during immutable read')


def registry_revision(root):
    """Digest all Registry rows for this one article, not a financial revision."""
    with _readonly(Path(root).resolve()) as db:
        return digest(canonical(_snapshot(db)))


def _ref(root, value):
    return reference(root,value) if isinstance(value,(str,Path)) else value


def _material(root,proposal_ref,review_ref,expected_revision):
    if not isinstance(expected_revision,str) or len(expected_revision)!=64:
        raise ValueError('Explicit expected finite-article Registry revision required')
    proposal=repair._load(root,proposal_ref)
    qualified=repair.verify(root,proposal)
    review=repair._load(root,review_ref)
    facts=review.get('approved_fact_ids',[])
    if (review.get('record_kind')!='independent_finite_regimen_link_repair_review'
            or review.get('status')!='PASS' or review.get('pmid')!=repair.PMID
            or review.get('proposal_ref')!=proposal_ref
            or len(facts)!=len(set(facts)) or set(facts)!=set(repair.RECIPES)
            or review.get('producer_files')!=proposal['producer_files']
            or review.get('application_producer_files')!=application_producers(root)):
        raise ValueError('Independent PASS must bind this exact proposal, eight facts and all producers')
    task_ref=reference(root,'data/current/tasks/'+repair.TASK+'/task.json')
    task=repair._load(root,task_ref)
    if (task['task_id']!=repair.TASK or task['stage']!='R3' or str(task['metadata']['pmid'])!=repair.PMID
            or task['metadata']['source_ref']!=proposal['lineage']['original_source_ref']
            or task['metadata'].get('article_task_ids')!=[repair.TASK]):
        raise ValueError('Exact original single-fragment article plan required')
    view=proposal['validation']
    qualified.update(reviewer_model='local_source_review',original_reviewer_model='gpt-6-luna',
        local_review={'record_kind':'offline_primary_source_link_review','proposal_ref':proposal_ref,
                      'independent_review_ref':review_ref,'is_native_response':False},
        source_checked_counts={**view['counts'],
            'numeric_facts_submitted':sum(bool(f['numbers']) for f in proposal['candidate_payload']['facts']),
            'numeric_facts_accepted':sum(bool(f['numbers']) for f in view['validated_facts'])},
        validation_issues={'fact_results':deepcopy(view['fact_results']),
                           'model_results':deepcopy(view['model_results']),
                           'coverage':deepcopy(view['field_coverage_errors'])})
    record={'record_kind':'reviewed_source_arm_link_repair','pmid':repair.PMID,'task_id':repair.TASK,
        'is_native_response':False,'source':proposal['source'],'validation':view,
        'qualified_payload':qualified,'original_native_view_ref':repair.NATIVE,
        'proposal_ref':proposal_ref,'independent_review_ref':review_ref,'original_task_ref':task_ref,
        'expected_registry_revision':expected_revision,'application_producers':application_producers(root),
        'new_model_requests':0,'native_history_preserved':True}
    content=(json.dumps(record,ensure_ascii=False,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
    path=owned(root,'data/reviews/source_qualified_R3/'+repair.PMID+'/regimen_links/'+digest(canonical(record))+'.json')
    artifact={'path':str(path.relative_to(root)),'sha256':digest(content),'bytes':len(content)}
    return proposal,task,record,path,content,artifact


def _current(snapshot):
    rows=[r for r in snapshot['fragments'] if r['task_id']==repair.TASK]
    if len(rows)!=1:raise ValueError('Exact current original R3 fragment required')
    return rows[0]


def _check_original(snapshot,proposal):
    articles=snapshot['articles']
    if len(articles)!=1 or articles[0]['report_id']!=repair.REPORT or articles[0]['publication_hold']:
        raise ValueError('Unheld exact canonical article required')
    r2=[r for r in snapshot['decisions'] if r['stage']=='R2']
    if not r2 or r2[-1]['status'] not in {'retain','unclear'}:
        raise ValueError('A current retained or unclear R2 decision is required')
    row=_current(snapshot);payload=json.loads(row['payload_json'])
    if row['status']!='retain' or json.loads(row['source_ref_json'])!=repair.NATIVE:
        raise ValueError('Current R3 fragment differs from the original reviewed native view')
    for key in ('facts','models','entities'):
        if payload[key]!=proposal['original_native_validation']['validated_'+key]:
            raise ValueError('Original accepted Registry graph changed')


class _TransactionConnection:
    """Let official Registry methods share one outer transaction, without commits."""
    def __init__(self,db):self.db=db
    def __getattr__(self,key):return getattr(self.db,key)
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def commit(self):return None


def apply(root,proposal_ref,review_ref,expected_registry_revision,*,dry_run=True):
    root=Path(root).resolve();proposal_ref=_ref(root,proposal_ref);review_ref=_ref(root,review_ref)
    proposal,task,record,path,content,artifact=_material(root,proposal_ref,review_ref,expected_registry_revision)
    with _readonly(root) as db:snapshot=_snapshot(db)
    current=_current(snapshot)
    if json.loads(current['source_ref_json'])==artifact:
        latest=[r for r in snapshot['decisions'] if r['stage']=='R3'][-1]
        if (json.loads(current['payload_json'])!=record['qualified_payload']
                or json.loads(latest['source_ref_json'])!={'fragments':[artifact]}):
            raise ValueError('A partial or conflicting prior application needs review')
        return {'status':'already_applied','artifact':artifact,'new_model_requests':0}
    if digest(canonical(snapshot))!=expected_registry_revision:
        raise ValueError('Stale finite-article Registry revision')
    _check_original(snapshot,proposal)
    summary={'status':'dry_run' if dry_run else 'applied','pmid':repair.PMID,'artifact':artifact,
        'registry_revision_before':expected_registry_revision,'accepted_facts':19,'held_facts':5,
        'repaired_fact_ids':list(repair.RECIPES),'new_model_requests':0,'is_native_response':False}
    if dry_run:return summary
    db=sqlite3.connect(_database(root).as_uri()+'?mode=rw',uri=True,isolation_level=None)
    db.row_factory=sqlite3.Row
    try:
        db.execute('PRAGMA foreign_keys=ON');db.execute('BEGIN IMMEDIATE')
        before=_snapshot(db)
        if before!=snapshot:raise ValueError('Registry changed before the append transaction')
        if path.exists():
            if path.is_symlink() or path.stat().st_nlink!=1 or path.read_bytes()!=content:
                raise ValueError('Immutable local review artifact differs')
        else:atomic_json(path,record)
        registry=object.__new__(Registry);registry.root=root;registry.path=_database(root)
        registry.db=_TransactionConnection(db)
        q=record['qualified_payload']
        registry.save_fragment(repair.TASK,repair.PMID,'R3','retain',q['decision']['reason'],q,artifact,
            revision_reason='Independently reviewed offline eight-field arm-link repair; paid native preserved')
        if not aggregate_fragments(registry,task):raise ValueError('The finite repaired article did not aggregate')
        after=_snapshot(db)
        for key in ('articles','attempts','sources'):
            if before[key]!=after[key]:raise ValueError('Unrelated Registry state changed')
        if after['decisions'][:-1]!=before['decisions'] or len(after['decisions'])!=len(before['decisions'])+1:
            raise ValueError('Historical decisions changed instead of one append')
        history={r['revision_sha256']:r for r in after['fragment_history']}
        if any(history.get(r['revision_sha256'])!=r for r in before['fragment_history']):
            raise ValueError('Historical fragment rows changed')
        for row in before['fragments']:
            if row['task_id']!=repair.TASK and row not in after['fragments']:
                raise ValueError('An unrelated source fragment changed')
        db.commit();summary['registry_revision_after']=digest(canonical(after))
        return summary
    except BaseException:
        db.rollback();raise
    finally:db.close()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=['registry-revision','dry-run','apply'])
    p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--proposal');p.add_argument('--review')
    p.add_argument('--registry-revision',dest='revision');args=p.parse_args()
    if args.action=='registry-revision':result={'pmid':repair.PMID,'registry_revision':registry_revision(args.root)}
    else:
        if not all((args.proposal,args.review,args.revision)):p.error('Explicit proposal, review and expected Registry revision required')
        result=apply(args.root,args.proposal,args.review,args.revision,dry_run=args.action!='apply')
    print(json.dumps(result,sort_keys=True))


if __name__=='__main__':main()
