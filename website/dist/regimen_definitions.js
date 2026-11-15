/* One source-bound regimen representation for saved exports, search and tables.
 * Legacy labels are interpreted once. Native structured graphs remain intact. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./treatment_groups.js'),require('./regimen_source_rules.js'));
  else root.RegimenDefinitions=factory(root.TreatmentGroups,root.RegimenSourceRules);
})(typeof globalThis==='undefined'?this:globalThis,function(groups,rules){
  'use strict';
  const resolved=new WeakMap(),descriptions=new WeakMap(),ownedSnapshots=new WeakSet(),immutableFingerprints=new WeakMap();
  const need=(ok,message)=>{if(!ok)throw new Error(message);};
  function stable(value){
    if(Array.isArray(value))return value.map(stable);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
    return value;
  }
  function fingerprint(value){
    if(value&&typeof value==='object'&&ownedSnapshots.has(value))return immutableFingerprints.get(value);
    return JSON.stringify(stable(value));
  }
  function freeze(value){
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}
    return value;
  }
  function snapshot(value){
    const copy=JSON.parse(JSON.stringify(value)),signature=fingerprint(copy);
    freeze(copy);ownedSnapshots.add(copy);immutableFingerprints.set(copy,signature);return copy;
  }
  const text=(value)=>typeof value==='string'?value:typeof value?.text==='string'?value.text:typeof value?.value==='string'?value.value:typeof value?.raw_text==='string'?value.raw_text:'';
  function binding(comparison,side){
    return {comparison_id:comparison.comparison_id||null,role:side,scope:comparison.scope||null};
  }
  function ownedLabel(comparison,side){
    const labels=[...new Set((comparison[side+'_arms']||[]).map((arm)=>text(arm.source_arm?.label)||text(arm.label)||text(arm.compact_label)).filter(Boolean))];
    return labels.length>1?labels.map(label=>'('+label+')').join(' or '):labels[0]||'';
  }
  function label(comparison,side,applyRule=true){
    const correction=applyRule?rules.lookup(comparison):null;
    if(side==='outcome')return correction?.outcome_label??text(comparison.outcome_arm_label);
    if(correction)return correction[side+'_label'];
    if(side==='comparator'&&(comparison.kind==='single_arm'||comparison.comparator_key==='__single_arm__'))return 'No comparator';
    return ownedLabel(comparison,side)||text(comparison[side+'_label'])||
      (side==='intervention'?text(comparison.additional_intervention_label):'')||
      text(comparison['compact_display_'+side+'_label'])||
      (comparison[side+'_drug_ids']||comparison[side==='intervention'?'additional_intervention_drug_ids':'comparator_drug_ids']||[]).join(' + ')||
      (side==='comparator'&&/^(?:placebo|observation|standard_care|best_supportive_care|supportive_care)$/i.test(comparison.comparator_key||'')?comparison.comparator_key.replace(/_/g,' '):'');
  }
  function assertValid(def,expected,raw,native){
    if(ownedSnapshots.has(def)){
      need(fingerprint(def.source_binding)===fingerprint(expected),'Regimen source binding differs');
      if(raw!==undefined)need(def.raw_label===raw,'Regimen raw label differs');
      if(native)need(def.origin==='native_graph'&&fingerprint(def.native_graph)===fingerprint(native),'Stored regimen differs from current native arm graph');
      return def;
    }
    const result=groups.rematerializeDefinition(def,{source_binding:expected,...(raw===undefined?{}:{raw_label:raw})});
    if(result===false||result?.valid===false||Array.isArray(result)&&result.length)throw new Error('Invalid or foreign source-bound regimen definition: '+JSON.stringify(result));
    const checked=result?.record_kind==='regimen_definition'?result:def;
    if(native)need(checked.origin==='native_graph'&&fingerprint(checked.native_graph)===fingerprint(native),'Stored regimen differs from current native arm graph');
    return snapshot(checked);
  }
  function resolve(comparison,side){
    if(!['comparator','intervention','outcome'].includes(side))throw new Error('Unknown regimen side');
    if(side==='outcome')need(!!comparison.outcome_arm_id,'Outcome regimen requires its explicit outcome arm');
    const expected=binding(comparison,side),stored=comparison[side+'_regimen'];
    const native=comparison[side+'_native_regimen'],reviewed=rules.lookup(comparison),correction=side==='outcome'&&!reviewed?.outcome_label?null:reviewed;
    const expectedNative=native&&!correction?native:null;
    if(expectedNative&&comparison[side+'_arm_id'])need(expectedNative.arm_id===comparison[side+'_arm_id'],'Native regimen differs from the selected arm identity');
    const raw=expectedNative?expectedNative.label:label(comparison,side);
    if(stored){
      const old=resolved.get(comparison)?.[side];
      const signature=JSON.stringify([fingerprint(expected),raw,fingerprint(stored),fingerprint(expectedNative)]);
      if(old?.stored===stored&&old.signature===signature)return old.definition;
      let def;
      if(correction?.previous_labels&&Object.hasOwn(correction.previous_labels,side)&&stored.raw_label!==raw){
        const previousRaw=correction.previous_labels[side];
        need(label(comparison,side,false)===previousRaw,'Reviewed regimen predecessor differs from the original source label');
        const previous=assertValid(stored,expected,previousRaw,native||null);
        need(previous.origin==='legacy_label'&&previous.role===(correction.previous_roles?.[side]||'actual_regimen')&&!previous.derivation,'Reviewed regimen predecessor is not the approved legacy definition');
        def=groups.definitionFromLabel(raw,{source_binding:expected,role:correction.reviewed_roles?.[side]||previous.role});
        def.presentation_source_review=JSON.parse(JSON.stringify(correction));
        def=assertValid(def,expected,raw,null);
      }else def=assertValid(stored,expected,raw,expectedNative);
      resolved.set(comparison,{...resolved.get(comparison),[side]:{stored,signature,definition:def}});
      return def;
    }
    const signature=JSON.stringify([fingerprint(expected),raw,fingerprint(expectedNative),fingerprint(correction)]);
    const old=resolved.get(comparison)?.[side];
    if(old?.signature===signature)return old.definition;
    let def=expectedNative?groups.definitionFromNative(expectedNative,{source_binding:expected}):groups.definitionFromLabel(raw,{source_binding:expected});
    if(correction)def.presentation_source_review={...correction};
    def=assertValid(def,expected,raw,expectedNative);
    resolved.set(comparison,{...resolved.get(comparison),[side]:{signature,definition:def}});
    return def;
  }
  function describe(def){
    const signature=fingerprint(def),old=descriptions.get(def);
    if(old?.signature===signature)return old.description;
    const safe=ownedSnapshots.has(def)?def:snapshot(groups.rematerializeDefinition(def));
    const description=groups.describeDefinition(safe);description.definition=safe;freeze(description);
    descriptions.set(def,{signature,description});return description;
  }
  function prepareComparison(comparison,normalizations=null){
    const prepared=normalizations?.registry_version===groups.registry_version?normalizations.comparisons?.[comparison.comparison_id]:null;
    if(normalizations)need(prepared,'Prepared treatment comparison is missing');
    if(prepared){
      need(fingerprint(prepared.scope)===fingerprint(comparison.scope),'Prepared treatment scope differs');
      comparison={...comparison};
      for(const side of ['comparator','intervention','outcome']){
        const role=prepared.roles?.[side];if(!role)continue;
        need(fingerprint(role.source_binding)===fingerprint(binding(comparison,side)),'Prepared treatment binding differs');
        const profile=role.definition||normalizations.definition_profiles?.[role.definition_ref];
        need(profile,'Prepared treatment profile is missing');
        comparison[side+'_regimen']={...profile,source_binding:role.source_binding};
      }
    }
    return {...comparison,comparator_regimen:resolve(comparison,'comparator'),intervention_regimen:resolve(comparison,'intervention'),
      ...(comparison.outcome_arm_id?{outcome_regimen:resolve(comparison,'outcome')}:{})};
  }
  function prepareStudies(studies,{normalizations=null,clinical_content_sha256=null}={}){
    if(normalizations)need(normalizations.registry_version===groups.registry_version,'Prepared treatment registry is stale');
    if(normalizations&&clinical_content_sha256)need(normalizations.clinical_content_sha256===clinical_content_sha256,'Prepared treatments belong to a different clinical snapshot');
    return studies.map(study=>({...study,comparisons:(study.comparisons||[]).map(comparison=>prepareComparison(comparison,normalizations)),
      ...(study.single_arm_regimens?{single_arm_regimens:study.single_arm_regimens.map(arm=>prepareComparison({...arm,kind:'single_arm',comparator_key:'__single_arm__',comparator_label:'No comparator'},normalizations))}:{})}));
  }
  return Object.freeze({binding,resolve,describe,prepareComparison,prepareStudies});
});
