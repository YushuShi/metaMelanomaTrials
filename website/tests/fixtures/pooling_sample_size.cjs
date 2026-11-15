'use strict';
// Synthetic source-bound count for tests only; never published as evidence.
module.exports=(pmid,n=100,basis='reported_analysis_n')=>({n,basis,source_refs:[{pmid:String(pmid),section:'sample_sizes',record_id:'synthetic-n-'+pmid,source_sha256:'1'.repeat(64),evidence_ids:['synthetic-n-evidence-'+pmid]}]});
