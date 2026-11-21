'use strict';
/* Review documents are views of the shared registry and normalization audit. */
const fs=require('node:fs'),path=require('node:path');
const {catalogueTreatments}=require('../dist/treatment_resolver.js');
const list=value=>Array.isArray(value)?value:[];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(registry,audit,queue){
 const observed=new Map();
 for(const row of list(audit.occurrences)){
  if(!row.current_main_eligible)continue;
  const result=row.resolution;
  const modality=result.status==='non_drug'&&result.active_exposure?result.generic_id:null;
  for(const id of result.canonical_ids||[result.canonical_id||modality]){
   if(!id)continue;
   const entry=observed.get(id)||{pmids:new Set(),labels:new Set()};
   entry.pmids.add(row.pmid);entry.labels.add(row.raw_label);observed.set(id,entry);
  }
 }
 const agents=catalogueTreatments(registry).map(row=>({...row,name:row.label,broad_type:row.broad_category,subtype:row.class_id,
  observed_report_count:observed.get(row.id)?.pmids.size||0,observed_pmids:[...(observed.get(row.id)?.pmids||[])].sort(),observed_labels:[...(observed.get(row.id)?.labels||[])].sort()}));
 const unresolved=list(queue.items).map(row=>({...row,name:row.raw_labels.join('; '),broad_type:'Review needed',subtype:row.reason}));
 const data={schema_version:2,title:'Treatment names and types',as_of:registry.curated_on||null,
  scope:'Curated treatment registry and source-bound R2/R3 normalization review. Report counts overlap; they are not counts of independent studies. This is not a list of approved melanoma therapies.',
  classification_policy:'Verified complete aliases and broad classes use one registry. Unknown identities, formulations and source-dependent roles remain in the review queue. Original evidence and numerical results are unchanged.',
  registry_version:registry.version,normalization_version:registry.normalization_version,registry_sha256:audit.registry_sha256,
  source_file:{path:audit.source_path,sha256:audit.source_file_sha256},normalization_audit_sha256:audit.content_sha256,
  observed_scope:audit.summary.current_main_eligible,counts:{canonical_agents:agents.length,canonical_agents_observed:agents.filter(x=>x.observed_report_count).length,
   generic_classes:list(registry.generic_classes).length,review_labels:unresolved.length},canonical_agents:agents,generic_classes:registry.generic_classes,
  review_queue:unresolved,sources:registry.sources};
 const text=[data.title,'Registry '+registry.version,'',data.scope,data.classification_policy,'','NAMED TREATMENTS'];
 for(const row of agents)text.push(`${row.label} → ${row.broad_category} → ${row.class_id}; aliases: ${list(row.aliases).join('; ')} [observed reports: ${row.observed_report_count}]`);
 text.push('','GENERIC CLASSES, CONTROLS AND MODALITIES');
 for(const row of list(registry.generic_classes))text.push(`${row.label} → ${row.broad_category} → ${row.class_id}; aliases: ${list(row.aliases).join('; ')}`);
 text.push('','REVIEW QUEUE');for(const row of unresolved)text.push(`${row.name} → ${row.reason} [${row.issue_type}; reports: ${row.report_count}; PMIDs: ${row.pmids.join(', ')}]`);
 text.push('','SOURCES');for(const row of list(registry.sources))text.push(`${row.id}: ${row.title} — ${row.url}`);
 const columns=['Name','Broad type / review reason','Class / issue','Aliases / PMIDs','Reports'];
 const table=(rows,kind)=>rows.map(row=>{const cells=kind==='queue'?[row.name,row.reason,row.issue_type,row.pmids.join(', '),row.report_count]:[row.label,row.broad_category,row.class_id,list(row.aliases).join('; '),row.observed_report_count??'—'];return '<tr>'+cells.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>';}).join('');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Treatment names and types</title><style>body{font:15px/1.5 system-ui;color:#171717;background:#fafafa;margin:32px}main{max-width:1400px;margin:auto}input{font:inherit;padding:8px;width:300px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top;overflow-wrap:anywhere}details{margin:22px 0;border:1px solid #bbb;background:white;padding:12px}summary{font-weight:650;cursor:pointer}.scroll{overflow:auto}a{color:#6336a2}footer{font-size:12px;color:#555}tr[hidden],details[hidden]{display:none}</style><main><h1>Treatment names and types</h1><p>${esc(data.scope)}</p><p>${esc(data.classification_policy)}</p><p>Registry ${esc(registry.version)} · ${agents.length} named treatments · ${list(registry.generic_classes).length} generic classes, controls and modalities · ${unresolved.length} review labels</p><label>Find a name, alias or type <input id="search" type="search"></label> <a href="drug_type_review.txt" download>Download text</a> · <a href="drug_type_review.json" download>Download JSON</a>${[['Named treatments',agents,'products'],['Generic classes, controls and modalities',list(registry.generic_classes),'generic'],['Review queue',unresolved,'queue']].map(([title,rows,kind])=>`<details${kind==='products'?' open':''}><summary>${esc(title)} (${rows.length})</summary><div class="scroll"><table><thead><tr>${columns.map(c=>'<th>'+esc(c)+'</th>').join('')}</tr></thead><tbody>${table(rows,kind)}</tbody></table></div></details>`).join('')}<details><summary>Classification sources (${list(registry.sources).length})</summary><ul>${list(registry.sources).map(s=>'<li>'+(/^https?:\/\//.test(s.url)?'<a href="'+esc(s.url)+'">'+esc(s.title)+'</a>':esc(s.title))+' — '+esc(s.id)+'</li>').join('')}</ul></details><footer>Source SHA-256 ${esc(audit.source_file_sha256)}. Registry SHA-256 ${esc(audit.registry_sha256)}. Original scientific records remain unchanged.</footer></main><script>document.querySelector('#search').addEventListener('input',event=>{const q=event.target.value.normalize('NFKC').toLowerCase();for(const section of document.querySelectorAll('details')){const rows=[...section.querySelectorAll('tbody tr')];if(!rows.length)continue;for(const row of rows)row.hidden=!row.textContent.normalize('NFKC').toLowerCase().includes(q);section.hidden=rows.every(row=>row.hidden);if(q&&!section.hidden)section.open=true;}});</script></html>`;
 return {json:data,text:text.join('\n')+'\n',html};
}
module.exports={render};
if(require.main===module){const root=path.resolve(__dirname,'../..'),read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel))),docs=render(read('config/treatment_registry.json'),read('website/dist/data/treatment_normalization_audit.json'),read('website/dist/data/treatment_review_queue.json'));for(const [ext,value]of [['json',JSON.stringify(docs.json,null,2)+'\n'],['txt',docs.text],['html',docs.html]])fs.writeFileSync(path.join(root,'website/dist/drug_type_review.'+ext),value);console.log(JSON.stringify({registry_version:docs.json.registry_version,counts:docs.json.counts}));}
