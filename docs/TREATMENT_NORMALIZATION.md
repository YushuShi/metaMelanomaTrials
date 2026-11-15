# Treatment normalization and updates

`config/treatment_registry.json` is the authoritative curated vocabulary.
`website/dist/treatment_resolver.js` resolves complete names and aliases for both
Node publication and browser consumers. There is no separate Python alias
catalog. `treatment_groups.js` preserves AND, OR and sequential composition,
source-bound roles, dose, route and schedule. `regimen_definitions.js` validates
prepared definitions before consumers use them.

The older `config/drug_catalog.json` remains historical discovery material; do
not add new display normalization there. Generic classes do not establish a
named product. Keep developmental-code digits, formulation variants and
modified products distinct. A source-dependent role can remain under review
even when the product identity is known. Named-component searches include
administered components; `principal_class_ids` separately describes principal
treatment classes, so conditioning does not relabel a cellular therapy as
chemotherapy alone.

Table badges, treatment menus and map markers share the CSS palette in
`website/dist/styles.css`, keyed by the registry's treatment class IDs and broad
category aliases. Checkpoint inhibitors use `ici`/`immune` or their specific
checkpoint class; `immunotherapy` means other/unspecified immunotherapy and has
a separate color. Cytokines, cell therapies, therapeutic vaccines, oncolytic
viruses and surgery each have distinct colors. Styling changes should not
rewrite registry identities or rebuild scientific extraction records.

## Curate and reconcile

1. Inspect `website/dist/data/treatment_review_queue.json` or `.csv`. Each entry
   retains reasons, raw spellings, PMIDs, exact extraction-context arm/node
   references, candidates and saved source references. These overlapping counts
   are not independent trial counts.
2. Check a primary source or the saved article evidence. Add a verified complete
   alias/product or generic class to the registry with its source IDs. Do not
   guess an agent from a substring or a near-matching code. Record unsupported
   combinations, new agents, ambiguous labels, extraction errors, non-drug
   entities and source-dependent roles for review. Bump the registry version for
   a subsequent curated release.
3. Audit the candidate locally, then apply it:

```sh
python pipeline.py treatment-reconcile --dry-run --audit-dir data/audits/treatment_candidate
python pipeline.py treatment-reconcile --audit-dir data/audits/treatment_applied
python pipeline.py treatment-reconcile --audit-dir data/audits/treatment_repeat
```

The final repeated run must report `normalization_changed: false` and
`changed_occurrences: 0`. A candidate dictionary can be checked with
`--registry-path path/to/candidate.json`; do not apply an experimental candidate
as the authoritative release without curating its source references. Alias
collisions and invalid classifications stop publication rather than choosing an
arbitrary winner.

This command uses retained extraction records. It never retrieves articles,
resends model requests, changes eligibility, recomputes numerical results or
performs pooling. A manual historical backfill leaves
`quantitative_extraction.json` byte-identical. The first migration's optional
`--baseline-labels` compares exact observed spellings to a frozen older review;
later updates compare source-bound node occurrences to the previous full audit.

## Publication and consumers

The normal R2 quantitative publisher, R3 full-text publisher and legacy clinical
publisher all call the same normalization stage before switching their source
publication. Their common regimen projection uses the current authoritative
registry. Manual and scheduled updates must use these publishers or invoke
`treatment-reconcile` after an externally validated source update. No browser
visit or model extraction is needed to refresh historical classifications.

The active outputs are:

- `website/dist/treatment_registry.js`: generated browser copy of the registry.
- `website/dist/data/treatment_normalizations.json`: prepared, source-bound
  comparison definitions. Each role has `definition_ref`, `source_binding` and a
  compact description; `definition_profiles` holds shared definition bodies.
- `website/dist/data/treatment_normalization_audit.json`: complete occurrence
  and extraction-context arm audit, including exact raw metadata and evidence.
- `website/dist/data/treatment_review_queue.json` and `.csv`: persistent review
  queue, rebuilt from the current retained source set.
- `website/dist/drug_type_review.json`, `.txt`, `.html`: review views generated
  from this registry and audit, without another interpretation dictionary.
- `website/dist/data/treatment_map.json`: the [Treatment map](TREATMENT_MAP.md),
  built from the same candidate normalization release and raw arm evidence.

The browser, static JSON/API, table/CSV, filters and future analysis producers
consume the same prepared definitions. Raw model-proposed classes do not take
precedence over a current verified registry projection. A prepared role is
accepted only when its comparison/source/review/population binding matches;
missing or stale prepared data must not silently pass as the current release.
Legacy `clinical_evidence.json` receives distinct `clinical_treatment_*`
sidecars so its refresh cannot overwrite the active compact publication.

## Versioning, cache invalidation and conservation

Each sidecar binds the exact source-file SHA, clinical content hash, registry
version/canonical SHA, resolver SHA, treatment-groups SHA and regimen-definition
SHA. Source, registry and implementation changes require a fresh sidecar.
Cached analyses also need `treatment_registry_version`,
`treatment_registry_sha256`, `treatment_resolver_sha256`,
`treatment_groups_sha256` and `regimen_definitions_sha256`; old membership
results remain unavailable until their producer deliberately rebuilds them.
This is cache invalidation, not authorization to perform clinical pooling.

Every applied version and previous served projection is preserved under
`data/current/treatment_normalization/`. Audit files are content-addressed;
source labels, formulation/dose data, arm direction, numerical values,
eligibility and provenance remain auditable. Roll back by restoring a reviewed
registry revision and reconciling it against the current source, rather than
copying a stale sidecar over a changed source. Keep code, registry, sidecars,
review documents and producing audit together in any future release.

## Release checks

Run the consequential integration and publisher checks after changing the
registry or the normalization stage:

```sh
PYTHONPATH=src python -m unittest discover -s tests/current -p 'test_treatment_normalization.py' -v
PYTHONPATH=src python -m unittest discover -s tests/current -p 'test_fulltext_export.py' -v
PYTHONPATH=src python -m unittest discover -s tests/current -p 'test_user_dispositions.py' -v
PYTHONPATH=src python -m unittest discover -s website/tests -p 'test_clinical_evidence.py' -v
node --test website/tests/test_treatment_groups.cjs website/tests/test_regimen_definitions.cjs
```

Before a release, inspect the exact old/new node audit and any known-to-unknown
regressions; verify the raw source hash and numerical result hashes; apply the
backfill; repeat it to establish byte-identical output; test the served browser
filters, table and CSV against the published prepared definitions. Keep all
changed generated artifacts with their producing code and registry. No automatic
clinical pooling or extra extraction is part of this checklist.
