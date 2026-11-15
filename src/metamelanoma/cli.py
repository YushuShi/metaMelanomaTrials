"""Local commands for one canonical evidence pipeline."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .io import atomic_bytes, atomic_json, now, owned, read_json


def _complementary_progress(root, snapshot):
    value = {key: item for key, item in snapshot.items() if key not in ('articles', 'policy')}
    value['as_of'] = now()
    atomic_json(owned(root, 'data/current/complementary/' + snapshot['run_id'] + '/progress.json'), value)
    print(json.dumps(value, separators=(',', ':')), flush=True)


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command",choices=["prepare","pilot","run","status","stop","revalidate","prefetch","recover-r3","recover-r3-pilot",
        "reextract-prepare", "reextract-run", "reextract-status", "reextract-publish",
        "fulltext-prepare", "fulltext-run", "fulltext-status", "fulltext-publish", "treatment-reconcile", "treatment-map",
        "complementary-prepare", "complementary-run", "complementary-status", "complementary-export"])
    parser.add_argument('--plan-ref', default='data/pilots/r2_quantitative_20261107/plan_ref.json')
    parser.add_argument('--workers', type=int, default=16)
    parser.add_argument('--limit', type=int)
    parser.add_argument('--pmid', action='append')
    parser.add_argument('--allow-pending', action='store_true', help='Publish completed continuation records while preserving pending R2 states separately')
    parser.add_argument('--dry-run', action='store_true', help='Audit treatment normalization without changing served projections')
    parser.add_argument('--audit-dir', help='Owned relative directory for content-addressed treatment reconciliation audits')
    parser.add_argument('--registry-path', default='config/treatment_registry.json')
    parser.add_argument('--source-path', default='website/dist/data/quantitative_extraction.json')
    parser.add_argument('--run-id', default='melanoma-opus-complementary-20261114')
    parser.add_argument('--request-timeout-seconds', type=int, default=1200,
                        help='Cornell complementary-review HTTP timeout; does not change model output allowance')
    parser.add_argument('--baseline-labels', help='Optional saved old-label classifications for an initial before/after audit')
    args=parser.parse_args(argv)
    if args.request_timeout_seconds < 1:
        parser.error('--request-timeout-seconds must be positive')
    if args.allow_pending and args.command != 'reextract-publish':
        parser.error('--allow-pending is only valid with reextract-publish')
    root=Path(__file__).resolve().parents[2]
    if args.command.startswith('complementary-'):
        from . import complementary_runtime
        if args.command == 'complementary-prepare':
            from .complementary_sources import prepare_inventory
            from .gateway import verify_catalog
            inventory = prepare_inventory(root, output_dir='data/current/complementary/' + args.run_id)
            catalogue = verify_catalog(root, ['claude-opus-5-5'])
            value = complementary_runtime.prepare(root, inventory['inventory_ref'], run_id=args.run_id,
                catalog_ref=catalogue)
        elif args.command == 'complementary-run':
            value = complementary_runtime.run(root, args.run_id, workers=args.workers,
                limit=args.limit, pmids=args.pmid, timeout_seconds=args.request_timeout_seconds,
                progress=lambda snapshot: _complementary_progress(root, snapshot))
            _complementary_progress(root, value)
        elif args.command == 'complementary-export':
            from .complementary_reporting import export_review
            value = export_review(root, args.run_id)
        else:
            value = complementary_runtime.status(root, args.run_id)
        if 'article_counts' in value:
            value = {key: item for key, item in value.items() if key not in ('articles', 'policy')}
        print(json.dumps(value, indent=2))
        return
    if args.command == 'treatment-map':
        from .treatment_map import reconcile
        print(json.dumps(reconcile(root, dry_run=args.dry_run, audit_dir=args.audit_dir), indent=2))
        return
    if args.command == 'treatment-reconcile':
        from .treatment_normalization import reconcile
        print(json.dumps(reconcile(root, dry_run=args.dry_run, source_path=args.source_path,
            registry_path=args.registry_path, audit_dir=args.audit_dir,
            baseline_labels_path=args.baseline_labels), indent=2))
        return
    if args.dry_run or args.audit_dir or args.baseline_labels:
        parser.error('Treatment audit arguments are only valid with treatment-reconcile')
    if args.command.startswith('fulltext-'):
        if args.plan_ref == 'data/pilots/r2_quantitative_20261107/plan_ref.json':
            parser.error('An explicit --plan-ref is required for current R3 full-text work')
        from . import fulltext_reextraction
        plan_ref = read_json(owned(root, args.plan_ref))
        if args.command == 'fulltext-prepare':
            value = fulltext_reextraction.prepare(root, plan_ref)
        elif args.command == 'fulltext-status':
            value = fulltext_reextraction.status(root, plan_ref)
        elif args.command == 'fulltext-run':
            value = fulltext_reextraction.run(root, plan_ref, workers=args.workers,
                limit=args.limit, pmids=args.pmid)
        else:
            from .fulltext_export import publish_plan
            value = publish_plan(root, plan_ref)
        print(json.dumps(value, indent=2))
        return
    if args.command.startswith('reextract-'):
        from . import reextraction
        plan_ref = read_json(owned(root, args.plan_ref))
        if args.command == 'reextract-prepare':
            value = reextraction.prepare(root, plan_ref)
        elif args.command == 'reextract-status':
            value = reextraction.status(root, plan_ref)
        elif args.command == 'reextract-run':
            value = reextraction.run(root, plan_ref, workers=args.workers, limit=args.limit, pmids=args.pmid)
        else:
            from .quantitative_export import publish_plan
            value = publish_plan(root, plan_ref, allow_pending=args.allow_pending)
        print(json.dumps(value, indent=2))
        return
    if args.command=="status":
        file=owned(root,"data/current/pipeline_status.json")
        print(json.dumps(read_json(file)if file.exists()else{"phase":"not_started"},indent=2));return
    if args.command=="stop":
        atomic_bytes(owned(root,"data/current/HOLD"),("User requested no further dispatch at "+now()+"\n").encode())
        print("Further dispatch held. Already-sent requests will be preserved.");return
    if args.command=="prefetch":
        from .prefetch import run
        print(json.dumps(run(root),sort_keys=True));return
    from .pipeline import Pipeline,PipelineHeld,prepare
    if args.command=="prepare":
        config=prepare(root)
        print(json.dumps({"phase_id":config["phase_id"],"provider":config.get("provider","openai"),"direct_OpenAI_additional_cap_usd":config["additional_budget_usd"],
                          "planned_additional_articles":config["article_count"],"API_requests":0},indent=2));return
    pipeline=Pipeline(root)
    try:
        if args.command=="revalidate":
            receipt=pipeline.revalidate()
            print(json.dumps({"reviewed_responses":len(receipt["outcomes"]),"new_API_requests":0,"accounting_unchanged":True}))
        elif args.command in {'recover-r3','recover-r3-pilot'}:
            print(json.dumps(pipeline.recover_r3(pilot_only=args.command=='recover-r3-pilot')))
        else:pipeline.run(pilot_only=args.command=="pilot")
    except Exception as exc:
        path=owned(root,"data/current/pipeline_status.json")
        status=read_json(path)if path.exists()else{}
        status.update(phase="held"if isinstance(exc,PipelineHeld)else"problem_requires_attention",as_of=now(),problem=type(exc).__name__+": "+str(exc),saved_work_preserved=True)
        atomic_json(path,status)
        raise
    finally:
        if pipeline.journal is not None:
            pipeline.journal.close()
        pipeline.registry.close()


if __name__=="__main__":main()
