# Original preprint metadata coverage

Run: `r1-2026-10-28`. Last completed metadata pass: `2026-10-29T01:55:01.876959+00:00`.

The frozen input contains **8,330** indexed PPR records and **8,330** unique DOIs. Its SHA256 is `f3692f1c9d28a38e3f465c69d939a4a566806ac230f41cff7957033fe6304c44`; it does not match the current Europe PMC preprint input. User clarification deferred Europe PMC and its derived preprint metadata until a later PMC full-text retrieval failure. This entire inventory is preserved as auxiliary evidence and is excluded from initial R1 inputs. No additional metadata increment is authorized, and no retrieval job is running.

Crossref returned publisher-deposited metadata for **8,330** DOIs; **0** had missing or failed Crossref results. Exact multi-DOI requests, returned identities, failures, dates, raw hashes and receipts are retained in `data/retrieval/preprint_server_query_manifest.json`.

The original bioRxiv/medRxiv details APIs were checked for every applicable DOI in the frozen input. Their per-DOI status totals, including other servers without a verified metadata-only endpoint, are `{"metadata_available": 2825, "no_verified_metadata_only_endpoint": 5504, "not_returned": 1}`. Other servers are not described as independently searched: their deposited Crossref metadata was checked, and their original-server limitation remains explicit. **0** indexed records lack a DOI and retain unresolved original metadata lookup.

The output contains **11,923** bibliographic/version observations, not independent trials or participant groups. Same-DOI versions share a report identifier; explicit publisher/server preprint-to-journal relationships are carried as version links. Unreported relationships and participant overlap remain unresolved.

Every actual HTTP request used TrackedHTTP and was ledgered before dispatch. Only title, abstract, citation, version and relationship metadata were retrieved. Returned full-article/JATS/PDF links were retained as metadata when applicable and were not followed. No full preprint HTML, manuscript, poster, PDF, OCR, model request, authentication bypass or screening round was performed by this pass. Future print/event dates are diagnostic metadata and do not automatically exclude an already public record.
