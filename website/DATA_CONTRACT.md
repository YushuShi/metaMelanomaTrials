# Current treatment-map contract (November 12, 2026)

The active map reads `dist/data/treatment_map.json`; its comparison records now
have a source-bound `analysis` object from `scripts/treatment_map_evidence.cjs`.
This includes verified independent-study identity, design, clinical/model
compatibility, supported chronology, source completeness, sample-size context
and reported planning assumptions. `analysis.compatibility.eligible` controls
pooling context; `independence_verified` and a nonempty independent identity are
also required. Valid interval precision is required for pooling, but a supported
point estimate can support single-study planning. No global `validated` flag is
inferred from article retention or full-text retrieval.

The local `treatment_map_analysis.js`, `treatment_map_planning.js` and
`treatment_map_charts.js` modules implement the user-authorized comparison
analysis and planning described in [the map documentation](../docs/TREATMENT_MAP.md).
They supersede the old prohibition on browser calculations only for this path.
They do not populate or modify `analysis.json`, observed counts or raw extraction
records. Derived estimates are recomputed for the exact selected pair, endpoint,
clinical group and evidence scope, and stale views clear when selection changes.
All designs is the default scope; randomized-only and all-trials are alternatives.
Independent study selection and clinical compatibility remain mandatory.

One-arm and two-arm plans use source-bound reported rates or explicit user
inputs. Each scenario holds its reference/event assumption constant between
study-effect and pooled-effect columns. These columns are prospective N, not
extracted sample sizes. Missing rates leave N unavailable while supported
survival event requirements remain visible. Original source effects retain
their direction; arrows use tail versus head. Planning defaults to the reported intervention
versus comparator, with an explicit choice of either plotted arm as the planned
treatment; probability and effect roles are reoriented together.

The sections below preserve the historical contracts for older exports and
views; they do not override this active treatment-map contract.

---

# metaMelanomaTrials data contract

`dist/data/analysis.json` is currently `validated: false` with empty result arrays. Citation metadata and R2 decisions cannot populate numerical charts. All future numerical exports require separate authorization, producing-code provenance and scientific validation. That legacy export remains unchanged. The newly authorized treatment-map comparison analysis below is a separate local calculation path.

The top-level object contains `validated`, `analyses`, `matrix` and `sample_size`. Every displayed analysis, study estimate, pooled estimate, sensitivity result and matrix/planning point must explicitly set `validated: true`. Omitted validation is not approval.

An analysis identifies its disease, intervention, comparator, endpoint, population, estimand, effect model (such as Cox or AFT), data cutoff, cohort policy and pooling model. `pooling_model` is `fixed` or `random`; `record_policy` is `latest` (latest poolable result per verified cohort) or `all` (all eligible records, requiring producer handling of dependence). Export separate comparability groups rather than merging AFT and Cox models or different estimands. Preserve earlier reports when producing latest-poolable results.

Ratio estimates use `effect`, `ci_low` and `ci_high` on the original HR/RR/OR scale. Ratios and CI limits must be positive. Funnel `se` values for ratios must be standard errors of **log(effect)**, never standard errors on the original ratio scale. Study/pooled rows and sensitivity rows retain source report/cohort identifiers. A producer must verify numerical values and their compatible units before marking an export validated.

`n_studies` counts independently adjudicated studies/cohorts, with `independence_verified: true`. If `independent_cohort_ids` are supplied, they must be unique and their length must match `n_studies`; unique identifiers alone never prove independence. Matrix and planning dots require at least two verified independent studies. A retained report count is never a study count or participant count.

Matrix and planning points specify `effect_measure`, disease/intervention identifiers and a producer-verified benefit direction (`association` or `benefit_direction`). Significance colors reflect the validated confidence interval and clinical direction. Lower HR/RR/OR is not universally beneficial.

Planning exports additionally provide `endpoint_type` (`binary` or `survival`), the named `method`, a positive integer `required_total`, and numerical `parameters`: `baseline_probability`, `allocation_ratio`, `sidedness`, `power`, `alpha`, plus `followup_months` for survival. Preserve all additional method/accrual/event assumptions in the export. The controls select results whose supplied parameters match; they do not run a formula or substitute general-population incidence for an endpoint-specific baseline. The plotted axes are natural log effect and log10 required total N. Names remain beside their dots in matching Summary colors.


## Legacy exported-analysis controls and shared Settings

Endpoint definitions identify an endpoint's `id`, display `label`, `endpoint_type` (`survival`, `binary`, `continuous`, or `unknown`) and appropriate `effect_measures`. Validated endpoint definitions take precedence over preliminary family labels. Overall and progression-free survival use HR; binary endpoints can use RR, OR or RD; continuous endpoints can use MD or SMD. Ambiguous recurrence/other families require an explicit validated endpoint definition. Sample-size plots currently accept the applicable ratio measures HR/RR/OR only.

The local Settings page controls `pooling_model` and `record_policy` for the main analysis and both summaries, plus allocation, sidedness, power and alpha for sample-size planning. Matrix and planning exports must also identify their pooling model and record policy so the interface can select the matching saved result. Missing model/policy metadata cannot be substituted silently. Defaults remain random effects and the latest poolable result per verified cohort.

The Summary page displays forest plots across interventions, retaining separate disease, endpoint, population, comparator, estimand and model groups. It never computes a combined pooled effect across interventions. Summary across interventions displays the existing evidence matrix without an intervention-name input. Planning displays one plot for the selected endpoint.

The PRISMA page uses actual report-level identification, deduplication and screening counts. Uncertain reports deferred outside the current R2 scope remain explicitly deferred. Full-text assessment and final inclusion remain unknown until those stages have actually occurred; document acquisition is not final full-text screening.


## Available disease–endpoint choices

`summary.disease_catalog` supplies disease labels and `parent_id` relationships. `summary.evidence_availability` supplies the authoritative list of available `{disease_id, endpoint, report_count}` combinations. The completed R2 snapshot uses the 4,048 reports retained by both reviewers, with basis `r2_both_retained_report_tags`. Disease scopes are the intersection of each reviewer's independently expanded catalog ancestry; endpoint families are the intersection of the two R2 endpoint classifications. These screening classifications never validate a clinical effect or establish independent studies. An explicitly empty combination list stays empty. Explicit validated numerical results can add their own supported combinations.

The four analysis/planning/summary views gray out unavailable disease–endpoint combinations. Changing disease preserves that choice and clears an incompatible endpoint, then resets effect-size choices. “All diseases” and endpoint placeholders remain usable.

## R2 article browsing

`dist/data/r2_articles.json` is an index joined by `report_id` to the unchanged R1 citation metadata in `retained.json`. It identifies `selection: "both_models_retain"` and preserves both model classifications and originating call IDs. `disease_scope_ids` contains agreed disease scopes, including catalog ancestors; `shared_disease_ids` contains only exact shared labels. The broad lung category therefore includes agreed lung subtypes. Endpoint and intervention filters use the index's agreed R2 tags, rather than silently substituting R1 classifications. A report without an agreed endpoint remains browsable without an endpoint filter.

The merged Studies tab lists these screened reports independently of numerical extraction. Parent disease selections may retrieve separate saved subtype comparisons, but never combine them into a new pooled estimate.

## Provisional study information

`dist/data/provisional_studies.json` is a separate, fixed v6 snapshot of the canonical full-string Study list: 285 cutaneous-melanoma candidate reports, 163 with provisional information. `website/scripts/export_provisional_studies.py` binds the exact local v6 manifest and canonical JSON hashes and exports only public citation, population, design, reported methods, actual-adjustment-covariate text and source/review status fields. It excludes provider calls, private paths, raw responses, accounting and credentials. It does not update `analysis.json`.

When no validated comparison is selected, the merged Studies panel displays this provisional information and labels R3/clinical verification pending and not for pooling. It displays ten rows per page, preserves source order and resets the page when filters change. Study titles open the complete strings; visual table line clamps do not truncate the data. All 285 rows remain, including 122 without extraction. A candidate is not a confirmed cutaneous population, an independent trial, a completed R3 decision or validated numerical evidence. Source-limited missing covariates do not establish that an analysis was unadjusted.

Candidate disease filtering uses the authorized cutaneous target and its catalog ancestors, retaining R2 disease-label disagreements for review. Endpoint/intervention filters use only the existing agreed R2 screening tags joined by report ID. They do not establish clinical endpoint evidence; missing tags remain browsable with blank filters. Effect-size and pooling controls do not filter study-information fields. Provisional rows never enter the numerical evidence index, forest/bias/sensitivity plots, either summary or sample-size results. If the extra asset is missing or invalid, R2 article browsing and validated-result gates continue to work.

## Provisional reported quantitative values

`dist/data/quantitative_results.json` is a separately allowlisted public catalog, with `record_kind: "provisional_reported_quantitative_results"`, cutaneous-melanoma target scope, flat `results[]` identities and all clinical, final-R3, numerical-validation and pooling flags false. The public exporter owns all source/entity joins. The browser renders reported values and raw units; it does not calculate missing counts, confidence levels, totals or effects.

The quantitative table uses per-result clinical endpoint/measure/contrast metadata. It does not substitute R2 screening tags for a result endpoint or an intervention mapping. Blank filters retain every result. Treatment comparisons precede other ratio estimates, which precede descriptive results. Each model, population, cutoff and contrast remains a distinct row. Pagination displays ten results at a time without truncating stored values. Per-result details expose population, actual-model covariates, strata, cutoff and exact source passages; study titles retain the original article drawer.

Raw analysis, population and arm counts retain their distinct roles. The UI presents one compact source-scoped N using the separately tested display helper, without adding arm totals or exposing competing N-basis labels. An unresolved N is shown as an em dash; the helper can use only explicit source-scoped counts and its reviewed fallback. A report-level safety population is not assigned to a subgroup hazard-ratio model. Reported 95% confidence-level labels are omitted in the compact display. A non-95% level is printed only when reported; confidence limits alone do not imply 95%. Zero remains a number and never replaces a missing value. The catalog is isolated from `analysis.json`, numerical evidence availability and all pooled, bias, sensitivity, summary and planning plots. Missing or invalid optional quantitative data leaves R2 browsing and the qualitative provisional table usable.

The separate `reviewer_quantitative_results.json` catalog uses the same public result contract for actual API reviewer facts. Each reviewer and original source packet remain distinct from Codex-assisted drafts and from other reviewers; sample context joins require the same report, reviewer, source input and packet/draft fingerprint. All sources remain in the merged Studies view; reviewer/source provenance stays expandable, and the main Effect size/Intervention controls filter actual reported rows. Public records retain original derivative kind, source coverage and pending clinical/report review; accepted source fragments do not imply a complete report review. Partial asset failures are shown and do not discard the other usable catalog.

The initial combined view contains 2,627 result records from 129 reports; separate count records extend numeric coverage to 134 reports without creating observations. Additional count-only source versions remain inspectable in their own collapsed section. Role-tagged API numbers remain visible even when no scalar estimate is reported. Canonical `less_or_equal`/`greater_or_equal` qualifiers retain their inequality symbols. Original API qualifiers, effect direction/scale, scope, unresolved links and accepted/expected source coverage remain available in per-result details.

## Merged navigation and display

The canonical analysis tab is `articles`, labelled Studies. Old programmatic `extracted` selections alias it. Its order is quantitative results, additional reported counts, the unchanged 285-candidate characteristics snapshot and the 4,048-member R2 article universe. The old `#tracking` hash redirects to About; old `#usage`, `#sources` and `#reports` links retain their corresponding panels. All progress/cost/method/report content is preserved there.

`associated_intervention_ids` is a browsing association to source-supported drugs in either relevant comparison arm. It does not reassign experimental/comparator roles, invert effects or infer drugs from background text. Matching quantitative report IDs extend article-filter matches only within existing R2 both-retained members. The N helper retains its provenance internally; only its compact text and original source passages are displayed.
