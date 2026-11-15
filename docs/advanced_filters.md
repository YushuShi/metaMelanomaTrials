# Advanced subgroup filters

Open **Advanced filter** below Comparator to browse the current study table by
clinical subgroup. **Endpoint is optional.** With All endpoints selected, users
can choose, for example, Stage III and see its report count and matching studies.

The controls are treatment setting, disease stage, melanoma type, BRAF mutation
status, advanced-disease treatment line and baseline LDH. Stage I–IV includes
substages. Unknown and inseparable mixed stages are not assigned to a pure-stage
category; staging wording and supporting source passages remain in the sidecar.

There is **no minimum-study threshold for filtering**. Each supported choice
with at least one visible report is offered. Active choices remain visible and
clearable even if other selections reduce their count to zero. Counts apply all
other selections but exclude the facet's own current restriction. Each PMID
counts once regardless of its number of groups, results or extraction stages.
These are report counts, not estimates of independent or poolable evidence.

## One browsing projection

`AdvancedFilters.filterBrowseMatches` selects source-bound numerical results and
sample/population records. Sample-only reports are included without manufacturing
clinical outcomes. `charts.advancedBrowseOptions` applies existing melanoma and
treatment/comparator scope, then uses `advancedPopulationMatch` and
`visibleStudyMatches` to apply the same sample-size/display rules as the table.
`browseSummary` and `browseFacets` count that visible projection. The current
report count, table and CSV therefore describe the same selected evidence.

AND conditions must hold for the same source population, not separate marginal
subgroups. Inheritance requires a proven whole-parent characteristic. Selected
samples retain exact source/review/population/arm identity. If an endpoint is
selected, a sample in one population cannot qualify a result from another.
Cross-setting comparisons keep both complete treatment arms and their labels.

All advanced values set to All preserve the original evidence projection.
The panel starts collapsed. Opening it shows available choices without requiring
an endpoint. Collapse retains conditions; a badge shows the number of active
filters. Restored conditions expand visibly. Reset affects only advanced fields.
Top-right navigation contains Settings and About only.

## Stored classification and updates

`src/metamelanoma/clinical_classification.py` builds the versioned, source-bound
`website/dist/data/clinical_classifications.json` from the published quantitative
snapshot. Entries under `results` and `samples` bind PMID, source hash, review
hash, population and arm identifiers. Shared profiles retain supported, Mixed
and NA states, short source wording, evidence references, inherited facts, arm
settings and source-supported trial linkage. Raw extractions remain unchanged.

Rebuild with:

```sh
PYTHONPATH=src python -m metamelanoma.clinical_classification --root .
```

R2 and R3 publication use this same writer. Increment `CLASSIFICATION_VERSION`
when normalization rules change. Identical input and rules produce byte-identical
classifications; historical artifacts are content-addressed. Data refresh
invalidates availability when source or classification content changes.
Panel interactions never retrieve articles or call a language model.

## Analysis eligibility remains separate

`evidenceSummary`, `countEligible` and saved-analysis guards still enforce
numerical scope, compatible effects/models/populations, independent cohort
linkage and the existing statistical approval requirements. Browsing does not
relax these checks or make a report poolable. Repeated follow-up reports, arms,
overlapping subgroups and pooled/component reports cannot inflate independent
analysis counts. Participant totals require verified nonoverlapping denominators.

An active selection clears any unbound or stale pooled/bias/planning display.
A future approved analysis producer must record the exact independently selected
analysis inputs and current signature:

```js
analysis.advanced_filter_scope = {
  selections: AdvancedFilters.normalizeSelections(selections),
  result_ids: selectedMatches.flatMap(match => match.results.map(r => r.result_id)),
  result_signature: AdvancedFilters.resultSignature(selectedMatches, options)
};
```

A browsing report count is not an analysis manifest. Existing numerical values,
manual corrections and source histories must be preserved.

## Implementation and verification

- `website/dist/advanced_filters.js`: shared matching, browsing facets/counts,
  independent analysis counts and cache signatures.
- `website/dist/advanced_filter_panel.js`, `advanced_filters.css`, `index.html`:
  accessible panel, labels, counts, reset and responsive layout.
- `website/dist/app.js`: existing eligibility, source-scoped samples, shared
  table/CSV projection and separate statistical guards.
- `src/metamelanoma/clinical_classification.py`: normalization, provenance,
  versioned backfill and artifact writer; R2/R3 exports call the same writer.
- `website/dist/data/clinical_classifications.json`: generated classifications.

Current browsing acceptance fixtures and receipts are under
`data/audits/subgroup_browsing_20261109/`. Earlier analysis/filter and navigation
checks remain preserved under their original audit folders.
