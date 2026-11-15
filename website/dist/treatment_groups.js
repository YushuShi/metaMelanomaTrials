/* Source-bound treatment projections for filters, tables, exports and analysis inputs.
 * Identity, category and supporting sources live in config/treatment_registry.json.
 * treatment_resolver.js is the shared deterministic resolver. Raw source labels,
 * clinical graphs, doses, evidence and report relationships remain unchanged.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./treatment_resolver.js'));
  else root.TreatmentGroups=factory(root.TreatmentResolver);
})(typeof globalThis==='undefined'?this:globalThis,function(resolver){
  'use strict';
  const groups=Object.freeze([
    ['ctla4','CTLA-4 inhibitors'],['pd1','PD-1 inhibitors'],['pdl1','PD-L1 inhibitors'],
    ['lag3','LAG-3 inhibitors'],['pd1-lag3','PD-1 / LAG-3 bispecific inhibitors'],['braf','BRAF inhibitors'],['mek','MEK inhibitors'],
    ['other-targeted','Other targeted therapies'],['chemotherapy','Chemotherapy'],
    ['cytokines','Cytokines'],['vaccines','Therapeutic vaccines'],['cell-therapies','Cell therapies'],
    ['oncolytic-viruses','Oncolytic viruses'],['immunotherapy','Other / unspecified immunotherapy'],
    ['endocrine','Endocrine therapy'],['radiotherapy','Radiotherapy'],['surgery','Surgery'],
    ['supportive','Supportive care / observation / placebo'],
    ['no-comparator','No comparator'],['combinations','Combination treatments'],
    ['alternatives','Alternative treatments'],['other','Other / unspecified treatments']
  ].map(([id,label])=>Object.freeze({id,label})));
  const definitions=new Map(groups.map(g=>[g.id,g]));
  const norm=value=>String(value??'').normalize('NFKC').replace(/[_]/g,' ')
    .replace(/[‐‑–—−]/g,'-').replace(/α/gi,' alpha ')
    .replace(/\b(?:alfa|alpha)\s*-?\s*2\s*-?\s*([ab])\b/gi,'alpha-2$1')
    .replace(/\b(interferon|ifn)[ -]+(?=alpha)/gi,'$1 ')
    .replace(/\s*-\s*/g,'-').replace(/\s+/g,' ').trim().toLowerCase();
  const registry=resolver.registry;
  const catalogAliases=Object.fromEntries(groups.map(group=>[group.id,[]]));
  for(const entry of [...registry.products,...registry.generic_classes]){
    if(!definitions.has(entry.class_id))definitions.set(entry.class_id,{id:entry.class_id,label:entry.class_id==='pd1-pdl1-unspecified'?'PD-1/PD-L1 inhibitors, target/agent unspecified':entry.class_id==='ici-other'?'Other checkpoint inhibitors':entry.class_id==='pd1-tim3'?'PD-1/TIM-3 bispecific inhibitors':entry.label});
    (catalogAliases[entry.class_id]??=[]).push(entry.label,...entry.aliases);
  }
  const decorators=value=>value.replace(/^main study\s*:\s*/,'')
    .replace(/^(?:(?:adjuvant|neoadjuvant|maintenance|systemic|oral|intravenous|intratumoral|bolus|single[- ]agent|first[- ]line|second[- ]line|third[- ]line|palliative)\s+)+/,'')
    .replace(/\s+(?:monotherapy|alone|only)$/,'').trim();
  function leaf(value){
    const direct=resolver.resolve(value);
    if(direct.class_id&&direct.status!=='context')return direct.class_id;
    if(['context','ambiguous'].includes(direct.status)||/^(?:standard[- ](?:of[- ])?care|usual care|investigator.?s choice)$/i.test(norm(value)))return 'other';
    const key=norm(value).replace(/\s*\(combi-v\)$/,'').trim();
    const paired=/^(.+?)\s*\(([^()]+)\)$/.exec(key);
    if(paired){const first=leaf(paired[1]),second=leaf(paired[2]);if(first!=='other'&&first===second)return first;}
    const stripped=decorators(key);
    if(stripped!==key){const resolved=resolver.resolve(stripped);if(resolved.class_id)return resolved.class_id;}
    return 'other';
  }
  function classify(label){
    if(label?.record_kind==='regimen_definition'){
      const d=describeDefinition(label);
      return definitions.get(d.kind==='combination'?'combinations':d.kind==='alternative'?'alternatives':d.class_ids.length===1?d.class_ids[0]:'other')||definitions.get('other');
    }
    const original=typeof label==='string'?label:label?.text||label?.label||'';
    const value=norm(cleanAdjectives(original))
      .replace(/\s*\(\s*\+\s*placebo\s*\)\s*$/,'').trim();
    if(!value)return definitions.get('other');
    if(protectedContext(original)&&leaf(original)!=='surgery')return definitions.get('other');
    const direct=leaf(value);if(direct!=='other')return definitions.get(direct);
    const passive=value.split(/\s*[/+,]\s*|\s+(?:or|and|plus|with)\s+/).filter(Boolean);
    if(passive.length>1&&passive.every(x=>leaf(x)==='supportive'))return definitions.get('supportive');
    if(/\bor\b|\bversus\b/.test(value))return definitions.get('alternatives');
    const parts=value.split(/\s*\+\s*|\s+(?:plus|and|with)\s+|,\s*/).filter(Boolean);
    const active=parts.filter(x=>!(/^(?:(?:matched|matching) )?placebo$/.test(x)||/^[\w -]+(?:-matched| matched)? placebo$/.test(x)));
    if(active.length===1&&parts.length>1)return definitions.get(leaf(active[0]));
    if(active.length>1&&active.every(x=>leaf(x)!=='other'))return definitions.get('combinations');
    return definitions.get('other');
  }
  // One persistent registry supplies both exact identities and class aliases.
  const canonicalAgents=registry.products.map(entry=>[entry.id,entry.label,[entry.label,...entry.aliases]]);
  const agentNames=new Map(canonicalAgents.map(([id,name])=>[id,name]));
  const parentLabels={immune:'Immune checkpoint inhibitors (ICI)',ici:'Immune checkpoint inhibitors (ICI)','other-immunotherapy':'Other immunotherapy',targeted:'Targeted therapy',controls:'Supportive care / no comparator','ici-unspecified':'Unspecified immune checkpoint inhibitor'};
  const immuneClasses=new Set(['ctla4','pd1','pdl1','lag3','pd1-lag3','pd1-tim3','pd1-pdl1-unspecified','ici-other','ici-unspecified']);
  const iciClasses=new Set(['ctla4','pd1','pdl1','lag3','pd1-lag3','pd1-tim3','pd1-pdl1-unspecified','ici-other','ici-unspecified']);
  const targetedClasses=new Set(['braf','mek','braf-mek-unspecified','other-targeted']);
  const cleanText=value=>String(typeof value==='string'?value:value?.text||value?.label||'').normalize('NFKC').replace(/[‐‑–—−]/g,'-').replace(/\s+/g,' ').trim();
  const title=value=>value?value[0].toUpperCase()+value.slice(1):'';
  function cleanAdjectives(value){
    return value.replace(/^main study\s*:\s*/i,'')
      .replace(/(?:\d[\d,.]*(?:\s*-\s*\d[\d,.]*)?)\s*(?:(?:million|thousand)\s+)?(?:mg|mcg|μg|ug|ng|g|miu|mu|iu|units?|gy|cgy)\b(?:\s*(?:\/|per\s+)\s*(?:kg|m\^?[23]|days?|weeks?|hours?|h|d))*/gi,' ')
      .replace(/\b(?:once|twice|three times)\s+(?:a\s+)?(?:daily|weekly|day|week)\b|\b(?:daily|weekly|q\s*\d+\s*(?:w(?:ks?)?|d|h)|every\s+\d+\s*(?:days?|weeks?|hours?))\b/gi,' ')
      .replace(/^(?:(?:upfront|adjuvant|neoadjuvant|systemic|oral|intravenous|intratumoral|intralesional|subcutaneous|topical|bolus|single[- ]agent|first[- ]line|second[- ]line|third[- ]line|palliative|randomized|randomised|blinded|double[- ]blind(?:ed)?|single[- ]blind(?:ed)?|open[- ]label)\s+)+/i,'')
      .replace(/\s+(?:monotherapy|alone|only|combination immunotherapy|combination therapy)$/i,'')
      .replace(/\s+/g,' ').trim();
  }
  // Never turn historical, excluded, optional or sequential treatments into concurrent components.
  const protectedContext=value=>/\b(?:without|with no|with or without|prior|previous(?:ly)?|subsequent(?:ly)?|sequential(?:ly)?|followed by|following|after|before|then|history of|pretreated|post[- ](?:nivolumab|pembrolizumab|ipilimumab|treatment))\b/i.test(value)||/^(?:no|not|never|neither)\s+(?!comparator\b|comparison\b)/i.test(value)||/\b(?:not|never)\s+(?:(?:been|ever|previously|currently|actually)\s+)*(?:treated|receiv(?:e|ed|ing)|given|exposed|administered|taking|on)\b/i.test(value);
  function classLabel(id){
    const named={'ctla4':'CTLA-4 inhibitor','pd1':'PD-1 inhibitor','pdl1':'PD-L1 inhibitor','lag3':'LAG-3 inhibitor','pd1-lag3':'PD-1 / LAG-3 bispecific inhibitor','ici-unspecified':'Immune checkpoint inhibitor','immunotherapy':'Immunotherapy'};
    return named[id]||definitions.get(id)?.label||parentLabels[id]||'Other / unspecified treatments';
  }
  function simpleDescription(value){
    const text=cleanAdjectives(cleanText(value)),key=norm(text);
    if(/^(?:gm-csf|granulocyte[- ]macrophage colony[- ]stimulating factor)(?:\s*\(gm-csf\))?$/.test(key))return {label:'GM-CSF',key:'class:cytokines:gm-csf',kind:'class',components:[],known:true,class_ids:['cytokines'],agent_ids:[]};
    if(key==='ici-unspecified')return {label:'Immune checkpoint inhibitor',key:'class:ici-unspecified',kind:'class',components:[],known:true,class_ids:['ici-unspecified'],agent_ids:[]};
    const resolved=resolver.resolve(text);
    if(resolved.status==='ambiguous'||resolved.status==='context')return {label:text,key:'context:'+key,kind:resolved.status==='context'?'context':'unknown',components:[],known:false,class_ids:[],agent_ids:[],resolution:resolved};
    if(resolved.canonical_id)return {label:title(agentNames.get(resolved.canonical_id)),key:'agent:'+resolved.canonical_id,kind:'agent',agent_id:resolved.canonical_id,components:[],known:true,class_ids:[resolved.class_id],agent_ids:[resolved.canonical_id],resolution:resolved};
    if(resolved.class_id&&resolved.class_id!=='other')return {label:resolved.label,key:'class:'+resolved.class_id+(resolved.generic_id?':'+resolved.generic_id:''),kind:'class',components:[],known:true,class_ids:resolved.class_ids||[resolved.class_id],agent_ids:[],resolution:resolved};
    const paired=/^(.+?)\s*\(([^()]+)\)$/.exec(text);
    if(paired){
      const a=simpleDescription(paired[1]),b=simpleDescription(paired[2]);
      if(a.known&&b.known&&a.key===b.key)return a;
    }
    let cls=leaf(text);
    if(cls==='other'&&classify(text).id==='supportive')cls='supportive';
    if(cls==='immunotherapy'&&/checkpoint|\bici\b|\bicb\b/i.test(text))cls='ici-unspecified';
    if(cls!=='other'){
      const generic=['generic','control','non_drug'].includes(resolver.resolve(decorators(text)).status)||cls==='supportive'||cls==='no-comparator'||cls==='ici-unspecified';
      return {label:generic?classLabel(cls):title(text),key:generic?'class:'+cls:'reported:'+key,kind:'class',components:[],known:true,class_ids:[cls],agent_ids:[]};
    }
    return {label:text,key:'reported:'+norm(text),kind:'unknown',components:[],known:false,class_ids:[],agent_ids:[]};
  }
  function describe(label){
    if(label?.record_kind==='regimen_definition')return describeDefinition(label);
    const original=cleanText(label);
    if(!original)return {label:'',key:'reported:',kind:'unknown',components:[],known:false,class_ids:[],agent_ids:[]};
    if(/\(\s*\+\s*placebo\s*\)$/i.test(original)){
      const active=describe(original.replace(/\s*\(\s*\+\s*placebo\s*\)$/i,''));
      return {...active,label:active.label+'(+placebo)',placebo:true};
    }
    const text=cleanAdjectives(original);
    // Recognized surgery-without-IO is a specific control; retain that qualifier verbatim.
    if(leaf(original)==='surgery')return {label:/without|with no/i.test(original)?'Surgery without immunotherapy':'Surgery',key:/without|with no/i.test(original)?'class:surgery:without-io':'class:surgery',kind:'class',components:[],known:true,class_ids:['surgery'],agent_ids:[]};
    if(protectedContext(original))return {label:original,key:'context:'+norm(original),kind:'context',components:[],known:false,class_ids:[],agent_ids:[]};
    const concentrations=[...text.matchAll(/\b\d+(?:[.,]\d+)?\s*%/g)];
    if(concentrations.length){
      if(concentrations.length===1){
        const inner=describe(text.replace(concentrations[0][0],' ').replace(/\s+/g,' ').trim());
        if(inner.known&&inner.kind==='agent')return inner;
      }
      return {label:original,key:'reported:'+norm(original),kind:'unknown',components:[],known:false,class_ids:[],agent_ids:[]};
    }
    if(/^(?:no comparator(?:\s*\(with other treatments\)|\s+with other treatments)|single[- ]arm trial)$/i.test(text))return {label:'Single-arm trial',key:'class:no-comparator',kind:'class',components:[],known:true,class_ids:['no-comparator'],agent_ids:[],single_arm_trial:true};
    const companion=/^(.+?)\s*(?:\(\s*)?(?:with|\+)\s+other\s+treatments?\s*\)?$/i.exec(text);
    if(companion){
      const base=describe(companion[1].trim());
      if(!['unknown','context'].includes(base.kind))return {...base,label:base.label+' (with other treatments)',key:base.key+':with-other',known:false,unspecified_other_treatments:true};
      return {label:original,key:'reported:'+norm(original),kind:'unknown',components:[],known:false,class_ids:[],agent_ids:[],unspecified_other_treatments:true};
    }
    const administrativeSuffix=/^(.+?)\s+(?:(?:treatment )?arm|cream|gel|ointment|tablets?|capsules?)$/i.exec(text);
    if(administrativeSuffix){const inner=describe(administrativeSuffix[1]);if(inner.known)return inner;}
    const armWrapper=/^(?:treatment\s+)?(?:arm|group|cohort)\s+[a-z0-9]+\s*(?:\((.+)\)|:\s*(.+))$/i.exec(text);
    if(armWrapper){
      const inner=describe(armWrapper[1]||armWrapper[2]);
      return inner.known?inner:{label:original,key:'reported:'+norm(original),kind:'unknown',components:[],known:false,class_ids:[],agent_ids:[]};
    }
    if(/^(?:treatment\s+)?(?:arm|group|cohort)\s+[a-z0-9]+\b/i.test(text))return {label:original,key:'reported:'+norm(original),kind:'unknown',components:[],known:false,class_ids:[],agent_ids:[]};
    const optional=text.split(/\s*±\s*/);
    if(optional.length===2){
      const base=describe(optional[0]),extra=describe(optional[1]);
      if(base.known&&extra.known&&[base,extra].every(part=>['agent','class'].includes(part.kind))){
        return {label:base.label+' ± '+extra.label,key:'optional:'+base.key+'|'+extra.key,kind:'optional',
          components:[base],base_component:base,optional_components:[extra],known:true,
          class_ids:[...base.class_ids],agent_ids:[...base.agent_ids],
          optional_class_ids:[...extra.class_ids],optional_agent_ids:[...extra.agent_ids]};
      }
    }
    const direct=simpleDescription(text);
    if(direct.known)return direct;
    const regimenCode=/^(VEM|COMBO450)\s*:\s*(.+)$/i.exec(text);
    if(regimenCode){
      const inner=describe(regimenCode[2]),expected=regimenCode[1].toUpperCase()==='VEM'?['vemurafenib']:['binimetinib','encorafenib'];
      if(inner.known&&['agent','combination'].includes(inner.kind)&&JSON.stringify([...inner.agent_ids].sort())===JSON.stringify(expected))return inner;
      return {label:original,key:'reported:'+norm(original),kind:'unknown',components:[],known:false,class_ids:[],agent_ids:[]};
    }
    const colonHeading=/^([^:]+)\s*:\s*(.+)$/.exec(text);
    if(colonHeading){
      const head=simpleDescription(colonHeading[1]),inner=describe(colonHeading[2]);
      if(head.kind==='class'&&inner.known&&inner.class_ids.length&&inner.class_ids.every(id=>head.class_ids.includes(id)))return inner;
    }
    // A class heading plus an explicit same-class list describes those alternatives,
    // rather than adding an unspecified class as another administered treatment.
    const headed=/^(.+?)\s*\(([^()]+)\)$/.exec(text);
    if(headed){
      const head=simpleDescription(headed[1]),inner=describe(headed[2]);
      if(head.kind==='class'&&inner.known&&inner.class_ids.length&&inner.class_ids.every(id=>head.class_ids.includes(id)))return inner;
    }
    const normalized=norm(text);
    const alternative=/\bor\b|\bversus\b|\bvs\.?\b/i.test(text);
    const splitter=alternative?/\s+(?:or|versus|vs\.?)\s+/i:/\s*\+\s*|\s+(?:plus|and|with)\s+|\s*,\s*/i;
    let parts=text.split(splitter).map(x=>x.trim()).filter(Boolean);
    let placebo=false;
    if(!alternative){parts=parts.filter(part=>{const inactive=/^(?:(?:matched|matching)\s+)?placebo\b/i.test(part)||/\bplacebo\s*(?:\([^)]*\))?$/i.test(part);placebo||=inactive;return !inactive;});}
    if(parts.length===1&&placebo){const active=describe(parts[0]);if(active.kind!=='unknown'&&active.kind!=='context')return {...active,label:active.label+'(+placebo)',placebo:true};}
    if(!parts.length&&placebo)return {...simpleDescription('placebo'),placebo:true};
    if(parts.length<2)return direct;
    const components=parts.map(part=>simpleDescription(part));
    const kind=alternative?'alternative':'combination';
    const unique=[...new Map(components.map(part=>[part.key,part])).values()];
    if(unique.length===1)return unique[0];
    const class_ids=[...new Set(unique.flatMap(x=>x.class_ids))],agent_ids=[...new Set(unique.flatMap(x=>x.agent_ids))];
    return {label:unique.map(x=>x.label).join(alternative?' or ':' + ')+(placebo?'(+placebo)':''),key:kind+':'+unique.map(x=>x.key).sort().join('|'),kind,components:unique,known:unique.every(x=>x.known),class_ids,agent_ids,placebo};
  }
  // Public regimen definitions are compiled once; descriptions never reparse their labels.
  const definitionRoles=new Set(['actual_regimen','prior_history','negated','preparation','unclear']);
  // Private canonical parses never expose their trees to caller mutation.
  const legacyDefinitionSources=new Map();
  const LEGACY_COMPILER_VERSION=4;
  const cloneDefinition=value=>JSON.parse(JSON.stringify(value));
  const definitionEqual=(a,b)=>JSON.stringify(stableDefinition(a))===JSON.stringify(stableDefinition(b));
  function stableDefinition(value){
    if(Array.isArray(value))return value.map(stableDefinition);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableDefinition(value[key])]));
    return value;
  }
  function definitionNeed(ok,message){if(!ok)throw new Error(message);}
  function stringList(value){return Array.isArray(value)&&value.every(x=>typeof x==='string'&&x.length)&&new Set(value).size===value.length;}
  const definitionText=value=>String(value).replace(/&(?:#47|#x2f|sol);/gi,'/').replace(/&(?:sup2|#178);/gi,'²').replace(/&(?:sup3|#179);/gi,'³').replace(/&(?:micro|mu);/gi,'μ').replace(/&amp;/gi,'&');
  function metadataFromLabel(raw){
    const all=pattern=>[...raw.matchAll(pattern)].map(m=>m[0]);
    const dose=all(/\b\d+(?:[.,]\d+)?\s*(?:(?:million|thousand)\s+)?(?:mg|mcg|μg|ug|ng|g|miu|mu|iu|units?|Gy|cGy)\b(?:\s*(?:\/|per\s+)\s*(?:kg|m\^?[23]|days?|weeks?|hours?|h|d))*/gi);
    dose.push(...all(/\b\d+(?:[.,]\d+)?\s*%/g));
    const route=all(/\b(?:oral|intravenous|intratumoral|intralesional|subcutaneous|intramuscular|topical|IV|SC|IM|PO)\b/gi);
    const schedule=all(/\b(?:every\s+\d+\s*(?:days?|weeks?|hours?)|q\s*\d+\s*(?:w(?:ks?)?|d|h)|(?:once|twice|three times)\s+(?:a\s+|per\s+)?(?:day|week|daily|weekly)|daily|weekly|for\s+(?:\d+|one|two|three|four|five|six|eight|ten|twelve)\s*(?:doses?|cycles?))\b(?:\s*[×x]\s*\d+)?/gi);
    return {dose:dose.length?dose.join('; '):null,route:route.length?route.join('; '):null,schedule:schedule.length?schedule.join('; '):null,
      metadata_literals:{dose,route,schedule}};
  }
  function leafNode(raw,description,extra={}){
    const known=description.kind==='agent'||description.kind==='class';
    return {type:description.kind==='agent'?'agent':description.kind==='class'?'class':'unknown',raw_label:raw,
      name:description.label||raw||null,agent_id:description.agent_id||null,
      class_id:known?(description.resolution?.class_id||description.class_ids[0]||null):null,class_source:known&&description.class_ids.length?'curated_vocabulary':null,
      reported_class:null,...metadataFromLabel(raw),evidence_ids:[],normalization:description.resolution||resolver.resolve(raw),...(description.resolution?.status==='control'?{inactive:true}:{}),...extra};
  }
  function typedLeaf(raw,compilerVersion=1){
    const literal=cleanAdjectives(cleanText(definitionText(raw))).replace(/[;,]\s*$/,'').trim();
    const namedPlacebo=/^(.+?)(?:[- ]matched)?\s+placebo$/i.exec(literal);
    if(/^(?:(?:matched|matching)\s+)?placebo(?:\s+group)?$/i.test(literal)||namedPlacebo&&simpleDescription(namedPlacebo[1].replace(/[- ]matched$/i,'')).known){
      return leafNode(raw,{kind:'class',label:'Placebo',class_ids:['supportive']},{inactive:true});
    }
    let text=literal.replace(/^(?:(?:high|low)[ -]dose\s+)+/i,'')
      .replace(/\b(?:IV|SC|IM|PO)\b/g,' ')
      .replace(/\b(?:for\s+(?:\d+|one|two|three|four|five|six|eight|ten|twelve)\s*(?:doses?|cycles?))\b/gi,' ')
      .replace(/\s*[×x]\s*\d+\s*$/i,'')
      .replace(/\b\d+(?:[.,]\d+)?\s*%/g,' ')
      .replace(/\s*\((?:cohort|arm|group)\s+[a-z0-9_-]+\)\s*$/i,'')
      .replace(/\(\s*\)/g,' ').replace(/\s+/g,' ').trim();
    text=cleanAdjectives(text);
    const suffix=/^(.+?)\s+(?:(?:treatment )?arm|cream|gel|ointment|tablets?|capsules?)$/i.exec(text);
    if(suffix)text=suffix[1];
    const aliases={DAB:'dabrafenib',TRAM:'trametinib',ENCO:'encorafenib',BINI:'binimetinib',VEM:'vemurafenib',COBI:'cobimetinib',ATEZO:'atezolizumab',NIVO:'nivolumab',RELA:'relatlimab',IPI:'ipilimumab'};
    const alias=compilerVersion>=3?aliases[text.toUpperCase()]:null;
    return leafNode(raw,simpleDescription(alias||text));
  }
  function splitDefinition(text,pattern){
    const pieces=[];let start=0,depth=0;const matcher=new RegExp(pattern.source,'iy');
    for(let i=0;i<text.length;i++){
      if(text[i]==='('||text[i]==='[')depth++;
      if(text[i]===')'||text[i]===']')depth--;
      if(depth!==0)continue;
      matcher.lastIndex=i;const found=matcher.exec(text);
      if(found&&found[0].length){pieces.push(text.slice(start,i).trim());i=matcher.lastIndex-1;start=i+1;}
    }
    pieces.push(text.slice(start).trim());return pieces.length>1&&pieces.every(Boolean)?pieces:null;
  }
  function unwrapDefinition(text){
    while(text.startsWith('(')&&text.endsWith(')')){
      let depth=0,whole=true;
      for(let i=0;i<text.length-1;i++){if(text[i]==='(')depth++;if(text[i]===')')depth--;if(!depth){whole=false;break;}}
      if(!whole)break;text=text.slice(1,-1).trim();
    }
    return text;
  }
  function parseDefinitionLabel(raw,depth=0,compilerVersion=LEGACY_COMPILER_VERSION){
    if(depth>24)return leafNode(raw,{kind:'unknown',label:raw,class_ids:[]});
    const text=unwrapDefinition(cleanText(definitionText(raw)));
    if(/^(?:no comparator(?:\s*\(with other treatments\)|\s+with other treatments)|single[- ]arm trial)$/i.test(text))return leafNode(raw,simpleDescription('No comparator'),{single_arm_trial:true,...(compilerVersion>=2?{display_no_comparator:true}:{})});
    if(compilerVersion>=4){
      const complete=simpleDescription(text);
      if(complete.known&&resolver.resolve(text).status!=='unresolved')return leafNode(raw,complete);
    }
    if(compilerVersion>=3){
      // These exact paired abbreviations identify source-reported concurrent
      // BRAF/MEK regimens. Other slashes retain their unresolved meaning.
      const expanded=text
        .replace(/\b(?:DAB|dabrafenib)\s*\/\s*(?:TRAM|trametinib)\b/gi,'DAB + TRAM')
        .replace(/\b(?:ENCO|encorafenib)\s*\/\s*(?:BINI|binimetinib)\b/gi,'ENCO + BINI')
        .replace(/\b(?:VEM|vemurafenib)\s*\/\s*(?:COBI|cobimetinib)\b/gi,'VEM + COBI');
      if(expanded!==text){const root=parseDefinitionLabel(expanded,depth+1,compilerVersion);return {...root,raw_label:raw};}
      const cleaned=text.replace(/\s+(?:(?:first[- ]line|second[- ]line)\s+)?comparator$/i,'').replace(/\s+cohort$/i,'').trim();
      if(cleaned&&cleaned!==text){
        const root=parseDefinitionLabel(cleaned,depth+1,compilerVersion),d=describeNode(root);
        if(d.known)return {...root,raw_label:raw,...(!root.children?metadataFromLabel(raw):{})};
      }
      const annotation=/^(.+?)\s*\((HDI|ipi3|ipi10)\)\s*$/i.exec(text);
      if(annotation){
        const root=parseDefinitionLabel(annotation[1],depth+1,compilerVersion),d=describeNode(root),note=annotation[2].toLowerCase();
        const hdi=note==='hdi'&&d.agent_ids.length===1&&d.agent_ids[0]==='interferon_alfa_2b'&&/\bhigh[- ]dose\b/i.test(annotation[1]);
        const ipi=/^ipi(3|10)$/.exec(note);
        if(d.known&&(hdi||ipi&&d.agent_ids.length===1&&d.agent_ids[0]==='ipilimumab'&&new RegExp('\\b'+ipi[1]+'\\s*mg\\s*\\/\\s*kg\\b','i').test(annotation[1])))return {...root,raw_label:raw,...metadataFromLabel(raw)};
      }
    }
    if(compilerVersion>=2){
      // Only accept administrative wrappers when the entire remaining regimen is
      // already recognized; unknown components and source context are not dropped.
      const pooled=/[,;]\s*(pooled(?:\s+(?:regimens|dose levels|dosing schedules))?)\s*$/i.exec(text);
      const wrapped=(pooled?text.slice(0,pooled.index):text)
        .replace(/^(?:melanoma|NSCLC)\s+cohort\s+/i,'')
        .replace(/^(?:study\s+)?treatment\s+(?:with|using)\s+/i,'')
        .replace(/[- ]treated(?:\s+(?:melanoma|NSCLC))?\s+cohort$/i,'')
        .replace(/\s+(?:study\s+)?treatment(?:\s+group)?$/i,'').trim();
      if(wrapped&&wrapped!==text){
        const root=parseDefinitionLabel(wrapped,depth+1,compilerVersion),description=describeNode(root);
        if(description.known&&(description.agent_ids.length||description.class_ids.length)){
          return {...root,raw_label:raw,...(!root.children?metadataFromLabel(raw):{}),
            ...(pooled?{pooled_regimens:true,pooled_context:pooled[1],unspecified_other_treatments:true,display_drug_only:true}:{})};
        }
      }
      const cleaned=text
        .replace(/^(?:(?:single[- ]arm(?:\s+(?:study|trial))?|(?:first|second|third)[- ]line|adjuvant|neoadjuvant|upfront|palliative|(?:combination|combined)(?:\s+(?:therapy|treatment|immunotherapy))?(?:\s+(?:of|with))?|(?:treatment|experimental|comparator)\s+arm)\s*:\s*|(?:single[- ]arm(?:\s+(?:study|trial))?|(?:first|second|third)[- ]line|adjuvant|neoadjuvant|upfront|palliative|(?:combination|combined)(?:\s+(?:therapy|treatment|immunotherapy))?(?:\s+(?:of|with))?)\s+)+/i,'')
        .replace(/\bcarboplatin\s*\/\s*paclitaxel\b/gi,'carboplatin + paclitaxel')
        .replace(/\s+(?:treatment\s+)?arm$/i,'')
        .replace(/\s+(?:(?:first|second|third)[- ]line|adjuvant|neoadjuvant|(?:combination|combined)(?:\s+(?:therapy|treatment|immunotherapy))?)$/i,'').trim();
      if(cleaned&&cleaned!==text){
        const root=parseDefinitionLabel(cleaned,depth+1,compilerVersion);
        const incompleteCombination=/\b(?:combination|combined)\b/i.test(text)&&['agent','class'].includes(root.type);
        return {...root,raw_label:raw,...(!root.children?metadataFromLabel(raw):{}),...(incompleteCombination?{unspecified_other_treatments:true,display_drug_only:true}:{})};
      }
      const annotation=/^(.+?)\s*\(([^()]*)\)\s*$/.exec(text);
      if(annotation){
        const inner=parseDefinitionLabel(annotation[1],depth+1,compilerVersion),d=describeNode(inner),note=annotation[2].trim();
        const trialAgents={cobrim:['vemurafenib','cobimetinib'],'combi-v':['dabrafenib','trametinib']};
        const trial=trialAgents[note.replace(/^(?:trial|study)\s+/i,'').toLowerCase()];
        const abbreviation=note==='CP'&&d.simple_concurrent&&['carboplatin','paclitaxel'].every(id=>d.agent_ids.includes(id));
        const setting=/^(?:(?:first|second|third)[- ]line|adjuvant|neoadjuvant|single[- ]arm(?:\s+(?:study|trial))?|(?:treatment|experimental|comparator)\s+arm)$/i.test(note);
        if(d.known&&(abbreviation||trial&&trial.every(id=>d.agent_ids.includes(id))||setting)){
          return {...inner,raw_label:raw,...(!inner.children?metadataFromLabel(raw):{})};
        }
      }
    }
    const operation=(type,parts)=>({type,raw_label:raw,children:parts.map(part=>parseDefinitionLabel(part,depth+1,compilerVersion)),evidence_ids:[]});
    const companion=/^(.+?)\s*(?:\(\s*)?(?:with|\+)\s+other\s+treatments?\s*\)?$/i.exec(text);
    if(companion){const base=parseDefinitionLabel(companion[1],depth+1,compilerVersion);if(['agent','class'].includes(base.type))return {...base,raw_label:raw,unspecified_other_treatments:true};}
    const placeboDuring=/^((?:matching\s+)?placebo)\s+(?:during|while\s+receiving)\s+(.+)$/i.exec(text);
    if(placeboDuring)return operation('and',[placeboDuring[2],placeboDuring[1]]);
    const wrapper=/^(?:treatment\s+)?(?:arm|group|cohort)\s+[a-z0-9_-]+\s*(?:\((.+)\)|:\s*(.+))$/i.exec(text);
    if(wrapper)return parseDefinitionLabel(wrapper[1]||wrapper[2],depth+1,compilerVersion);
    const code=/^(VEM|COMBO450)\s*:\s*(.+)$/i.exec(text);
    if(code){
      const inner=parseDefinitionLabel(code[2],depth+1,compilerVersion),d=describeNode(inner),wanted=code[1].toUpperCase()==='VEM'?['vemurafenib']:['binimetinib','encorafenib'];
      if(d.known&&d.simple_concurrent&&definitionEqual([...d.agent_ids].sort(),wanted))return inner;
      return leafNode(raw,{kind:'unknown',label:raw,class_ids:[]});
    }
    const standard=/^standard[ -]of[ -]care\s+comparator\s*:\s*(.+)$/i.exec(text);
    if(standard)return parseDefinitionLabel(standard[1],depth+1,compilerVersion);
    const combination=/^(?:combination(?:\s+(?:therapy|immunotherapy|treatment))?(?:\s+(?:of|with))?|combined(?:\s+(?:therapy|treatment))?(?:\s+with)?)\s+(.+)$/i.exec(text);
    if(combination){
      const inner=parseDefinitionLabel(combination[1],depth+1,compilerVersion);
      if(inner.type==='and')return inner;
      return leafNode(raw,{kind:'unknown',label:raw,class_ids:[]});
    }
    const heading=/^(.+?)\s+(?:with|using|consisting of)\s+(.+)$/i.exec(text)||/^(.+?)\s*:\s*(.+)$/.exec(text)||/^(.+?)\s*\((.+)\)$/.exec(text);
    if(heading){
      const head=simpleDescription(heading[1]),inner=parseDefinitionLabel(heading[2],depth+1,compilerVersion),d=describeNode(inner);
      const same=head.kind==='class'&&d.known&&d.class_ids.length&&d.class_ids.every(id=>head.class_ids.includes(id)||head.class_ids.includes('immunotherapy')&&['ctla4','pd1','pdl1','lag3','ici-unspecified','immunotherapy','cytokines','vaccines','cell-therapies','oncolytic-viruses'].includes(id));
      if(same&&(!/\bmonotherapy\b/i.test(heading[1])||!['and','sequential'].includes(inner.type)))return inner;
      if(same)return leafNode(raw,{kind:'unknown',label:raw,class_ids:[]});
      if(head.kind==='agent'&&d.known&&d.simple_concurrent&&d.agent_ids.length===1&&d.agent_ids[0]===head.agent_id&&/\([^()]+\)$/.test(text))return inner;
    }
    const sequential=splitDefinition(text,/\s*(?:→|->)\s*|\s+(?:followed\s+by|then|subsequently(?:\s+with)?|with\s+subsequent)\s+/i);
    if(sequential)return operation('sequential',sequential);
    const alternatives=splitDefinition(text,/\s+or\s+/i);
    if(alternatives)return operation('or',alternatives);
    const optional=splitDefinition(text,/\s*±\s*/);
    if(optional&&optional.length===2)return operation('optional',optional);
    let direct=typedLeaf(raw,compilerVersion);
    if(direct.type==='unknown'&&text!==cleanText(definitionText(raw)))direct=typedLeaf(text,compilerVersion);
    if(direct.type!=='unknown')return direct;
    const concurrent=splitDefinition(text,/\s*\+\s*|\s+(?:plus|and|with)\s+|,\s*(?!\d)/i);
    if(concurrent)return operation('and',concurrent);
    return direct;
  }
  function regimenRoleProjection(root,raw){
    const conditioning=/\blymphodeplet(?:ion|ing|ive)?\b|\bconditioning\b/i.test(raw);
    const cellTherapy=/\b(?:tils?|lymphocytes?|cell therapy|lifileucel|car[- ]t)\b/i.test(raw);
    const walk=node=>{
      if(node.children)return {...node,children:node.children.map(walk)};
      const normalized=node.normalization||resolver.resolve(node.raw_label);
      const role=conditioning&&cellTherapy&&['cyclophosphamide','fludarabine','fludarabine_phosphate'].includes(node.agent_id)?'conditioning':normalized.role;
      return role!==normalized.role?{...node,normalization:{...normalized,role,role_basis:'Explicit lymphodepleting/conditioning cell-therapy arm wording.',role_source_text:raw}}:node;
    };
    return walk(root);
  }
  function definitionRole(raw,requested){
    if(requested!=='actual_regimen')return requested;
    const context=resolver.resolve(raw);if(context.status==='context')return context.role;
    if(leaf(raw)==='surgery')return requested;
    if(/^(?:no|not|never|neither)\s+(?!comparator\b|comparison\b)/i.test(raw)||/\b(?:without|with no|with or without|not treated|never received)\b/i.test(raw))return 'negated';
    if(/^(?:prior\b|previous(?:ly)?\s+(?:treated|received|therapy|treatment)|history of\b|pretreated\b)/i.test(raw)||/\bwith\s+prior\b/i.test(raw))return 'prior_history';
    if(/\b(?:versus|vs\.?|before|following)\b/i.test(raw))return 'unclear';
    return requested;
  }
  function legacyDefinitionSource(raw,compilerVersion=LEGACY_COMPILER_VERSION){
    definitionNeed([1,2,3,LEGACY_COMPILER_VERSION].includes(compilerVersion),'Unknown legacy regimen compiler version');
    const cacheKey=compilerVersion+':'+raw;
    if(legacyDefinitionSources.has(cacheKey))return legacyDefinitionSources.get(cacheKey);
    let text=raw,placebo=false;
    if(/\(\s*\+\s*placebo\s*\)\s*$/i.test(text)){placebo=true;text=text.replace(/\s*\(\s*\+\s*placebo\s*\)\s*$/i,'');}
    const root=regimenRoleProjection(parseDefinitionLabel(text,0,compilerVersion),raw),source={root,placebo,root_fingerprint:JSON.stringify(stableDefinition(root))};
    legacyDefinitionSources.set(cacheKey,source);return source;
  }
  function definitionFromLabel(label,{source_binding=null,role='actual_regimen'}={}){
    const raw=typeof label==='string'?label:String(label?.text||label?.label||'');
    definitionNeed(definitionRoles.has(role),'Unknown regimen role');
    const source=legacyDefinitionSource(raw);
    const value={schema_version:1,record_kind:'regimen_definition',origin:'legacy_label',compiler_version:LEGACY_COMPILER_VERSION,registry_version:registry.version,raw_label:raw,
      role:definitionRole(raw,role),source_binding:cloneDefinition(source_binding),arm_id:null,evidence_ids:[],root:cloneDefinition(source.root),placebo:source.placebo};
    return validateDefinition(value);
  }
  function nativeDefinitionRoot(native){
    definitionNeed(native&&typeof native.arm_id==='string'&&typeof native.label==='string'&&typeof native.root_node_id==='string'&&Array.isArray(native.nodes)&&native.nodes.length>0&&native.nodes.length<=512&&stringList(native.evidence_ids),'Invalid native regimen graph');
    const nodes=new Map();
    for(const node of native.nodes){
      definitionNeed(node&&typeof node.node_id==='string'&&node.node_id&&!nodes.has(node.node_id)&&['drug','class','other','AND','OR','SEQUENTIAL','UNKNOWN'].includes(node.kind)&&Array.isArray(node.children)&&stringList(node.evidence_ids),'Invalid/duplicate native regimen node');
      for(const field of ['name','drug_class','dose','route','schedule'])definitionNeed(node[field]===null||typeof node[field]==='string','Native regimen metadata must be literal strings/null');
      nodes.set(node.node_id,node);
    }
    const visited=new Set(),active=new Set();
    const visit=(id,depth)=>{
      definitionNeed(nodes.has(id)&&!active.has(id)&&depth<=32,'Dangling/cyclic native regimen graph');
      const node=nodes.get(id);active.add(id);visited.add(id);let result;
      if(['AND','OR','SEQUENTIAL'].includes(node.kind)){
        definitionNeed(node.children.length>=2&&new Set(node.children).size===node.children.length&&['name','drug_class','dose','route','schedule'].every(key=>node[key]===null),'Native operator needs children and no leaf metadata');
        result={type:node.kind.toLowerCase(),raw_label:null,children:node.children.map(child=>visit(child,depth+1)),evidence_ids:[...node.evidence_ids]};
      }else{
        definitionNeed(node.children.length===0&&(node.kind==='UNKNOWN'||typeof node.name==='string'&&node.name.trim()),'Native leaf is malformed');
        let d=node.name?simpleDescription(node.name):{kind:'unknown',label:'',class_ids:[]};
        // Extractor-proposed node types/classes are provisional; exact curated
        // identity wins while the original graph and reported_class are retained.
        result=leafNode(node.name||'',d,{dose:node.dose,route:node.route,schedule:node.schedule,
          metadata_literals:{dose:node.dose?[node.dose]:[],route:node.route?[node.route]:[],schedule:node.schedule?[node.schedule]:[]},
          reported_class:node.drug_class,evidence_ids:[...node.evidence_ids]});
        if(result.type==='unknown'&&node.name){
          const parsed=parseDefinitionLabel(node.name),description=describeNode(parsed);
          // Expand only a fully resolved literal regimen. Generic target slashes
          // are recognized as classes before this branch; malformed/partial
          // products remain unknown. The original native leaf is preserved.
          if(parsed.children&&description.known){
            const source={...result,native_node_id:id};
            result={...parsed,raw_label:node.name,native_leaf_source:source,dose:node.dose,route:node.route,schedule:node.schedule,evidence_ids:[...node.evidence_ids]};
          }
        }
        if(result.normalization?.status==='control')result.inactive=true;
      }
      result.native_node_id=id;active.delete(id);return result;
    };
    const root=visit(native.root_node_id,0);definitionNeed(visited.size===nodes.size,'Unreachable native regimen nodes');return regimenRoleProjection(root,native.label);
  }
  function definitionFromNative(native,{source_binding=null,role='actual_regimen'}={}){
    definitionNeed(definitionRoles.has(role),'Unknown regimen role');
    const root=nativeDefinitionRoot(native);
    const labelRole=definitionRole(native.label,role);
    if(role==='actual_regimen'&&['prior_history','negated','preparation'].includes(labelRole))role=labelRole;
    return validateDefinition({schema_version:1,record_kind:'regimen_definition',origin:'native_graph',registry_version:registry.version,raw_label:native.label,
      role,source_binding:cloneDefinition(source_binding),arm_id:native.arm_id,evidence_ids:[...native.evidence_ids],root,native_graph:cloneDefinition(native),placebo:false});
  }
  function describeNode(node){
    const base={normalization:node.normalization,role:node.normalization?.role||'principal',active_exposure:node.normalization?.active_exposure,raw_label:node.raw_label,dose:node.dose??null,route:node.route??null,schedule:node.schedule??null,evidence_ids:node.evidence_ids||[],components:[],placebo:node.inactive===true,...(node.pooled_regimens?{pooled_regimens:true,pooled_context:node.pooled_context}:{})};
    const principal=base.active_exposure!==false&&!['conditioning','adjuvant','preparation','prior_history','negated','control','structural','unclear'].includes(base.role);
    const other=node.unspecified_other_treatments===true;
    if(node.type==='agent')return {...base,label:title(agentNames.get(node.agent_id))+(other&&!node.display_drug_only?' (with other treatments)':''),key:'agent:'+node.agent_id+(other?':with-other':''),kind:'agent',agent_id:node.agent_id,known:!other,class_ids:node.class_id?[node.class_id]:['other'],principal_class_ids:principal?[node.class_id||'other']:[],agent_ids:[node.agent_id],simple_concurrent:!other&&principal,concurrent_agent_ids:other||!principal?[]:[node.agent_id],...(other?{unspecified_other_treatments:true}:{})};
    if(node.type==='class')return {...base,label:node.single_arm_trial?(node.display_no_comparator?'No comparator':'Single-arm trial'):(node.name||classLabel(node.class_id))+(other&&!node.display_drug_only?' (with other treatments)':''),key:'class:'+node.class_id+(other?':with-other':''),kind:'class',known:!other,class_ids:node.normalization?.class_ids||[node.class_id],principal_class_ids:principal?(node.normalization?.class_ids||[node.class_id]):[],agent_ids:[],simple_concurrent:false,concurrent_agent_ids:[],inactive:node.inactive===true,...(other?{unspecified_other_treatments:true}:{}),...(node.single_arm_trial?{single_arm_trial:true}:{})};
    if(node.type==='unknown')return {...base,label:node.raw_label||node.name||'Unspecified treatment',key:'reported:'+norm(node.name||node.raw_label||''),kind:'unknown',known:false,class_ids:[],agent_ids:[],simple_concurrent:false,concurrent_agent_ids:[]};
    const all=node.children.map(describeNode),activeParts=node.type==='and'?all.filter(part=>!part.inactive):all;
    // Merge repeated aliases only within one concurrent context. Literal source
    // nodes remain intact; distinct doses/routes/schedules and sequential phases
    // remain distinct. Aggregate evidence for the presentation projection.
    const seen=new Map(),parts=[];
    for(const part of activeParts){
      const token=node.type==='and'&&part.kind==='agent'?JSON.stringify([part.agent_id,part.dose,part.route,part.schedule,part.role,part.unspecified_other_treatments||false]):null;
      if(token&&seen.has(token)){const kept=seen.get(token);kept.evidence_ids=[...new Set([...kept.evidence_ids,...part.evidence_ids])];kept.raw_labels=[...new Set([...(kept.raw_labels||[kept.raw_label]),part.raw_label])];continue;}
      const kept={...part};parts.push(kept);if(token)seen.set(token,kept);
    }
    const placebo=node.type==='and'&&all.some(part=>part.inactive&&/\bplacebo\b/i.test(part.raw_label||''));
    if(node.type==='and'&&parts.length===1)return {...parts[0],placebo:parts[0].placebo||placebo,label:parts[0].label+(placebo?'(+placebo)':''),...(node.pooled_regimens?{pooled_regimens:true,pooled_context:node.pooled_context,unspecified_other_treatments:true,known:false,simple_concurrent:false,concurrent_agent_ids:[]}:{})};
    const kind={and:'combination',or:'alternative',sequential:'sequential',optional:'optional'}[node.type];
    const selected=node.type==='optional'?parts.slice(0,1):parts;
    const agents=[...new Set(selected.flatMap(part=>part.agent_ids))],classes=[...new Set(selected.flatMap(part=>part.class_ids))];
    const simple=!node.pooled_regimens&&parts.every(part=>!['conditioning','adjuvant','preparation'].includes(part.role))&&node.type==='and'&&parts.length>0&&parts.every(part=>part.simple_concurrent)&&activeParts.reduce((n,part)=>n+part.concurrent_agent_ids.length,0)===agents.length;
    const separator={and:' + ',or:' or ',sequential:' → ',optional:' ± '}[node.type];
    const childType={combination:'and',alternative:'or',sequential:'sequential',optional:'optional'};
    const label=parts.map(part=>part.components?.length&&childType[part.kind]!==node.type?'('+part.label+')':part.label).join(separator)+(placebo?'(+placebo)':'');
    const keys=parts.map(part=>part.key),key=kind+':'+(node.type==='sequential'?keys:keys.sort()).map(value=>JSON.stringify(value)).join('|');
    return {...base,label,key,kind,components:parts,principal_class_ids:[...new Set(parts.filter(part=>!['conditioning','adjuvant','preparation','prior_history','negated','control','structural','unclear'].includes(part.role)).flatMap(part=>part.principal_class_ids||part.class_ids))],known:!node.pooled_regimens&&parts.every(part=>part.known),class_ids:classes,agent_ids:agents,placebo,...(node.unspecified_other_treatments?{unspecified_other_treatments:true}:{}),
      simple_concurrent:simple,concurrent_agent_ids:simple?agents:[],
      ...(node.type==='optional'?{base_component:parts[0],optional_components:parts.slice(1),optional_agent_ids:parts.slice(1).flatMap(part=>part.agent_ids),optional_class_ids:parts.slice(1).flatMap(part=>part.class_ids)}:{})};
  }
  function selectedDefinitionRoot(root,agentIds){
    const leaves=[];const walk=node=>node.type==='agent'?leaves.push(node):node.type==='and'?node.children.forEach(walk):null;walk(root);
    const selected=leaves.filter(node=>agentIds.includes(node.agent_id));
    definitionNeed(selected.length===agentIds.length,'Subset contains an unknown or repeated concurrent agent');
    return selected.length===1?cloneDefinition(selected[0]):{type:'and',raw_label:null,children:cloneDefinition(selected),evidence_ids:[]};
  }
  function reviewedIdentityProjection(previous,expected){
    if(previous&&!previous.children&&expected?.native_leaf_source&&definitionEqual(reviewedIdentityProjection(previous,expected.native_leaf_source),expected.native_leaf_source))return expected;
    if(previous&&!previous.children&&expected&&!expected.children){
      const promoted={...previous};
      for(const key of ['type','name','agent_id','class_id','class_source','normalization','inactive']){
        if(Object.hasOwn(expected,key))promoted[key]=expected[key];else delete promoted[key];
      }
      // Only registry-owned identity/class fields can change. Literal source,
      // node, dose, route, schedule and evidence metadata must still agree.
      if(definitionEqual(promoted,expected))return promoted;
    }
    if(previous?.children&&expected?.children&&previous.type===expected.type&&previous.children.length===expected.children.length)
      return {...previous,children:previous.children.map((node,i)=>reviewedIdentityProjection(node,expected.children[i]))};
    return previous;
  }
  function validateDefinition(definition,options={}){
    definitionNeed(definition&&definition.schema_version===1&&definition.record_kind==='regimen_definition'&&['legacy_label','native_graph'].includes(definition.origin)&&typeof definition.raw_label==='string'&&definitionRoles.has(definition.role)&&stringList(definition.evidence_ids),'Invalid regimen definition');
    definitionNeed(definition.source_binding===null||typeof definition.source_binding==='object'&&!Array.isArray(definition.source_binding),'Invalid regimen source binding');
    if(Object.hasOwn(options,'source_binding'))definitionNeed(definitionEqual(definition.source_binding,options.source_binding),'Regimen source binding differs');
    if(Object.hasOwn(options,'raw_label'))definitionNeed(definition.raw_label===options.raw_label,'Regimen raw label differs');
    const sourceRole=definitionRole(definition.raw_label,'actual_regimen');
    // An explicit native graph may resolve vague ordering wording, but neither
    // origin can promote a prior/negated source label into actual exposure.
    const restricted=definition.origin==='legacy_label'?sourceRole!=='actual_regimen':['prior_history','negated','preparation'].includes(sourceRole);
    definitionNeed(!restricted||definition.role!=='actual_regimen','Prior, negated or ambiguous source wording cannot be an actual regimen');
    if(definition.registry_version!==registry.version){
      const expected=definition.origin==='native_graph'?nativeDefinitionRoot(definition.native_graph):
        legacyDefinitionSource(definition.raw_label,Object.hasOwn(definition,'compiler_version')?definition.compiler_version:1).root;
      if(definition.derivation){
        const source=reviewedIdentityProjection(definition.derivation.source_root,expected);
        definition={...definition,derivation:{...definition.derivation,source_root:source},root:reviewedIdentityProjection(definition.root,selectedDefinitionRoot(expected,definition.derivation.selected_agent_ids))};
      }else definition={...definition,root:reviewedIdentityProjection(definition.root,expected)};
    }
    const active=new Set();let count=0;
    const visit=node=>{
      definitionNeed(node&&typeof node==='object'&&!active.has(node)&&++count<=1024&&['agent','class','unknown','and','or','sequential','optional'].includes(node.type)&&stringList(node.evidence_ids),'Invalid/cyclic regimen definition node');active.add(node);
      if(['and','or','sequential','optional'].includes(node.type)){
        definitionNeed(Array.isArray(node.children)&&node.children.length>=2&&(node.type!=='optional'||node.children.length===2),'Regimen operator needs children');node.children.forEach(visit);
      }else{
        definitionNeed(!Object.hasOwn(node,'children')&&typeof node.raw_label==='string','Regimen leaf cannot have children');
        for(const key of ['dose','route','schedule','reported_class'])definitionNeed(node[key]===null||typeof node[key]==='string','Regimen metadata must stay literal');
        if(node.type==='agent'){
          const cls=leaf(agentNames.get(node.agent_id));
          definitionNeed(agentNames.has(node.agent_id)&&node.name===title(agentNames.get(node.agent_id))&&node.class_id===cls&&node.class_source===(node.class_id?'curated_vocabulary':null),'Unregistered drug or wrong curated drug class');
        }else if(node.type==='class')definitionNeed(!node.agent_id&&(definitions.has(node.class_id)||Object.hasOwn(parentLabels,node.class_id))&&node.class_source==='curated_vocabulary'&&typeof node.name==='string'&&(node.name===classLabel(node.class_id)||simpleDescription(node.name).class_ids.includes(node.class_id)||resolver.resolve(node.name).class_id===node.class_id),'Invalid curated class leaf');
        else definitionNeed(!node.agent_id&&!node.class_id&&!node.class_source,'Unknown treatment cannot claim an agent or curated class');
        if(node.inactive)definitionNeed(node.type==='class'&&['supportive','no-comparator'].includes(node.class_id)&&resolver.resolve(node.raw_label).active_exposure===false,'Only an explicit control can be inactive');
      }
      active.delete(node);
    };
    visit(definition.root);
    if(definition.derivation){
      const d=definition.derivation;definitionNeed(d.kind==='concurrent_agent_subset'&&stringList(d.selected_agent_ids)&&d.selected_agent_ids.length,'Invalid regimen subset derivation');
      visit(d.source_root);definitionNeed(describeNode(d.source_root).simple_concurrent&&definitionEqual(definition.root,selectedDefinitionRoot(d.source_root,d.selected_agent_ids)),'Derived regimen is not an exact concurrent subset');
    }
    if(definition.origin==='native_graph'){
      definitionNeed(definition.native_graph&&definition.native_graph.arm_id===definition.arm_id&&definition.native_graph.label===definition.raw_label&&definitionEqual(definition.evidence_ids,definition.native_graph.evidence_ids),'Native arm provenance differs');
      definitionNeed(definitionEqual(nativeDefinitionRoot(definition.native_graph),definition.derivation?.source_root||definition.root),'Public regimen differs from native graph');
    }else{
      const source=legacyDefinitionSource(definition.raw_label,Object.hasOwn(definition,'compiler_version')?definition.compiler_version:1),root=definition.derivation?.source_root||definition.root;
      definitionNeed(JSON.stringify(stableDefinition(root))===source.root_fingerprint,'Public regimen differs from its source label');
      definitionNeed(definition.placebo===(definition.derivation?false:source.placebo),'Placebo qualifier differs from its source label');
    }
    return cloneDefinition({...definition,registry_version:registry.version});
  }
  function rematerializeDefinition(definition,options={}){
    const previous=validateDefinition(definition,options);
    if(previous.origin!=='legacy_label'||previous.compiler_version===LEGACY_COMPILER_VERSION)return previous;
    let current=definitionFromLabel(previous.raw_label,{source_binding:previous.source_binding,role:previous.role});
    if(previous.derivation)current=subsetDefinition(current,previous.derivation.selected_agent_ids);
    if(previous.presentation_source_review)current.presentation_source_review=cloneDefinition(previous.presentation_source_review);
    return validateDefinition(current,options);
  }
  function describeDefinition(definition,options={}){
    const value=validateDefinition(definition,options),description=describeNode(value.root);
    if(value.role!=='actual_regimen')return {label:value.raw_label,key:'context:'+norm(value.raw_label),kind:'context',known:false,components:[],class_ids:[],agent_ids:[],simple_concurrent:false,concurrent_agent_ids:[],mentioned_agent_ids:description.agent_ids,definition:value};
    return {...description,...(value.placebo?{label:description.label+'(+placebo)',placebo:true}:{}),definition:value};
  }
  function subsetDefinition(definition,agentIds){
    const value=validateDefinition(definition),d=describeDefinition(value);
    definitionNeed(value.role==='actual_regimen'&&d.simple_concurrent&&stringList(agentIds)&&agentIds.length&&agentIds.every(id=>d.concurrent_agent_ids.includes(id)),'Subset requires exact known concurrent drugs');
    const source=value.derivation?.source_root||value.root;
    value.root=selectedDefinitionRoot(source,agentIds);value.derivation={kind:'concurrent_agent_subset',source_root:cloneDefinition(source),selected_agent_ids:[...agentIds]};value.placebo=false;
    return validateDefinition(value);
  }
  function memberships(label){
    const d=typeof label==='object'&&Array.isArray(label.class_ids)?label:describe(label),out=new Set();
    if(d.kind==='context'||(!d.class_ids.length&&!d.agent_ids.length&&d.kind!=='alternative'))out.add('other');
    // OR records are searchable under their explicit constituents, without
    // changing their alternative kind into concurrent administration or an add-on.
    const classes=[...new Set(d.class_ids.flatMap(id=>id==='pd1-lag3'?[id,'pd1','lag3']:id==='pd1-tim3'?[id,'pd1']:[id]))];
    if(d.kind==='alternative')out.add('alternatives');
    if(d.kind==='combination')out.add('combinations');
    for(const id of classes){
      out.add(id);
      if(immuneClasses.has(id))out.add('immune');
      if(iciClasses.has(id))out.add('ici');
      if(id==='immunotherapy')out.add('other-immunotherapy');
      if(targetedClasses.has(id))out.add('targeted');
      if(id==='supportive'||id==='no-comparator')out.add('controls');
      if(d.kind==='combination')out.add(id+'-combinations');
      if(d.kind==='alternative')out.add(id+'-alternatives');
      if(!d.agent_ids.length&&d.kind!=='combination'&&d.kind!=='alternative')out.add(id+'-unspecified');
    }
    for(const id of d.agent_ids){out.add('agent:'+id);if(d.kind==='combination')out.add('agent:'+id+':combinations');}
    return [...out];
  }
  function matchesClass(label,id){return memberships(label).includes(String(id||'').replace(/^treatment-class:/,''));}
  function nodeLabel(id){
    if(parentLabels[id])return parentLabels[id];
    if(definitions.has(id))return definitions.get(id).label;
    if(id.startsWith('agent:')){const parts=id.split(':');return title(agentNames.get(parts[1])||parts[1])+(parts[2]==='combinations'?' with other treatments':'');}
    if(id.endsWith('-combinations'))return (definitions.get(id.slice(0,-13))?.label||id.slice(0,-13))+' with other treatments';
    if(id.endsWith('-alternatives'))return 'Alternative '+(definitions.get(id.slice(0,-13))?.label||id.slice(0,-13));
    if(id.endsWith('-unspecified'))return 'Unspecified '+(definitions.get(id.slice(0,-12))?.label||parentLabels[id.slice(0,-12)]||id.slice(0,-12));
    return definitions.get(id)?.label||id;
  }
  function validClass(id){
    if(definitions.has(id)||Object.hasOwn(parentLabels,id))return true;
    if(id.startsWith('agent:'))return agentNames.has(id.split(':')[1])&&(/^agent:[^:]+(?::combinations)?$/).test(id);
    return ['-combinations','-alternatives','-unspecified'].some(suffix=>id.endsWith(suffix)&&(definitions.has(id.slice(0,-suffix.length))||Object.hasOwn(parentLabels,id.slice(0,-suffix.length))));
  }
  const classValue=id=>validClass(id)?'treatment-class:'+id:'';
  const classId=value=>typeof value==='string'&&value.startsWith('treatment-class:')&&validClass(value.slice(16))?value.slice(16):'';
  function searchText(label){
    const d=describe(label),names=d.agent_ids.flatMap(id=>canonicalAgents.find(row=>row[0]===id)?.[2]||[]);
    return [...new Set([d.label,...names,...d.class_ids.map(classLabel)])].join(' ');
  }
  function catalog(){
    const agents=registry.products.map(entry=>({...entry,name:title(entry.label),aliases:[...entry.aliases],type:definitions.get(entry.class_id)?.label||entry.broad_category,memberships:memberships(entry.label)}));
    const named=new Set(canonicalAgents.flatMap(row=>row[2].map(norm)));
    const additional_labels=Object.entries(catalogAliases).flatMap(([class_id,names])=>names.filter(name=>!named.has(norm(name))).map(name=>({name,class_id,type:definitions.get(class_id).label})));
    return {registry_version:registry.version,agents,additional_labels,groups:[...definitions.values()].map(row=>({...row}))};
  }
  function optionTree(entries){
    const input=(entries instanceof Map?[...entries]:entries||[]).map(row=>Array.isArray(row)?{value:row[0],label:row[1]}:row).filter(row=>row&&row.value!==undefined&&typeof row.label==='string');
    const items=input.map(row=>({...row,description:describe(row.definition||row.label)}));
    const output=[],emitted=new Set();
    const node=(id,depth)=>{const value=classValue(id);if(value&&!emitted.has(value)){output.push({value,label:nodeLabel(id),depth,class_id:id,search_text:searchText(id.startsWith('agent:')?agentNames.get(id.split(':')[1]):nodeLabel(id))});emitted.add(value);}};
    const redundant=(d,branch)=>{
      if(d.placebo||d.single_arm_trial||['optional','context','combination','alternative'].includes(d.kind))return false;
      if(d.kind==='agent'&&d.known&&!d.unspecified_other_treatments&&branch==='agent:'+d.agent_id)return true;
      return d.kind==='class'&&d.class_ids.length===1&&['class:'+d.class_ids[0],'class:'+d.class_ids[0]+':with-other','class:'+d.class_ids[0]+':'+d.class_ids[0]+'-unspecified'].includes(d.key);
    };
    const leaves=(list,depth,branch)=>{for(const row of [...list].sort((a,b)=>a.description.label.localeCompare(b.description.label))){
      const unique=branch+'|'+row.value;if(emitted.has(unique))continue;
      output.push({value:row.value,label:row.description.label,depth,class_id:branch,search_text:searchText(row.definition||row.label),hidden:redundant(row.description,branch)});emitted.add(unique);
    }};
    const top=[
      ['immune',['ici-unspecified','ctla4','pd1','pdl1','pd1-pdl1-unspecified','lag3','pd1-lag3','pd1-tim3','ici-other']],
      ['other-immunotherapy',['immunotherapy']],
      ['cytokines',['cytokines']],['vaccines',['vaccines']],['cell-therapies',['cell-therapies']],['oncolytic-viruses',['oncolytic-viruses']],
      ['targeted',['braf','mek','braf-mek-unspecified','other-targeted']],['chemotherapy',['chemotherapy']],['endocrine',['endocrine']],
      ['radiotherapy',['radiotherapy']],['surgery',['surgery']],['controls',['supportive','no-comparator']],['alternatives',['alternatives']],['other',['other']]
    ];
    for(const[root,children]of top){
      if(!items.some(row=>memberships(row.description).includes(root)))continue;node(root,0);
      for(const cls of children){
        const chosen=items.filter(row=>memberships(row.description).includes(cls));if(!chosen.length)continue;
        const direct=root===cls||cls==='ici-unspecified'||root==='other-immunotherapy';
        const depth=direct?0:1;if(!direct)node(cls,depth);
        if(cls==='other'||cls==='alternatives'){leaves(chosen,depth+1,cls);continue;}
        const unclassified=chosen.filter(row=>!row.description.agent_ids.length);leaves(unclassified,depth+1,cls);
        const agents=[...new Set(chosen.flatMap(row=>row.description.agent_ids))].filter(id=>leaf(agentNames.get(id))===cls).sort((a,b)=>agentNames.get(a).localeCompare(agentNames.get(b)));
        for(const id of agents){
          node('agent:'+id,depth+1);
          leaves(chosen.filter(row=>row.description.agent_ids.includes(id)),depth+2,'agent:'+id);
        }
      }
    }
    return output;
  }
  return Object.freeze({registry_version:registry.version,resolver,classify,groups,classValue,classId,describe,memberships,matchesClass,optionTree,searchText,catalog,
    definitionFromLabel,definitionFromNative,validateDefinition,rematerializeDefinition,describeDefinition,subsetDefinition});
});
