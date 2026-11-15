'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const concise=require('../dist/concise_study_groups.js');
const fs=require('node:fs'),vm=require('node:vm');
const hash=letter=>letter.repeat(64);
const leaf=(id,name,kind='drug',extra={})=>({id,name,kind,children:[],dose:'NA',route:'NA',schedule:'NA',...extra});
const operator=(id,kind,children)=>({id,kind,children,name:'NA',dose:'NA',route:'NA',schedule:'NA'});
function fixture({oldNodes=[leaf('old-drug','Immunotherapy','class')],newNodes=[leaf('new-drug','pembrolizumab')],oldRoot=oldNodes[0].id,newRoot=newNodes[0].id,oldN=30,newN=30}={}){
  const old={stage:'R2',source_sha256:hash('a'),pmid:'123',study:{comparison_structure:'single_group'},field_flags:[],populations:[{id:'old-pop',label:'Melanoma',scope:'overall',melanoma_only:'yes',parent_id:'NA'}],arms:[{id:'old-arm',population_id:'old-pop',root_id:oldRoot,nodes:oldNodes,evidence:['old-arm-proof']}],r2_links:[]};
  const next={stage:'R3',source_sha256:hash('b'),pmid:'123',study:{comparison_structure:'single_group'},field_flags:[],populations:[{id:'new-pop',label:'Advanced melanoma',scope:'overall',melanoma_only:'yes',parent_id:'NA'}],arms:[{id:'new-arm',population_id:'new-pop',root_id:newRoot,nodes:newNodes,evidence:['new-arm-proof']}],r2_links:[{section:'populations',r2_id:'old-pop',r3_id:'new-pop',relation:'supplement',evidence:['new-pop-proof']},{section:'arms',r2_id:'old-arm',r3_id:'new-arm',relation:'supplement',evidence:['new-arm-proof']}]};
  const study={pmid:'123',report_id:'report-test',details:{quantitative_extraction:[{stage:'R2',record:old},{stage:'R3',record:next,source_proof_ref:{sha256:hash('e')}}]}};
  const prefix=binding=>'CE-'+binding.slice(0,24)+'-';
  const registry={
    [prefix(hash('c'))+'old-arm-proof']:{source_id:'report-test:citation',block_id:'abstract',supporting_quote:'Patients received '+oldNodes.filter(n=>n.kind==='drug'||n.kind==='class').map(n=>n.name).join(' and ')+'.'},
    [prefix(hash('d'))+'new-pop-proof']:{source_id:'report-test:main:source',block_id:'population',supporting_quote:'The same melanoma cohort contained thirty patients.'},
    [prefix(hash('d'))+'new-arm-proof']:{source_id:'report-test:main:source',block_id:'treatment',supporting_quote:'Patients received '+newNodes.filter(n=>n.kind==='drug'||n.kind==='class').map(n=>n.name).join(' and ')+', followed by maintenance treatment.'}
  };
  const rows=[old,next].map((record,i)=>{
    const binding=hash(i?'d':'c'),population=record.populations[0].id,arm=record.arms[0].id,n=i?newN:oldN;
    return {comparator_label:'No comparator',intervention_label:i?'Specific R3 regimen':'Generic R2 regimen',is_add_on:false,comparisons:[{scope:{source_input_sha256:record.source_sha256,review_binding_sha256:binding,population_id:prefix(binding)+population},outcome_arm_id:arm,intervention_arm_id:arm,comparator_arm_id:null}],results:[{source_input_sha256:record.source_sha256,review_binding_sha256:binding,review_stage:record.stage,quantitative_record:{id:'result-'+i,population_id:population,arm_id:arm,display_n:{n},field_flags:[]}}],view:{group:i?'Advanced':'',samples:[{label:'',sample_size:String(n)}],effects:[{label:'ORR',value:i?'50 % (30–70 %)':'50 %'}]}};
  });
  return {study,registry,rows,old,next,prefix};
}
const combine=f=>concise.consolidatePresentation(f.rows,{study:f.study,registry:f.registry,viewFor:row=>row.view,treatmentText:(label,definition,addOn)=>(addOn?'+ ':'')+label});
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}

test('evidenced cohort/arm refinement prefers specific R3 description and preserves all original members',()=>{
  const f=fixture(),before=JSON.stringify(f);freeze(f);
  const groups=combine(f);assert.equal(groups.length,1);
  assert.equal(groups[0].intervention_label,'Specific R3 regimen');assert.equal(groups[0].presentation_group,'Advanced');
  assert.equal(groups[0].presentation_representative.row,f.rows[1]);assert.deepEqual(groups[0].results,f.rows.flatMap(row=>row.results));
  assert.deepEqual(groups[0].presentation_members.map(member=>member.row),f.rows);
  assert.equal(groups[0].presentation_refinements[0].r2_population_id,'old-pop');assert.deepEqual(groups[0].presentation_refinements[0].sample_sizes,['30']);
  assert.equal(JSON.stringify(f),before);
});

test('missing or ambiguous arm links and invalid full-text proof fail closed',()=>{
  for(const mutate of [
    f=>f.next.r2_links.pop(),
    f=>f.next.r2_links.push({...f.next.r2_links[1],r3_id:'another-arm'}),
    f=>{f.study.details.quantitative_extraction[1].source_proof_ref.sha256='missing';}
  ]){const f=fixture();mutate(f);assert.equal(combine(f).length,2);}
});

test('missing or foreign-source link/arm evidence cannot authorize an alias',()=>{
  for(const mutate of [
    f=>delete f.registry[f.prefix(hash('d'))+'new-arm-proof'],
    f=>{f.registry[f.prefix(hash('d'))+'new-pop-proof'].source_id='another-report:main:source';},
    f=>{f.registry[f.prefix(hash('d'))+'new-arm-proof'].source_id='report-test:citation';},
    f=>{f.registry[f.prefix(hash('d'))+'new-arm-proof'].supporting_quote='The treatment was an unspecified immunotherapy.';}
  ]){const f=fixture();mutate(f);assert.equal(combine(f).length,2);}
});

test('unequal sample sizes, non-melanoma populations and identity conflicts remain separate',()=>{
  assert.equal(combine(fixture({newN:28})).length,2);
  for(const mutate of [f=>{f.next.populations[0].melanoma_only='no';},f=>f.rows[1].results[0].quantitative_record.field_flags.push({field:'arm_id',code:'conflicting_arm'}),f=>f.next.field_flags.push({section:'arms',id:'new-arm',code:'conflicting_regimen'})]){const f=fixture();mutate(f);assert.equal(combine(f).length,2);}
});

test('a linked melanoma subgroup may have a mixed-cancer ancestor without including that ancestor',()=>{
  const f=fixture();
  for(const [record,name] of [[f.old,'old'],[f.next,'new']]){
    record.populations[0].scope='subgroup';record.populations[0].parent_id=name+'-parent';
    record.populations.push({id:name+'-parent',label:'Mixed cancer cohort',scope:'overall',melanoma_only:'no',parent_id:'NA'});
  }
  f.next.r2_links.push({section:'populations',r2_id:'old-parent',r3_id:'new-parent',relation:'same',evidence:['new-pop-proof']});
  assert.equal(combine(f).length,1);
  f.next.r2_links.pop();assert.equal(combine(f).length,2);
});

test('unrelated subgroup flags do not block an otherwise valid cohort alias',()=>{
  const f=fixture();f.next.field_flags.push({section:'populations',id:'unrelated-uveal',code:'unresolved_subgroup_parent'},{section:'r2_links',id:'unrelated-held-count',code:'foreign_or_held_row_link'});assert.equal(combine(f).length,1);
});

test('known drugs are retained and do not change to other named treatments',()=>{
  const f=fixture({oldNodes:[leaf('old-drug','nivolumab')],newNodes:[leaf('new-drug','pembrolizumab')]});assert.equal(combine(f).length,2);
  const reverse=fixture({oldNodes:[leaf('old-drug','nivolumab')],newNodes:[leaf('new-drug','PD-1 inhibitor','class')]});
  const groups=combine(reverse);assert.equal(groups.length,1);assert.equal(groups[0].presentation_field_representatives.intervention.row,reverse.rows[0]);assert.equal(groups[0].intervention_label,'Generic R2 regimen','keeps the R2 treatment when its graph is more specific');assert.equal(groups[0].presentation_group,'Advanced','can still use the better R3 cohort description');
});

test('class-to-drug refinement requires known compatible taxonomy',()=>{
  assert.equal(combine(fixture({oldNodes:[leaf('old-drug','CTLA-4 inhibitor','class')]})).length,2);
  assert.equal(combine(fixture({oldNodes:[leaf('old-drug','Unmapped therapy class','class')]})).length,2);
  assert.equal(combine(fixture({oldNodes:[leaf('old-drug','PD-1 inhibitor','class')]})).length,1);
});

test('administration discrepancies remain in source members without repeating a confirmed cohort',()=>{
  const f=fixture({oldNodes:[leaf('old-drug','nivolumab','drug',{dose:'1 mg/kg'})],newNodes:[leaf('new-drug','nivolumab','drug',{dose:'3 mg/kg'})]});f.next.r2_links[1].relation='conflict';
  const before=JSON.stringify(f),groups=combine(f);assert.equal(groups.length,1);assert.equal(groups[0].presentation_refinements[0].arms[0].relation,'conflict');assert.equal(JSON.stringify(f),before);
});

function sequentialFixture(extraDrug='nivolumab'){
  const oldNodes=[operator('old-root','SEQUENTIAL',['old-fmt','old-ici']),leaf('old-fmt','fecal microbiota transplantation'),operator('old-ici','AND',['old-pd1','old-ctla']),leaf('old-pd1','PD-1 inhibitor','class'),leaf('old-ctla','CTLA-4 inhibitor','class')];
  const newNodes=[operator('new-root','SEQUENTIAL',['new-fmt','new-ici','new-maintenance']),leaf('new-fmt','fecal microbiota transplantation'),operator('new-ici','AND',['new-ipi','new-nivo']),leaf('new-ipi','ipilimumab'),leaf('new-nivo','nivolumab'),operator('new-maintenance','OR',['new-dose1','new-dose2']),leaf('new-dose1',extraDrug,'drug',{dose:'3 mg/kg'}),leaf('new-dose2',extraDrug,'drug',{dose:'6 mg/kg'})];
  return fixture({oldNodes,newNodes});
}
test('ordered induction may gain source-stated maintenance with the same established drug',()=>{
  assert.equal(combine(sequentialFixture()).length,1);
  assert.equal(combine(sequentialFixture('pembrolizumab')).length,2);
  const f=sequentialFixture();f.registry[f.prefix(hash('d'))+'new-arm-proof'].supporting_quote='fecal microbiota transplantation, ipilimumab and nivolumab';assert.equal(combine(f).length,2);
});

test('reversed sequence and changed AND/OR relationships remain separate',()=>{
  const reversed=sequentialFixture();reversed.next.arms[0].nodes[0].children=['new-ici','new-fmt','new-maintenance'];assert.equal(combine(reversed).length,2);
  const alternatives=sequentialFixture();alternatives.next.arms[0].nodes.find(n=>n.id==='new-ici').kind='OR';assert.equal(combine(alternatives).length,2);
});

test('known role-specific arm counts cannot be swapped',()=>{
  const f=fixture();Object.assign(f.rows[0],{comparator_n:10,intervention_n:20});Object.assign(f.rows[1],{comparator_n:20,intervention_n:10});assert.equal(combine(f).length,2);
});

test('explicit comparator/intervention arm roles cannot reverse across linked stages',()=>{
  const f=fixture({oldNodes:[leaf('old-drug','pembrolizumab')]});
  for(const [record,row,prefix] of [[f.old,f.rows[0],'old'],[f.next,f.rows[1],'new']]){
    record.study.comparison_structure='comparative';
    record.arms.push({id:prefix+'-control',population_id:prefix+'-pop',root_id:prefix+'-nivo',nodes:[leaf(prefix+'-nivo','nivolumab')],evidence:[prefix+'-arm-proof']});
    row.comparisons[0].comparator_arm_id=prefix+'-control';
    delete row.comparisons[0].outcome_arm_id;
  }
  f.next.r2_links.push({section:'arms',r2_id:'old-control',r3_id:'new-control',relation:'same',evidence:['new-arm-proof']});
  f.rows[1].comparisons[0].intervention_arm_id='new-control';f.rows[1].comparisons[0].comparator_arm_id='new-arm';
  f.rows[1].results[0].quantitative_record.arm_id='new-control';
  assert.equal(combine(f).length,2);
});

test('equal displayed labels use ordinary consolidation without refinement metadata',()=>{
  const f=fixture();f.rows[1].view.group=f.rows[0].view.group;f.rows[1].intervention_label=f.rows[0].intervention_label;
  const groups=combine(f);assert.equal(groups.length,1);assert.equal(groups[0].presentation_refinements,undefined);
});

test('same-scope numerical conflict links keep both values in one confirmed cohort',()=>{
  const f=fixture();f.next.r2_links[0].relation='conflict';f.rows[1].results[0].extraction_conflict=true;
  f.rows[1].view.effects[0].value='55 %';f.rows[1].results[0].quantitative_record.field_flags=[{field:'estimate',code:'numerical_conflict'}];
  const groups=combine(f);assert.equal(groups.length,1);assert.deepEqual(groups[0].presentation_members.map(member=>member.view.effects[0].value),['50 %','55 %']);
});

test('a directly linked cohort can acquire an explicit parent and finer scope',()=>{
  const f=fixture();f.next.populations[0].scope='subgroup';f.next.populations[0].parent_id='enrolled';
  f.next.populations.push({id:'enrolled',scope:'overall',melanoma_only:'yes',parent_id:'NA'});
  assert.equal(combine(f).length,1);
});

test('a linked whole arm can identify its own cohort without a separate population link',()=>{
  const f=fixture();f.next.r2_links.shift();
  const groups=combine(f);assert.equal(groups.length,1);assert.equal(groups[0].presentation_refinements[0].cohort_identity,'whole_arm_link');
});

test('whole-arm identity cannot extend to an equal-sized outcome subgroup',()=>{
  const f=fixture();f.next.r2_links.shift();
  f.old.populations.push({id:'responders',scope:'subgroup',parent_id:'old-pop',melanoma_only:'yes'});
  f.rows[0].comparisons[0].scope.population_id=f.prefix(hash('c'))+'responders';f.rows[0].results[0].quantitative_record.population_id='responders';
  assert.equal(combine(f).length,2);
});

test('an invalid explicit population link cannot be bypassed by the whole-arm fallback',()=>{
  const f=fixture();delete f.registry[f.prefix(hash('d'))+'new-pop-proof'];assert.equal(combine(f).length,2);
});

test('a class can refine to compatible named alternatives, combinations or sequences',()=>{
  for(const kind of ['OR','AND','SEQUENTIAL']){
    const f=fixture({oldNodes:[leaf('old-drug','PD-1 inhibitor','class')],newNodes:[operator('new-root',kind,['new-a','new-b']),leaf('new-a','nivolumab'),leaf('new-b','pembrolizumab')]});
    assert.equal(combine(f).length,1,kind);
    f.next.arms[0].nodes[2].name='ipilimumab';assert.equal(combine(f).length,2,'every constituent must be compatible with the class');
  }
});

test('associative nested OR groups preserve the same named alternative treatments',()=>{
  const f=fixture({oldNodes:[operator('old-root','OR',['old-a','old-b','old-c']),leaf('old-a','nivolumab'),leaf('old-b','pembrolizumab'),leaf('old-c','ipilimumab')],newNodes:[operator('new-root','OR',['new-nested','new-c']),operator('new-nested','OR',['new-a','new-b']),leaf('new-a','nivolumab'),leaf('new-b','pembrolizumab'),leaf('new-c','ipilimumab')]});
  assert.equal(combine(f).length,1);
});

test('same-drug dose alternatives retain their raw differences without repeating the cohort',()=>{
  const f=fixture({oldNodes:[leaf('old-drug','nivolumab')],newNodes:[operator('new-root','OR',['new-a','new-b']),leaf('new-a','nivolumab','drug',{dose:'1 mg/kg'}),leaf('new-b','nivolumab','drug',{dose:'3 mg/kg'})]});
  const before=JSON.stringify(f);assert.equal(combine(f).length,1);assert.equal(JSON.stringify(f),before);
});

test('a documented lead-in or maintenance retains the original complete combination stage',()=>{
  const oldNodes=[operator('old-root','AND',['old-a','old-b']),leaf('old-a','nivolumab'),leaf('old-b','ipilimumab')];
  for(const stageOrder of [['new-a','new-combo'],['new-combo','new-a']]){
    const f=fixture({oldNodes,newNodes:[operator('new-root','SEQUENTIAL',stageOrder),operator('new-combo','AND',['new-a','new-b']),leaf('new-a','nivolumab'),leaf('new-b','ipilimumab')]});
    assert.equal(combine(f).length,1);
    f.registry[f.prefix(hash('d'))+'new-arm-proof'].supporting_quote='nivolumab and ipilimumab';assert.equal(combine(f).length,2);
  }
});

test('comparative report classification does not change a locally matched one-arm identity',()=>{
  const f=fixture();f.next.study.comparison_structure='comparative';assert.equal(combine(f).length,1);
});

test('comparator and intervention can use independently more specific source descriptions',()=>{
  const f=fixture({oldNodes:[leaf('old-drug','ipilimumab')],newNodes:[leaf('new-drug','CTLA-4 inhibitor','class')]});
  for(const [record,row,prefix,name,kind] of [[f.old,f.rows[0],'old','PD-1 inhibitor','class'],[f.next,f.rows[1],'new','nivolumab','drug']]){
    record.study.comparison_structure='comparative';record.arms.push({id:prefix+'-control',population_id:prefix+'-pop',root_id:prefix+'-control-node',nodes:[leaf(prefix+'-control-node',name,kind)],evidence:[prefix+'-arm-proof']});
    row.comparisons[0].comparator_arm_id=prefix+'-control';delete row.comparisons[0].outcome_arm_id;row.comparator_label=prefix+' comparator';
  }
  f.registry[f.prefix(hash('d'))+'new-arm-proof'].supporting_quote+=' The comparator was nivolumab.';
  f.next.r2_links.push({section:'arms',r2_id:'old-control',r3_id:'new-control',relation:'supplement',evidence:['new-arm-proof']});
  const groups=combine(f);assert.equal(groups.length,1);assert.equal(groups[0].comparator_label,'new comparator');assert.equal(groups[0].intervention_label,'Generic R2 regimen');
  assert.equal(groups[0].presentation_field_representatives.comparator.row,f.rows[1]);assert.equal(groups[0].presentation_field_representatives.intervention.row,f.rows[0]);
});

test('source-defined abbreviations can establish unknown-drug synonyms, not mere co-occurrence',()=>{
  const f=fixture({oldNodes:[leaf('old-drug','flavone acetic acid')],newNodes:[leaf('new-drug','flavone-8-acetic acid')]});
  f.registry[f.prefix(hash('d'))+'new-arm-proof'].supporting_quote='Flavone Acetic Acid (FAA) was administered. The formulation was flavone-8-acetic acid (FAA; 4.8 g per dose).';
  assert.equal(combine(f).length,1);
  f.registry[f.prefix(hash('d'))+'new-arm-proof'].supporting_quote='The text discusses flavone acetic acid and flavone-8-acetic acid.';assert.equal(combine(f).length,2);
});

function reviewedFixture(){
  const f=fixture();f.next.r2_links=[];
  const rule={id:'synthetic-source-reviewed',pmid:'123',samples:['30'],contexts:[{stage:'R2',source:hash('a'),binding:hash('c'),population:'old-pop',comparator:null,intervention:'old-arm'},{stage:'R3',source:hash('b'),binding:hash('d'),population:'new-pop',comparator:null,intervention:'new-arm'}],preferred_context:1,group_label:'Source-confirmed cohort',evidence:Object.entries(f.registry).map(([id,anchor])=>({id,...anchor})),reason:'Synthetic source-reviewed identity for a single cohort.'};
  return {f,rule};
}
function reviewedCombine(f,rules){
  const sandbox={QuantitativeExtraction:require('../dist/quantitative_extraction.js'),TreatmentGroups:require('../dist/treatment_groups.js'),CohortAliasRules:rules};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/concise_study_groups.js'),'utf8'),sandbox);
  return sandbox.ConciseStudyGroups.consolidatePresentation(f.rows,{study:f.study,registry:f.registry,viewFor:row=>row.view,treatmentText:label=>label});
}
test('a reviewed source identity can fill missing extraction links with exact scope and literal proof',()=>{
  const {f,rule}=reviewedFixture(),before=JSON.stringify(f),groups=reviewedCombine(f,[rule]);
  assert.equal(groups.length,1);assert.equal(groups[0].presentation_group,'Source-confirmed');assert.equal(groups[0].intervention_label,'Specific R3 regimen');
  assert.equal(groups[0].presentation_refinements[0].reviewed_rule_id,rule.id);assert.equal(JSON.stringify(f),before);
});

test('reviewed aliases fail closed if any literal proof, binding, scope, role or N changes',()=>{
  for(const mutate of [
    (f,r)=>{f.registry[r.evidence[0].id].supporting_quote+=' Changed.';},
    (f,r)=>{r.contexts[0].binding=hash('f');},
    (f,r)=>{r.contexts[0].population='different-subgroup';},
    (f,r)=>{r.contexts[1].comparator='new-arm';},
    (f,r)=>{r.samples=['29'];},
    (f,r)=>{delete f.study.details.quantitative_extraction[1].source_proof_ref;}
  ]){const {f,rule}=reviewedFixture();mutate(f,rule);assert.equal(reviewedCombine(f,[rule]).length,2);}
});

test('explicit reviewed group labels use the same concise cleaning in display and proof',()=>{
  const {f,rule}=reviewedFixture();rule.group_label='HIV-positive; first-line advanced melanoma';
  const group=reviewedCombine(f,[rule])[0];assert.equal(group.presentation_group,'HIV-positive; first-line advanced');assert.equal(group.presentation_refinements[0].display_group,group.presentation_group);
});

test('reviewed missing-arm handling is explicit and never a general inference',()=>{
  const {f,rule}=reviewedFixture();f.next.study.comparison_structure='comparative';f.rows[1].comparisons=[];f.rows[1].results[0].quantitative_record.arm_id='NA';
  assert.equal(reviewedCombine(f,[rule]).length,2);
  rule.contexts[1].allow_missing_arm=true;assert.equal(reviewedCombine(f,[rule]).length,1);
});

test('a homogeneous existing presentation container keeps its identity when another view joins',()=>{
  const {f,rule}=reviewedFixture();const first=f.rows[0],copy={...first,results:[...first.results]},container={...first,presentation_members:[{row:first,view:first.view},{row:copy,view:copy.view}]};
  f.rows[0]=container;assert.equal(reviewedCombine(f,[rule]).length,1);
  const foreign={...copy,results:[{...copy.results[0],quantitative_record:{...copy.results[0].quantitative_record,population_id:'other-pop'}}],comparisons:[]};
  container.presentation_members[1]={row:foreign,view:foreign.view};assert.equal(reviewedCombine(f,[rule]).length,2);
});

test('an explicit reviewed treatment completion requires its own literal source proof',()=>{
  const {f,rule}=reviewedFixture();f.old.arms[0].nodes=[leaf('old-drug','pembrolizumab')];
  f.next.arms[0].root_id='combo';f.next.arms[0].nodes=[operator('combo','AND',['new-drug','extra']),leaf('new-drug','pembrolizumab'),leaf('extra','lenvatinib')];
  assert.equal(reviewedCombine(f,[rule]).length,2,'cohort identity alone cannot add a drug');
  const proof={id:'CE-'+hash('d').slice(0,24)+'-reviewed-combination',source_id:'report-test:main:source',block_id:'combination',supporting_quote:'All thirty participants received pembrolizumab plus lenvatinib.'};f.registry[proof.id]={...proof};
  rule.treatment_preferences={intervention:{context:1,reason:'The complete regimen is explicitly reported for the whole cohort.',evidence:[proof]}};
  const groups=reviewedCombine(f,[rule]);assert.equal(groups.length,1);assert.equal(groups[0].presentation_field_representatives.intervention.row,f.rows[1]);
  f.registry[proof.id].supporting_quote='Only a subgroup received the added drug.';assert.equal(reviewedCombine(f,[rule]).length,2);
});

test('identical named class/drug leaves and duplicated alternative branches are display-equivalent',()=>{
  const f=fixture({oldNodes:[operator('old-root','OR',['old-single','old-combo']),leaf('old-single','nivolumab'),operator('old-combo','AND',['old-nivo','old-vaccine']),leaf('old-nivo','nivolumab'),leaf('old-vaccine','multipeptide vaccine','class')],newNodes:[operator('new-root','OR',['new-combo1','new-combo2','new-single']),operator('new-combo1','AND',['new-nivo','new-vaccine']),operator('new-combo2','AND',['new-nivo2','new-vaccine2']),leaf('new-single','nivolumab'),leaf('new-nivo','nivolumab'),leaf('new-nivo2','nivolumab'),leaf('new-vaccine','multipeptide vaccine'),leaf('new-vaccine2','multipeptide vaccine')]});
  assert.equal(combine(f).length,1);
});

test('a broad ICI class refines to named drugs and narrower ICI classes in a count-only source row',()=>{
  const f=fixture({oldNodes:[leaf('old-drug','Immune checkpoint inhibitors','class')],newNodes:[operator('new-root','OR',['new-ipi','new-pdl1','new-combo']),leaf('new-ipi','ipilimumab'),leaf('new-pdl1','PD-L1 inhibitors','class'),operator('new-combo','AND',['new-ctla4','new-pdl1-combo']),leaf('new-ctla4','CTLA-4 inhibitors','class'),leaf('new-pdl1-combo','PD-L1 inhibitors','class')]});
  const reported=f.rows[1].results[0];f.rows[1].results=[];f.rows[1].comparisons=[];
  f.rows[1].context_counts=[{...reported,n:{value:30},quantitative_record:{id:'r3-count-only',population_id:'new-pop',arm_id:'new-arm',n:30,complete:'yes',count_purpose:'outcome_analysis'}}];
  const groups=combine(f);assert.equal(groups.length,1);assert.equal(groups[0].results.length,1);assert.equal(groups[0].context_counts[0].quantitative_record.id,'r3-count-only');
  assert.equal(groups[0].presentation_members.length,2);assert.equal(groups[0].presentation_field_representatives.intervention.row,f.rows[1]);
});
