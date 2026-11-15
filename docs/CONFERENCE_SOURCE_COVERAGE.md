# Original conference source coverage

Run: `r1-2026-10-28`. Local execution date: October 28, 2026.

Every network attempt used TrackedHTTP and was recorded before dispatch. No poster/PDF/manuscript, OCR, model request, authentication bypass, or mutating refresh operation was performed. Source queries have no publication-year or language restriction. Broad/core and sarcoma concepts precede the equal-priority catalog disease/agent queries; inaccessible interfaces leave those planned queries explicitly incomplete.

Actual conference HTTP attempts in the ledger: **180**. Statuses: `{"failed": 8, "succeeded": 172}`. Repeated references to a saved response are labeled as such and are not new HTTP attempts.

Saved GraphQL error responses: **115** HTTP calls are separately annotated `logical_source_status=failed` in the ledger. HTTP transport status, request usage, attribution and monetary estimates remain unchanged. The raw-error proof and reconciliation helper are retained in `data/retrieval/conference_logical_status_reconciliation.json` and `scripts/retrieve_conferences.py --reconcile-logical-errors`.

| Original source | Result |
| --- | --- |
| ASCO Meetings | Flutter/client-rendered shell. Broad query and public frontend inspected; no anonymous scholarly-results endpoint established. |
| ASCO/JCO original publisher | Search/home requests rejected with HTTP 403. No bypass attempted. |
| ESMO OncologyPRO | Original HTML, current resource filters, and anonymous metadata service inspected. See programme details below. |
| Annals of Oncology original publisher | Home/search HTTP 403; independent source search incomplete. |
| SABCS | Original abstract archive and publisher-supplement links located; delegated e-poster interface is client-rendered. No poster/PDF downloaded. |
| CTOS | 26 publicly linked HTML home/past/annual-meeting pages inspected, with no year cutoff. No verifiable original report/abstract listing recovered; POST/token search not bypassed. |
| AACR | Organizer available; original journal abstract search HTTP 403. |
| IASLC/WCLC | Organizer and its actual `text` search-form parameter queried; no verifiable abstract-results API/count/pagination established. |
| SITC / SGO | Organizer/search interfaces attempted; no verifiable original abstract search/count/pagination established. |

## ESMO public metadata service

The anonymous read-only service returned **1496 meeting/event metadata entries**. Those are events, not result reports. The returned event catalog identified **114** research congress/symposium/conference programmes, including future event dates because an abstract can be published before its meeting.

Programme metadata was attempted for **114** entries. Each returned a generic `DataFetchingException` / `System error` rather than a readable programme. The alternative public event-code convention was also checked once and failed identically. No abstract body was requested because no active/nonembargoed original abstract metadata was established. The service's fetch/push/refresh, account, payment, and authentication operations were not invoked.

Verified original conference scholarly observations recovered: **0**. This is an access/discovery limitation, not evidence that no eligible conference trials exist. Conference reports retrieved through PubMed/Europe PMC still enter the unified inventory; they do not establish independent completeness of the original conference searches.

Exact URLs, parameters, dates, raw-response hashes, ledger call IDs, failure bodies, all unexecuted catalog queries, and public archive links are retained in `data/retrieval/conference_query_manifest.json`. No source is labeled complete; returned abstract totals and complete pagination remain unverified. Missing abstracts and inaccessible sources remain visible for the R1 checkpoint.
