# Treatment map

Open `http://127.0.0.1:5021/` to see **Treatment map** by default, immediately beside
Studies. The map uses currently retained evidence. The Studies advanced clinical
filters also select the populations used in map comparisons, pooling and planning.
These selections do not recalculate the catalogue's observed participant totals;
those totals describe the retained evidence and remain separate from analysis N.

Studies and the map use the available desktop width. The radial overview shows
colored sectors, agent labels, add-on comparison arrows and a concise
selected-treatment count summary. Its Endpoint selector sits directly below
Open this branch. The branch sidebar contains the treatment summary, Endpoint,
Evidence to include and sample-size controls. Selecting an arrow opens the
comparison analysis below the plot. Studies and cohorts supplies the source,
population and study-result information. The estimate is followed by that table
without a duplicate source-provenance block, source report selector or Pooling
selection details. Forest plot, Publication bias and Sensitivity analysis omit
Study sources and the map-reading guide; the guide remains available in map
browsing and Direct arm comparison. Both individual
agents and combination nodes can open a branch. The map header uses a compact
agent/combination count; centre text, annular class text, “The complete catalogue”
and explanatory intro sentences are omitted.

The map reads `website/dist/data/treatment_map.json`. Its named-agent catalogue,
aliases and treatment classes come from the same curated registry and resolver
as the study table. Combination colors come from their constituent agents.
The graph model is `website/scripts/treatment_map_model.cjs`; the browser viewer
is `website/dist/treatment_map.js`. Neither makes model requests. Comparison-level
statistics and planning run locally using the separately tested modules below.

## Meaning of the graph

A named-agent node represents a named product or supported treatment modality,
including radiosurgery in the radiotherapy category. A combination node represents an
explicitly supported complete concurrent regimen, with order-independent IDs.
Visible combination nodes require a complete-regimen study membership or a
source comparison endpoint. Agent roots require exact treatment evidence or a
supported complete combination containing that agent. Roots with combination
evidence but no monotherapy are labelled “No monotherapy studies.” Empty
catalogue roots and unresolved broader-regimen roots are hidden from the active
map and branch selector. Historical component coverage alone does not show
a treatment phase as a complete regimen. This applies to both map views.
Branch comparison-arrow tooltips show only the current effect measure and
three-decimal estimate. Full comparison context remains available on selection.

Alternatives and sequential phases are kept distinct; unspecified components
are not discarded to manufacture complete combinations. Unresolved source
expressions remain available for review.

The underlying graph retains multiple proper-subset parents. The radial
overview uses a deterministic nearest proper-subset parent; each constituent
drug can also expose the relevant combinations in its selected branch.
In the radial overview, named agents of the same broad registry category occupy
contiguous sectors. Within a sector, a gap separates each treatment subgroup.
Each agent appears once in its primary subgroup, including agents with multiple
targets. Hovering over a band identifies its subgroup. Light annular bands and a class legend use the same shared
treatment palette as table badges and map markers. A combination follows its
displayed parent sector; its component markers retain each agent's own class
color. Each category dot sits immediately beside its drug name. Sector placement
does not assign every component to the parent's class.
Plain gray inclusion lines mean set containment and have no arrowheads, in both
radial and branch views. Comparison arrows connect complete arms and retain the
reported outcome, estimate, confidence interval, population and source. In opened
branches, parallel and add-on comparisons use curves, distinguished by color.
Comparison lines are dashed when the displayed confidence interval includes
zero on the log scale (one on the ratio scale), and solid when it excludes zero
or is unavailable. The CI
comes from the selected study or the automatically selected pooled model when available. All radial parent–child connections are straight. Neither
implies historical ancestry, treatment escalation or an indirect estimate.
Comparison analysis includes all eligible designs by default. Within an
overlapping cohort, it prefers the relevant overall population and largest
cohort, then the latest poolable, fullest supported result. Display-source
ranking and source reconciliation remain separate from design inclusion.
Effect magnitude does not influence selection.

In an opened branch, comparison links connect exact complete regimens
anywhere in that branch, including its combination descendants. Short card
labels show the components added to their displayed parent. In an A-centered
branch, the card labelled +B represents A+B; the +D card beneath it represents
A+B+D. Changing the centre to B makes the A+B card read +A. Hover text, evidence
details, counts and comparison endpoints retain the full regimen identity.

For A+B versus C+D, place the full C+D arm to the left of the +B card and connect
them with a comparison curve. For A+B versus A+C, link the existing +B and +C cards.
For A+B+D versus A+C, link +D and +C. Those short labels never imply B versus C
or D versus C alone. Nested A+B versus A comparisons retain their existing
component/add-on representation. Branch paths describe composition, not
administration sequence. No synthetic intermediate regimen is manufactured.

External opposing arms are deduplicated across publications, outcomes and
incident branch regimens. A shared opponent appears once, to the left of its
leftmost compared branch node, with separate links for each exact regimen pair.
Opponent-only comparisons do not recursively expand the branch. Internal pairs
reuse their existing branch cards. Comparison routes avoid treatment cards;
extra space is reserved for external arms beside combination descendants.
Comparison links use smooth Bezier curves, including gentle arcs for aligned nodes.
Where a direct curve would cross a card, the route follows rounded bends around
the intervening cards. Click targets follow the same curve and the selected
estimate sits along that curve. Comparison ports stay separate from plain inclusion
lines; scientific endpoints and source direction do not depend on the shape.
Neutral controls have no fabricated participant or study totals. Parallel-arm
cards and links stay out of the radial overview.

Repeated placebo-only components, such as placebo + placebo, share one Placebo
display node and comparison link. All supporting source estimates remain
selectable, and their original arm labels remain in Estimate context. Active
drug labels, alternative arms and sequential regimens are not collapsed by
this control-display rule.

Radial nodes with direct parallel-arm evidence have larger glyphs. Eligibility
uses the same exact complete-endpoint and non-nested rule as parallel-arm branch links;
neutral control comparisons also qualify the named treatment node. Add-on-only
relationships do not trigger enlargement. Combination glyphs retain their
constituent colors, and enlargement does not encode participant or study count.

Select a comparison link to scope the study/outcome choices to that exact pair. A
single-pair opposing card selects that pair; a shared opposing card offers all
its incident branch pairs, without unrelated opponent-only comparisons.
The active source estimate appears in the detailed comparison band. Defaults
prefer a ranked parallel comparison when available; each link uses the existing
source ranking within the selected endpoint, without selecting for favorability.
Source selections remain bound to their exact pair and endpoint and expose the
original result for inspection. The displayed arrow uses the selected compatible
cohort pool when available, or its eligible single-source result. The inclusion
table and advanced filters control that calculation. Every checked eligible row
contributes to that one displayed analysis. Selecting an alternative report of
the same cohort replaces its previous representative.

## Endpoint and comparison direction

The right sidebar has an Endpoint selector. Default
to Overall survival (OS), preserve the selected endpoint across branches, and
show it at the plot's upper-right. Filter study/outcome choices by the exact
endpoint and measure. If unavailable, show no matching result and leave links
gray without an arrow; never silently substitute PFS for OS or OR for RR.
Endpoint availability comes from the current prepared evidence. Keep ORR · RR
and ORR · OR separate, and mark an unsupported measure unavailable. ORR
percentages alone cannot establish a comparative direction.

An arrow X → Y displays the effect for Y (arrowhead intervention) versus X
(arrow-tail comparator). External parallel comparisons point from the branch
regimen to its opponent. Internal parallel comparisons follow the selected
source’s comparator → intervention. Add-on arrows run from the original regimen
to the expanded regimen. For example, HR(A+B versus A)=0.70 for overall survival
produces a red A → A+B arrow labelled HR 0.700 because A alone fares worse.

When the displayed comparison reverses the reported arms, invert the estimate
and both confidence bounds together. The source tuple retains its reported
orientation. Only valid positive ratio estimates support a comparison arrow.

Every comparison uses blue (#2563eb) when the tail fares better and red
(#dc2626) when the tail fares worse for the selected endpoint. Gray indicates
missing directional evidence or a neutral estimate. The confidence interval
determines the dash style. Both radial and branch views show a separate treatment-class color
legend above the arrow keys. The radial legend counts named agents in the
catalogue. A branch legend includes only categories represented by its displayed
node cards, including opposing arms, and counts cards carrying each visible
category color. Add-on cards use the displayed added components; a complete
opposing combination can count once in each of its distinct component categories.
Re-rooting recalculates the legend. Off-branch catalogue agents are not counted.

The public Reading the map guidance is deliberately concise: straight radial
connections between an agent/regimen and displayed combinations based on it;
original-to-expanded regimen arrows; exact-treatment node counts;
overall/subgroup deduplication; the four N statuses; and automatic model
selection. Source-review totals and the longer technical explanations remain
in saved evidence/documentation rather than this public guidance.

The radial overview displays comparisons only along its existing immediate
parent–child connections, such as A → A+B when A is the displayed parent of A+B.
Omit comparisons to other parents or ancestors, even when one regimen contains
the other; the underlying evidence remains available in opened branches. Never
transfer a comparison to the chosen parent or infer a constituent-only effect.
Do not display parallel-arm
comparisons or neutral-control opponent nodes in the overview. Existing node
positions, parent assignments, category colors, counts and enlarged glyphs stay
unchanged.

Use the same endpoint and direction calculation as the branch plot. Default
to OS on initial load and preserve an explicit endpoint selection across views.
The overview's endpoint options come from its displayed parent–child comparison
evidence only. A matching estimate produces a straight original-to-expanded
arrow. The radial and branch views use the same two direction colors and legend.
Unsupported endpoints stay gray without arrows.

Radial connector ports use glyph centres and radii, not branch-card geometry.
Keep arrow tips outside the dots through zoom changes. Do not duplicate a gray
parent/child inclusion line when the same pair has a comparison line. All radial
connections are straight, including gray lines with no matching endpoint. Clicking
an arrow selects its exact pair without opening detailed panels; Open this
branch carries that pair and endpoint into the branch for full source review.

Branch comparison discovery includes every exact source pair with at least one
endpoint in the centered regimen or its combinations. An external baseline that
is a component subset of a compared combination appears left of the centered
regimen, including when that combination is several levels deeper. Its curved
add-on arrow connects the baseline to the complete expanded regimen. Shared
external baselines use one card. Comparisons between external opponents do not
recursively expand a branch. Pure inclusion lines remain arrow-free;
where a displayed parent/child has an actual comparison, its comparison link
carries the connection without a duplicate inclusion line. The branch version
is curved; the radial version is straight.

The prepared comparison layer withholds indirect treatment comparisons,
hybrid pooled trial/external-cohort comparisons and coefficients whose reported
conditioning cannot be represented as a supported direct arm contrast. These
remain in the source/review history. A direct treatment contrast in a supported
subgroup remains labelled with that subgroup; it is never promoted to an overall
effect. Original separately recruited cohorts within one trial can retain their
distinct cohort identities. An aggregate and the cohorts it contains are not
counted or pooled together.

## Counts and evidence

Selecting a node in either plot opens its exact-treatment Studies table below
the map. Selecting a comparison arrow opens the existing comparison/diagnostics
band instead. A single-agent node shows monotherapy; a +B card in an A branch
shows the full A+B regimen. The table uses canonical result/sample IDs and
source/review/task bindings, rather than a PMID or drug-name text search, to
exclude unrelated arms from the same publication. Supported comparative results
retain their opposing arm for context. All matching retained reports remain
available across endpoints, including reports lacking N or a standard effect.
Source-supported R2/R3 rows consolidate using the existing Studies presentation;
sorting, Trial Only, CSV and study details are available. Reports remain distinct
from the deduplicated independent-study count. Node browsing does not silently
inherit the main table's endpoint/comparator/intervention filters.

Study identity, cohort/arm identity and publication identity are separate.
Specific trial aliases and unambiguous NCT links can group repeated reports.
Original studies without a formal name or NCT receive internal cohort identities;
missing registration is not an exclusion. Source-supported relationships combine
their repeated reports. Reports listing several NCTs retain separately identifiable
trial/cohort results rather than becoming an invented single trial or being
excluded solely because several registrations appear. Use a source-supported
NCT-to-cohort allocation where available; otherwise retain an internal original
cohort identity and mark registration allocation as unresolved. A list of NCTs
does not establish that their participants can be summed. Secondary pooled,
review and indirect reports do not create new independently recruited cohorts.

Assigned/randomized overall arm N is preferred for randomized trials; enrolled
overall arm N is preferred for other studies. Follow-ups, outcomes, safety
populations, subgroups and crossover populations do not add participants again.
When an overall denominator is unavailable, a supported subgroup denominator
can supply a labelled partial N. Prefer the largest relevant cohort and the
latest supported report within that cohort; do not add a subgroup to its parent
or sum overlapping subgroups. Explicitly separate recruited cohorts within one
NCT retain distinct membership. An aggregate denominator takes precedence over
the cohorts it already contains; distinct cohort denominators may contribute
together only when their non-overlap is supported.
Distinct dose arms can contribute separately only with evidence of disjoint
participants. A whole-trial N is never split evenly between arms. The current
exact-treatment totals exclude unresolved OR allocations. Earlier inclusive
coverage credited the full OR-arm N to each alternative; that evidence remains
available in history, but does not establish monotherapy exposure or create
independent drug-specific effects.
Mixed-cancer enrollment is withheld unless a supported melanoma-specific arm
allocation is available. Counts must match an accepted clinical source row and
resolve to its saved evidence anchor.
Explicit non-melanoma arms also cannot create branches or study memberships.
A mixed parent arm is retained only when accepted source evidence binds that
same arm to a melanoma population; a different melanoma arm in the same paper
does not make the non-melanoma arm eligible.

Drug N covers eligible arms treated with precisely that agent alone. Combination N
covers the exact full concurrent regimen, without supersets. A combination with
subset maintenance remains a combination. OR alternatives and sequential
regimens using different active agents do not become monotherapy records.
Repeating the same active drug or adding placebo does not create a different
active regimen. Repeated reports and crossover or
other overlapping populations remain deduplicated; node totals are not a guarantee
of disjoint patients across the entire map. Prepared contribution records reconcile each node's N to individual sources. Identified studies and unlinked
publications remain separate. Partial, provisional and unresolved counts are
labelled. A source-supported internal original-cohort identity counts as an
identified study; a bare publication count does not establish independence.
When the regimen has supporting publications but no resolved study linkage,
the map shows the publication count and **study linkage pending**, rather than
the misleading label “0 identified studies.” Catalogue-only agents show
**No linked evidence**. Source publication counts remain separate from
independent study counts and do not alter the participant calculation.
Unlinked publication totals are not summed with identified studies. A publication
can have both linked and unlinked records, including R2/R3 records with different
identity completeness. Keep this technical linkage accounting in source review;
the public branch summary omits unlinked-publication counts. These are not
necessarily additional publications beyond those already linked. Withheld
arm-record counts come from actual node membership (`relevant_node_ids` contains
the selected node while `node_ids` does not), matching the source-review drawer.
Do not use the historical `unresolved_arms` flag sum as a count of withheld records:
its flags can overlap and include partial records already counted.

**Historical diagnostic, November 12, 2026:** before the November 13 cohort and
inclusive-OR policy, the nivolumab audit found 261 publications with unlinked
records (20 also had linked records) and 565 withheld arm/cohort records. These
were record counts, not excluded studies or patients, and are not current totals
or permanent eligibility rules. That audit distinguished missing overall N,
unresolved identity, uncertain drug allocation and overlap safeguards. Current
rules permit internal original-cohort identities and labelled subgroup N fallbacks;
the latest exact-treatment rule supersedes inclusive OR coverage for displayed
single-agent totals. A remaining overlap flag still requires source review;
it does not prove overlapping patients or justify summing unresolved records.

## Updating and validation

Both current R2 and R3 publishers use the shared normalization publication
hook, which builds the map before switching the source publication. Normal
registry reconciliation also rebuilds the map. A manual map-only rebuild is:

```sh
python pipeline.py treatment-map --dry-run --audit-dir data/audits/treatment_map_candidate
python pipeline.py treatment-map
```

The map is bound to the source-file SHA, clinical content SHA, prepared
normalizations SHA, curated registry and exact producing code. The browser
rejects a stale map rather than presenting counts from a different source.
Applied graph versions and their producing code are retained under
`data/current/treatment_map/`; superseded maps are preserved. The inactive
legacy publisher cannot replace the active compact map.

Focused tests cover actual CheckMate 067 and KEYNOTE-716 source records,
duplicate publications/outcomes, disjoint arms, alternatives, sequences,
complete-arm comparison direction, catalogue coverage and contribution sums.
These example counts are assertions in tests, never production overrides.

Unresolved identity, overlap, allocation, class-only regimens and uncertain
comparison directions are retained in the prepared review records and raw
extractions. The map summarizes the currently extracted evidence; it does not
claim a complete inventory of all melanoma trials.


## Comparison analyses and sample-size planning

The top-level tabs are Treatment map and Studies. Opening an agent or combination
branch provides Endpoint, Evidence to include, and a Sample size planning toggle
in its sidebar. Evidence defaults to all designs; users may restrict
it to all trials or randomized trials. This changes comparison analyses, not
observed node counts. The default analysis combines the same treatment comparison
and endpoint across treatment settings. Advanced filters narrow the population.
The direct-comparison panel uses the Include checkboxes to control one analysis
for the exact treatment pair and endpoint. The Analysis to display / Analysis
population / model selector is removed. Explicitly incompatible quantities, such
as AFT time ratios and HRs, have ineligible checkboxes with concise row reasons.

The direct-comparison inclusion table lists each relevant study/cohort, N and
effect estimate with CI, with separate PMID and Published year columns. Multiple
rows from one publication share its identifying cells, while follow-up papers
remain separately dated. Every eligible independent cohort is initially included.
Overall results take precedence over overlapping subgroup results, but the subgroup
rows remain visible and can be selected. A study supplying only subgroup evidence
is included by default. Checking a different overlapping cohort replaces its
previous representative; separately recruited cohorts remain distinct. Selecting
one of the disjoint cohorts contained in an aggregate replaces that aggregate;
other independently recruited cohorts can then be included without also counting
the aggregate. Reselecting the aggregate replaces its constituent cohorts.
Pooling requires a supported positive N as a project inclusion rule, in addition
to valid effect precision. Prefer the broadest relevant population with N and
then the latest poolable result within the same proven cohort. Missing-N results
remain listed with their reason but do not contribute to pooled k or weights.
The N column prefers the exact comparison/analysis denominator;
an available population total is explicitly labelled **Cohort N** when it is only
a fallback. No arm allocation is inferred from that total.

Source-reviewed IO-GEM populations in PMID 40473950 have their own internal
identity rather than inheriting CheckMate 067's registration from the article.
Pooled CheckMate 067/IO-GEM populations have a separate aggregate identity.
Reused datasets and the source's conflicting 675/749 totals remain explicit
count/overlap holds; the repair adds no independent participant total or
nivolumab-versus-ipilimumab HR.

The table, pooled estimate, diagnostics, comparison arrows and planning update
together whenever an Include checkbox changes. All checked eligible rows
contribute to the displayed calculation. There are no hidden alternative pools.
The Studies advanced filters also apply to comparison analyses. All requested
criteria must match one source-bound population. A matching subgroup replaces a nonmatching overall result, or a less specific
overall match when the subgroup more directly matches the requested criteria.
An extra unrequested restriction does not make a smaller subgroup preferable to
an already matching overall cohort. Compatible results from different independent
cohorts representing the requested population can share a pool. Setting, prior
systemic treatment and BRAF coverage remain descriptive/filter metadata rather
than mandatory partitions of the default pool. Adjusted, unadjusted and
unspecified HRs may share the endpoint analysis. Explicitly incompatible effect
quantities retain a row-level eligibility explanation. With no included eligible
result, the estimate, calculated arrows and planning clear. Source records and
their original values remain inspectable.

The producer's `treatment_map_evidence.cjs` adds source-bound analysis metadata
to the existing comparison records. It uses accepted R2/R3 population, arm and
effect links to combine complementary metadata. Raw reported values, source
cutoffs and source tuples are unchanged. Derived cohort membership, exact-treatment
memberships, historical inclusive counts and filter bindings retain source references. Conflicting context and
unsupported probability links remain explicit.

`treatment_map_analysis.js` consolidates same-paper, same-context R2/R3 records
(including rounding-only or reciprocal duplicates), preserving one original
complete estimate/interval tuple and every source reference. Within each exact
pair and endpoint, it prefers the largest relevant cohort and then the latest poolable, fullest supported result within that cohort,
using registrations, specific trial identities or source-bound internal
identities. Explicit analysis dates take precedence; supported final/interim or comparable follow-up
ordering can resolve a tie, without inventing a date. Equally current incompatible
results are held for review. Missing clinical/model metadata alone does not
create a separate analysis. For alternative estimates of the same current
observational-cohort analysis, prefer the adjusted estimate when available.
Supported report chronology and cohort selection still apply. A PMID is not
proof of an independent trial. After selecting one supported representative per
independent cohort, the default pool may span study designs, treatment settings
and adjustment status as requested. Retain model and outcome-definition
metadata for review, overlapping-population safeguards and explicit incompatibility
checks for different effect quantities. Selecting an alternative result in the
table replaces the current representative of the same cohort.

The source-bound clinical classifier also recognizes an accepted adjuvant study
descriptor when its own evidence separately establishes a resected trial
population and a primary recurrence-free survival endpoint. Both source anchors
are retained. This addresses abstracts that do not repeat the word adjuvant in
the population sentence; stage alone, prior resection, incomplete resection or
an unrelated survival endpoint does not establish the setting. For CheckMate
238 this keeps the latest report (PMID 41124198) eligible under the adjuvant
filter rather than substituting an older follow-up merely because its wording
was easier to classify.

The model is automatic, using k after cohort deduplication, compatibility checks
and current inclusion/filter selections: k=1 displays the individual study
estimate with the shared 95% display convention; k=2 uses fixed-effect (common-effect) pooling;
k>=3 uses random-effects pooling with REML estimation of nonnegative
between-study variance. A REML estimate of zero still retains the Random-effects
label because model selection depends on k, not observed heterogeneity.
SE is recovered from the complete reported interval using its confidence level
(95% when absent). Fixed-effect weights are 1/variance; random-effects weights
are 1/(variance + tau-squared). REML maximizes the intercept-only restricted
likelihood, including the zero-variance boundary. Pooled intervals and effect
tests retain the normal approximation. The module reports tau-squared, Q and
I-squared; it does not derive precision from N alone.
Arrow directions and colors use the pooled effect for the selected group;
original source results and exclusion reasons remain inspectable.

Settings has no manual pooling-model control. Obsolete stored model preferences
are ignored. Result metadata, result labels, forest SVGs, and leave-one-out
outputs identify the actual model and REML method where applicable. Legacy saved
analyses must carry compatible independent-cohort counts and model metadata;
an old DL result cannot be relabelled as REML. Source-only study CSVs continue
to export reported study results rather than pooled model metadata.

The four local tabs are DIRECT ARM COMPARISON, Forest plot, Publication bias,
and Sensitivity analysis. Diagnostic tabs are disabled for k < 2. Forest plots
use a logarithmic ratio axis. Funnel plots display log ratios against SE;
Egger's regression is calculated only for k >= 10, with a t test on its intercept
and k - 2 degrees of freedom. Baujat contributions use the fixed-effect Q terms and the squared change in
the fixed-effect estimate divided by the omitted-fit variance (defined for
k >= 2). Leave-one-out analyses reapply the automatic rule to the remaining k
and show the model, ratio, interval and p-value: omitting one of three cohorts
uses fixed-effect pooling, while omitting one of two leaves an individual study
with the shared 95% display convention and its original interval retained in
details. These diagnostics use only the
selected independent cohorts, not duplicate reports or overlapping subgroups.
Rows without usable precision or supported N remain visible and may support
planning from a valid source effect, but do not contribute inverse-variance weight.
N determines eligibility under this project policy; numerical weights still use
the reported effect precision.

### Planning assumptions and methods

`treatment_map_planning.js` calculates prospective requirements; these are not
observed participant counts. Default settings are alpha .05, 80% power,
two-sided testing, two arms and 1:1 planned/reference allocation. Users can
choose one arm and either test a fixed historical benchmark or estimate a rate
to a desired confidence-interval half-width. There is no multiple-arm or
Bonferroni adjustment.

Planning effects are **planned treatment versus reference**. The default planned
treatment is the reported intervention and the reference is its comparator,
independently of the plotted arrow direction. Users may instead select the
arrow-tail or arrowhead treatment explicitly; the effect and rate roles are
reoriented together. Each table scenario shows N from the study's
effect and N from the pooled effect, with exactly the same baseline/event
assumption. Source-reported S(t) is converted to 1 - S(t); it is not confused
with an observed events/N fraction under censoring. A fixed-time reference event
probability p0 implies p1 = 1 - (1 - p0)^HR under proportional hazards. A binary
RR gives p1 = RR*p0; an OR gives p1 = OR*p0/(1 - p0 + OR*p0).
When a reported reference and planned-arm rate share the same verified source,
population, endpoint, assessment, cutoff and horizon, keep one reference-based
scenario and retain both original arm rates as visible subrows in its event-rate
cell, with calculation details available separately. Do not create
a second inferred reference scenario when the reference is already reported.
If only a planned-arm rate is reported, the reference probability is derived
once from that study's effect, explicitly labelled, and held constant in both
columns. Invalid or unavailable probabilities produce an explanation, not an N.
Reported rates from different times are separate scenarios; their range is not
a statistical confidence interval. Entering a reference rate overrides the
reported rates; survival inputs also require a time horizon.

For two-arm survival planning, Schoenfeld's event approximation is
D = (z(1-alpha/sides) + z(power))^2 / [a(1-a)*log(HR)^2], where
 a = r/(1+r) and r is the planned/reference allocation ratio. N = D/pbar,
using either the reported overall event fraction, compatible paired observed
fractions, or allocation-weighted fixed-time probabilities. Required events are
shown immediately even when total N lacks an event assumption.

For one-arm historical survival testing, the Wu modified one-sample log-rank
approximation uses D0 = (z(1-alpha/sides) + z(power))^2/log(HR)^2 and
N approximately D0/((p0+p1)/2). **D0 is expected events on the historical-null
scale**, not an observed-event target. Observed paired event fractions require separately supported compatible
censoring or complete observation at the same fixed time for one-arm planning.
Whole-population event fractions must represent exactly the compared two arms.
This calculator treats the historical benchmark as fixed and does not include its estimation uncertainty. Fixed-time
scenarios assume proportional hazards and complete follow-up to that time;
they do not model staggered accrual, loss to follow-up or competing risks.

Binary two-arm N uses the normal approximation for two independent proportions;
one-arm historical testing uses the one-sample proportion normal approximation.
Integer arm sizes respect the selected allocation ratio. One-arm precision uses
the expected Wilson interval half-width, rather than a power calculation. A
user-entered expected planned-arm rate makes precision independent of the effect
estimate, so the two N columns agree. Fixed-time survival-rate precision assumes
complete observation at that time, not a censored Kaplan–Meier design.

Planning works with a single eligible source effect even without a poolable CI.
Pooled N remains unavailable unless a compatible pool exists. For time-to-event outcomes, branch arrows show **E=** followed by the required
event count from the pooled effect, or the selected study effect when no pool
is available. They never substitute total N for this label. Binary outcomes
retain N scenario ranges. Total N remains in the planning table. One-arm rate
precision has no required-event target, so its survival arrow shows E unavailable
while the table retains the precision-based N. The radial overview remains
uncluttered.

Method references: [Cochrane, chapter 13: reporting biases and funnel asymmetry](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-13),
[powerSurvEpi reference manual: Schoenfeld planning](https://cran.r-project.org/web/packages/powerSurvEpi/powerSurvEpi.pdf),
[Wu, one-sample log-rank planning](https://pmc.ncbi.nlm.nih.gov/articles/PMC5619878/),
and [metafor: Baujat diagnostics](https://wviechtb.github.io/metafor/reference/baujat.html).
The browser does not retrieve articles or invoke a model when controls change.


## Confidence-interval line styles

`confidence_intervals.js` provides one display conversion used by the main table
and CSV, map arrows, cohort tables, forest plots and leave-one-out results.
For supported ratio effects with a non-95% interval, recover
SE = (log upper - log lower)/(2 z((1 + confidence)/2)) from the original interval,
then calculate exp(log estimate +/- z(.975) SE). Mark the result as a converted,
approximate 95% CI and retain the original level/bounds in details. This follows
the [Cochrane Handbook interval-to-SE method](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06#section-6-3-2).
Native 95% intervals remain untouched. Reversing a contrast reverses both bounds;
repeated rendering must neither reconvert a converted interval nor change its
original source precision. Pooled estimates retain their calculated 95% CIs;
display conversion does not change study weights or introduce new evidence.

For non-95% medians, survival probabilities or response percentages without a
supported interval method/data, show the estimate and **95% CI unavailable** in
the main display/CSV. Keep the original interval in source details. Explicit
non-Wald methods and implausible unverified confidence levels require source
review rather than an invented conversion. Missing or unsupported displayed
intervals do not acquire a significance classification.

For Nivolumab versus Ipilimumab, eligible CheckMate 238 (adjuvant) and CheckMate
067 (advanced disease) results can contribute to the same default analysis.
Repeated reports and overlapping subgroup analyses do not supply new independent
cohorts. A selection with k=1 shows the individual estimate and a concise
explanation beside disabled meta-analysis tabs. Forest, funnel and leave-one-out
tabs require k>=2.

Both straight radial comparison links and curved branch comparison links use
dashes only when a valid full-precision displayed 95% ratio interval includes or touches 1
(equivalently, includes zero after logging). An interval wholly below or above
1 is solid. Missing, invalid or degenerate intervals also remain solid
and are identified as unavailable in the tooltip. Reversing an arrow inverts
both CI bounds and leaves this test unchanged. Pooled comparisons use the pooled
CI, not the currently displayed original study's CI. Endpoint, evidence scope,
advanced-filter and study-inclusion changes refresh the style and clear stale states.

The legend distinguishes CI line style from the existing direction colors.
Pure component-inclusion lines remain gray, solid and arrow-free. Radial
connections remain straight and restricted to displayed parent-child pairs;
branch connections retain their existing curves. These rules supersede the
previous opposite dash mapping and all-solid comparison styling without changing
any scientific source. The semantic `ciExcludesNull` flag retains its meaning:
false maps to dashed; true or null maps to solid.


## Planning-table events and probabilities

For time-to-event planning, each study-effect and pooled-effect column group
contains Required events (E), Event rate for N, and Total N. The event-rate
cell shows available reported event probabilities as separate visible arm lines
under Reported events, using each complete treatment name. These are subrows
within one study row, so the study identity and E/N pair are not repeated.
The exact probability denominator used in the enrollment calculation is separately
labelled Used for N. It is a percentage over the stated horizon, not a person-time
incidence rate. Its details show the reference and planned-arm probabilities and
how they are combined. Reported arm rates appear in the study-effect cell only;
the pooled cell shows its own model-based denominator. Fixed-time reference scenarios use
the same p0 in both effect columns, while different HRs can imply different p1
and therefore different allocation-weighted overall event probabilities.

E is rounded up first, then N = ceil(E/event_probability), with any explicitly
configured dropout inflation applied afterward. This conservatively makes the
visible integer E reproduce the visible N using the full-precision probability.
The unrounded event target remains available internally. Binary calculations
and one-arm rate-precision calculations have no E/probability conversion;
precision rows retain N with E and the event-denominator field unavailable.

For CheckMate 067, PMID 28889792, combination versus nivolumab PFS at 36 months:
reported PFS is 39% and 32%, respectively, so reported event probabilities are 61%
and 68%. The event-rate cell visibly lists Nivolumab 68% and Ipilimumab +
Nivolumab 61%, with Used for N 63.44% separately below. With HR 0.78, the
reported nivolumab reference probability p0=.68 gives
model-implied p1=1-.32^.78=.5888342005676557. At 1:1 allocation the denominator is
.6344171002838278. Default two-arm settings require E=509 and N=803. The old 70.10%
reference probability was inferred from the combination arm, 1-.39^(1/.78),
even though the directly reported reference probability was available. That
redundant same-context scenario is now omitted. Original source values remain
unchanged. A fitted HR and rounded Kaplan–Meier estimates need not exactly
reproduce each other under the proportional-hazards planning approximation.

Source: [CheckMate 067 three-year report](https://pmc.ncbi.nlm.nih.gov/articles/PMC5706778/).
# Prepared default views and loading

The opening map reads `treatment_map_default.json`, a compact projection of the
saved graph with precomputed OS analyses and layouts for the radial overview and
every supported branch. It uses the same cohort selection and numerical engine
as interactive analysis. Original evidence and full membership/provenance remain
in `treatment_map.json` and the existing quantitative snapshot.

Nondefault endpoints, evidence scopes, advanced filters, and study inclusion
changes run the existing calculations locally. Returning to the untouched OS
defaults reuses prepared results. A graph hash and a signature of the complete
selection/statistical implementation invalidate stale prepared calculations.
The browser also verifies the prepared file's SHA-256 against the small
`treatment_map_version.json` release receipt before accepting it.

Detailed study data loads when its table comes into view or Studies is opened.
Revisiting the map preserves the loaded controller. Periodic refresh reads the
small version receipt; unchanged releases do not download the evidence again.
The Python server uses ETag revalidation for both ordinary and gzip artifacts.

R2/R3 publication and treatment-map/normalization reconciliation rebuild the
default views after source publication. To regenerate only these derived views
after editing visualization or analysis code, run:

```sh
PYTHONPATH=src python -c "from pathlib import Path; from metamelanoma.treatment_map import refresh_defaults; refresh_defaults(Path('.'))"
```

This performs no model requests and changes no extracted scientific evidence.
Keep both generated JSON files and their producing code in the same release.

## Indirect comparison

Select **Compare two treatments indirectly** on either map, then select the first and second treatments. The curved dotted arrow A → C reports A relative to C. **Reverse comparison** gives the reciprocal estimate and the interval from 1/upper to 1/lower. If only one complete regimen can be selected for the outcome and filters, clicking its node selects it directly. If several courses qualify, choose the intended complete regimen.

In **Studies**, choose a complete comparator regimen and a complete intervention regimen. With the endpoint left at **All endpoints**, the light-blue outcomes table lists each estimable indirect effect for the intervention relative to the comparator. Distinct measures, outcome definitions and time points have separate rows. Selecting an endpoint focuses the display on that outcome. Both treatments can be selected even when no publication in the table compares them directly. The **all regimens** option for a drug includes combination arms containing it when browsing studies. Studies and the maps use the same trial network, clinical filters, network model and published reference fits.

Open **Pathways** beside an outcome, or **Evidence pathways** in a map comparison, to inspect the routes between the regimens. They are ordered from fewest to most steps. Each route visits a regimen once and requires a distinct randomized trial available for each step. Trials that replicate a step appear together. Each pathway table gives the publications, first authors, years, trial names, registrations, populations, comparators, interventions, sample sizes and individual effect estimates with 95% intervals. Each study estimate compares the intervention with the comparator listed in its row. A missing sample size appears as NA.

With all pathways selected, the headline is the conventional estimate from the full connected network. Unchecking a pathway switches the headline to a **pathway-weighted sensitivity estimate**. Each checked pathway supplies a log effect and its variance from the randomized contrasts along that route. We weight those log effects by their marginal inverse variances and exponentiate the weighted mean. To calculate its 95% interval, we combine the signed contributions from every selected route into a single vector per trial before applying that trial’s covariance matrix. This accounts for contrasts shared between routes and for correlations between arms. In random-effects analyses, the route estimates and intervals use the between-trial variance estimated by REML in the full network.

**Pathway weighting** shows the estimate and planning target obtained by applying the same weighting to all available routes. Comparing this benchmark with the selected-route estimate isolates the effect of removing routes. It can differ from the default network estimate because several routes can follow the same trial comparisons. With one route checked, the sensitivity estimate equals that route’s estimate. Clearing all pathways removes the estimate and planning target. Checking them all restores the full network analysis.

Selecting a gray map node displays its reason and links to the relevant publications when available. For fotemustine versus dacarbazine, the unfiltered overall-survival network connects NIBIT-M2, CheckMate 067 and CheckMate 066 through ipilimumab plus nivolumab followed by nivolumab maintenance, and then nivolumab alone. The seven-year NIBIT-M2 result updates the four-year estimate from the same participants. For objective response, the randomized head-to-head estimate takes precedence. [NIBIT-M2 follow-up](https://pubmed.ncbi.nlm.nih.gov/38271746/) · [CheckMate 067](https://pubmed.ncbi.nlm.nih.gov/39282897/) · [CheckMate 066](https://pubmed.ncbi.nlm.nih.gov/32997575/) · [Fotemustine versus dacarbazine](https://pubmed.ncbi.nlm.nih.gov/15020614/)

A reported or validly calculated randomized head-to-head estimate in either direction takes precedence for the same outcome, measure, definition, time point and active population filters. Incomplete uncertainty still establishes direct evidence. Observational comparisons remain in the direct view. The network uses randomized trial contrasts with valid uncertainty or supported arm-level data. A linked sample size is optional. Repeated reports and overlapping populations share the original trial identity. Multi-arm contrasts require compatible within-trial information to account for their covariance. Network diagnostics identify trials held for missing multi-arm information.

When a trial's joint covariance is unavailable, its individual reported comparisons can still have valid marginal confidence intervals. The network can use one such comparison from that trial. It first builds the network of independently usable study blocks. From each remaining multi-arm trial it prefers the contrast that connects the most previously disconnected treatment pairs to that network. For ties it prefers the contrast with the fewest independently supporting trials. A tie on both criteria leaves the trial unresolved. Each round uses the same network for all candidates. The choice is independent of the selected treatments, effect magnitude and statistical significance. It requires a common cohort, a unique eligible result per arm pair and compatible binary arm data when applicable. The pathway tables identify the retained contrast. All other randomized direct results from that trial continue to establish head-to-head evidence.

The default includes all clinical settings. Advanced filters restrict the network to the qualifying result populations, including any shared comparator trials. Placebo, double placebo, observation, best supportive care and unspecified standard-care arms share a background-control category. A named active backbone remains part of the regimen. This grouping and pooling across settings assume that the relative effects are transferable across the selected trials. The result lists the represented settings and links to the contributing trials so readers can assess that assumption.

The common-effect model uses generalized least squares on log ratios from the whole connected component. Settings offers random effects with one network-wide between-trial variance estimated using restricted maximum likelihood. Both models report 95% Wald confidence intervals. Where data permit, the panel reports within-design heterogeneity and between-design inconsistency separately. A model that cannot be estimated has a stated reason.

Indirect estimates also give prospective trial requirements under **Settings → Sample size planning**. Defaults are two arms, equal allocation, two-sided α = 0.05 and 80% power. Each survival HR gives a whole-number event target by the Schoenfeld formula. For binary RR or OR, the first treatment is the planned treatment and the second supplies the baseline risk. Each eligible second-treatment risk yields a required total N. Multiple compatible published rates yield a range, and the planning note gives their PMIDs and individual calculations. A user-entered rate overrides these rates. Single-arm planning supports a fixed historical benchmark or estimation to a specified CI half-width. Survival precision planning uses event probability at a fixed horizon and assumes complete follow-up to that horizon. [Schoenfeld's event formula](https://pubmed.ncbi.nlm.nih.gov/6354290/)

During publication, `website/scripts/treatment_network_reference_cache.cjs` computes default OS fits using R `metafor::rma.mv` and checks them against the browser model. The reference asset is keyed by the source graph and the signed trial contrasts and covariance matrices. Filtered analyses and other endpoints run the same model in the browser. Running the public website requires only `python app.py`. Rebuilding the R reference for a new dataset requires R with metafor, jsonlite and Matrix. [Statistical method and R implementation](https://www.metafor-project.org/doku.php/analyses:network_meta-analysis)

### Default Studies table and indirect estimates

Opening Studies loads the prepared study rows, treatment choices and endpoint choices for the current release. Paging and sorting use these rows directly. Detailed source records and nondefault filters use the full evidence. A release manifest binds the prepared tables and estimates to their underlying evidence. The publication step regenerates them with the same functions the application uses for live analyses.

Every eligible ordered treatment pair, outcome and time point has a saved common-effect estimate and default trial-planning result. Changes to clinical filters or network model recalculate the network estimate. Both views use the displayed effect at full precision and the current planning settings to calculate required events or participants.

### Recovered single-arm denominators

For retained single-arm trial results with a crude patient proportion and both reported confidence bounds, Studies displays a source-verified analysis denominator when available. The recovery step runs during snapshot preparation. An original publication or its matched efficacy report can supply a denominator that was missing in the extraction. Separate dose or biomarker cohorts keep their own denominators.

A known event count and the rounding precision of the published proportion can identify a unique integer N. Otherwise, the algorithm searches integer event counts and denominators that reproduce the rounded estimate and interval at its published level. It uses the reported binomial method when available. If the method is unspecified it tries the two-sided Clopper–Pearson, Wilson score and Wald intervals; a result under that assumption is always labelled approximate. When several Ns fit, the display gives their lower median, with the range of compatible Ns and the method in a note. The range describes sensitivity to rounding and interval construction. Approximate Ns are display-only and do not contribute to pooling or participant totals. The original extraction is retained. Kaplan–Meier estimates, survival medians, hazard ratios, adjusted rates and unresolved conflicting outcomes do not establish an arm denominator.
