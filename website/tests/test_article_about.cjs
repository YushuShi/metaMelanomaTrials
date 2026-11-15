'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const staged=path.join(__dirname,'../dist');
const api=require(path.join(staged,'about_article_progress.js'));
const snapshot=JSON.parse(fs.readFileSync(path.join(staged,'data/article_review_progress.json'),'utf8'));
test('both stages show precisely the same five metrics',()=>{
 const html=api.render(snapshot),labels=[...html.matchAll(/<dt>(.*?)<\/dt>/g)].map(m=>m[1]);
 const expected=['Entered','Eligibility screening finished','Retained','Excluded','Remain unclear'];
 assert.deepEqual(labels,[...expected,...expected]);
 assert.ok(html.includes('Entered</dt><dd>'+api.number(snapshot.stages.R2.entered)));assert.ok(html.includes('Entered</dt><dd>'+api.number(snapshot.stages.R3.entered)));
 assert.doesNotMatch(html.replace(/<tbody>[\s\S]*?<\/tbody>/g,''),/extraction finished|verification|Costs|Methods|expansion|pilot|quarantin/i);
});
test('unclear tables contain only PMID and exact reason, never excluded reports or titles',()=>{
 const html=api.render(snapshot).split('<section class="panel published-outcome-review"')[0];assert.equal((html.match(/<th>PMID<\/th><th>Reason<\/th>/g)||[]).length,2);
 assert.equal((html.match(/<tr><td>/g)||[]).length,snapshot.stages.R2.unclear+snapshot.stages.R3.unclear);
 for(const pmid of ['34771668','36230688'])assert.match(html,new RegExp('pubmed.ncbi.nlm.nih.gov/'+pmid));
 const r3=html.slice(html.indexOf('<h2>R3'));
 for(const pmid of ['38459020','39762076','39737219'])assert.doesNotMatch(r3,new RegExp(pmid));
 assert.doesNotMatch(html,/<th>Article|<th>Full text|data-open=/);
 const source=structuredClone(snapshot);source.stages.R3.unclear_reports[0].reason='<unsafe & source>';
 assert.match(api.render(source),/&lt;unsafe &amp; source&gt;/);
});
test('About lists exactly the eleven source-reviewed published differences with PMID and full-report links',()=>{
 const review=require(path.join(staged,'published_outcome_review.js'));
 const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../../data/audits/outcome_conflicts_20261108/human_manual_review_summary.json'),'utf8'));
 assert.deepEqual(review.entries,source.published_value_or_denominator_review.map(({pmid,outcome,values,reason})=>({pmid,outcome,values,reason})));
 const html=api.publishedDifferences();assert.equal((html.match(/<tr><td>/g)||[]).length,11);
 for(const row of review.entries){assert.match(html,new RegExp('https://pubmed.ncbi.nlm.nih.gov/'+row.pmid+'/'));assert(html.includes(row.values));}
 assert.match(html,/href="\.\/reviews\/outcome_review\.html"/);
 assert.doesNotMatch(html,/42056527|38279601|38908858|19001327|29872552/);
 assert.equal(Object.isFrozen(review),true);assert.equal(Object.isFrozen(review.entries),true);assert(review.entries.every(Object.isFrozen));
});
test('published-review rendering escapes prose and rejects missing or duplicate source identities',()=>{
 const entry={pmid:'123',outcome:'<outcome>',values:'1 & 2',reason:'<reason>'};
 const html=api.publishedDifferences({entries:[entry]});assert.match(html,/&lt;outcome&gt;/);assert.match(html,/1 &amp; 2/);assert.match(html,/&lt;reason&gt;/);
 assert.throws(()=>api.publishedDifferences({entries:[entry,entry]}),/Unique PMID/);
 assert.throws(()=>api.publishedDifferences({entries:[{...entry,pmid:'not-pmid'}]}),/Unique PMID/);
 assert.equal(api.publishedDifferences({entries:[]}),'');
});
test('bad article counts and duplicate unclear PMIDs fail without inventing zero',()=>{
 const bad=structuredClone(snapshot);bad.stages.R3.unclear_reports[1].pmid=bad.stages.R3.unclear_reports[0].pmid;
 assert.throws(()=>api.render(bad),/Unique PMID/);
 const missing=structuredClone(snapshot);missing.stages.R3.retained=null;assert.throws(()=>api.render(missing),/counts/);
 assert.equal(api.number(0),'0');assert.equal(api.number(null),'Pending');
});
test('one renderer/poller and no hidden legacy About/C​​osts wall remains active',()=>{
 const html=fs.readFileSync(path.join(staged,'index.html'),'utf8'),app=fs.readFileSync(path.join(staged,'app.js'),'utf8');
 assert.doesNotMatch(html,/about_live_refresh|about-compatibility-bridge|tracking-usage|data-tracking-tab|<summary>Methods|usage-title/);
 assert.equal((html.match(/src="\.\/about_article_progress.js"/g)||[]).length,1);
 assert(html.indexOf('src="./published_outcome_review.js"')<html.indexOf('src="./about_article_progress.js"'));
 assert.doesNotMatch(app,/function (?:renderOverview|renderUsage|renderSources|reviewerProgressCard|sequentialProgressLabel|renderTable|selectTrackingTab)/);
 for(const name of ['charts','evidenceDisplay','settingsDefaults'])assert.match(app,new RegExp('const '+name+' = '));
});
