/* Finite presentation rules; no numerical values, scopes, IDs or native graphs change.
 * 23402397, verified primary XML SHA0622ddd008de3a9b52fb5c706fb82425defee3e7728c3f660c28a2ae51205b7f:
 * b00014 defines A=FM+DTIC, B=FM+DTIC+IFN, C=DTIC, D=DTIC+IFN.
 * b00018 defines factorial pooled contrasts; Table2 b00032 and results b00034/b00036
 * establish FM A+B relative to C+D, and IFN B+D relative to A+C. The abstract's
 * planned comparison order is not an instruction to reverse an HR. A+B means a
 * pool of randomized arms, never two concurrent regimens or a new pairwise test.
 * https://pmc.ncbi.nlm.nih.gov/articles/PMC3598549/
 * 37730278, verified primary XML SHA709b57e2cafe6fdac4caa11e2148dc95df76dcf08e81a1852f2b9e1a01e65c2a:
 * b00015 defines upfront anti-PD1 as nivo OR Pb; b00028 reports these separate
 * treatment options. BRAF/MEKi is dabrafenib+trametinib. This observational
 * cohort comparison is not an add-on, and later recurrence treatments differ.
 * https://pmc.ncbi.nlm.nih.gov/articles/PMC10510881/
 * 22124101, original BEAM primary report, Study Design and Statistical Analysis:
 * CPB=carboplatin+paclitaxel+bevacizumab, CP=the same backbone+placebo;
 * HR is CPB relative to CP. Early/later OS cutoffs and subgroups remain separate.
 * https://pmc.ncbi.nlm.nih.gov/articles/PMC4669379/
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.RegimenSourceRules=factory();
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const rules=new Map();
  const deepFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;};
  function add(report,source,ids,presentation,version=null,kind='treatment_comparison',guard=null){
    for(const id of ids){
      const key=JSON.stringify([report,source,id]);
      if(rules.has(key))throw new Error('Duplicate source-bound regimen rule');
      rules.set(key,{version,kind,guard,presentation:deepFreeze(JSON.parse(JSON.stringify(presentation)))});
    }
  }
  const factorialReport='report-020c0a6128b8320e3aeaae9b';
  const factorialUrl='https://pmc.ncbi.nlm.nih.gov/articles/PMC3598549/';
  const fm={factorial_component:'fotemustine',source_regimen_pools:{reference:[['dacarbazine'],['dacarbazine','interferon_alfa_2b']],intervention:[['fotemustine','dacarbazine'],['fotemustine','dacarbazine','interferon_alfa_2b']]},comparator_label:'Dacarbazine ± interferon alfa-2b',intervention_label:'Fotemustine',
    is_add_on:true,source_url:factorialUrl,
    note:'Pooled factorial fotemustine main effect: arms A+B versus C+D. IFN status varies on both sides. Original result direction, population, model and cutoff remain unchanged.'};
  const ifn={factorial_component:'interferon_alfa_2b',source_regimen_pools:{reference:[['fotemustine','dacarbazine'],['dacarbazine']],intervention:[['fotemustine','dacarbazine','interferon_alfa_2b'],['dacarbazine','interferon_alfa_2b']]},comparator_label:'Dacarbazine ± fotemustine',intervention_label:'Interferon alfa-2b',
    is_add_on:true,source_url:factorialUrl,
    note:'Pooled factorial interferon main effect: arms B+D versus A+C. Fotemustine status varies on both sides. Original result direction, population, model and cutoff remain unchanged.'};
  const r2='CE-c57c61a8ae62dec9915cb3b6-C-';
  const r2Source='a79d3b7664bf7919abe9213186edf6da784754a58ef5dabbb9fde8f3d665f45e';
  add(factorialReport,r2Source,['1e8549ee2f019c05','a87692a323ac9511','ddfab09e227b2092'].map(id=>r2+id),fm);
  add(factorialReport,r2Source,['34b11b7f42251ea5','2b8dde63a3fd4182','136fad156c7edd09'].map(id=>r2+id),ifn);
  const r3='CE-5f915ff1bd02afd837a3ca1b-C-';
  const r3Source='9b84eef27674fbbe4ab75a2508e14d4adc803b6873dc4da07a8b7a916ebeb09d';
  add(factorialReport,r3Source,['b6f22e78ce0517e1','7277d79bedc8deb7','ccd14b381edadb35','8c65f323cc163b79'].map(id=>r3+id),fm);
  add(factorialReport,r3Source,['8a1a9cf32c12b594','b2166f08eaf6a588','217e18e41b5afe7c','9e4e6ea04ac933c3'].map(id=>r3+id),ifn);
  const adoregReport='report-8f9c9565ea8feed6d81f0128';
  const adoreg={comparator_label:'Nivolumab or pembrolizumab',intervention_label:'Dabrafenib + trametinib',
    is_add_on:false,source_url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC10510881/',
    note:'Upfront adjuvant treatment cohorts: alternative anti-PD1 monotherapies versus the BRAF/MEK combination. Not nivolumab+pembrolizumab or targeted therapy added to anti-PD1. Each original population, including the relapsed-patient subset, and every reported estimate remain unchanged.'};
  add(adoregReport,'d1c60324e2f953caae0192d8e6378ab149c0f031bdb3e78f7d98ff0e778b66b3',
    ['CE-530aa66df1d30be83d3594d6-C-5f4e7668d5796e44'],adoreg);
  add(adoregReport,'a8e20d7fcca76f40af62be41c157c9543faccc93428ee9dc945012ada63a5505',
    ['CE-a48d6a5186c2bc3f22c693cf-C-d0e701e0e97923e4','CE-a48d6a5186c2bc3f22c693cf-C-11461ea98a1629aa'],adoreg);
  const beamReport='report-89456f77b6839e3280989e69';
  const beam={comparator_label:'Carboplatin + paclitaxel (+ placebo)',intervention_label:'Bevacizumab',
    is_add_on:true,source_url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC4669379/',
    note:'BEAM compares bevacizumab added to the common carboplatin-paclitaxel backbone against that backbone with placebo. HR direction is CPB relative to CP. Original cutoff, subgroup, result IDs and validation flags remain unchanged.'};
  add(beamReport,'950e1d7f9ed044b10bcb051a55a4adb1698c8317de70fdd85e97cf42f815db61',
    ['CMP-d50228f5cc37dbb01b101d18','CMP-7342ac1d41f17772435f0829','CMP-f44c0a4a163858a6bc3bab13',
      'CMP-e9de104deab2d072d5b64678','CMP-dd3048dfbbb87199f99e9a77','CMP-d2143558baf0f280f0a19a2a'],beam,
    'a74da8859aa981a66390d3063802a4453e885b37adf09ab8b1032295ff7b2c1f');
  add(beamReport,'2cd2546ca19b1b2a4ce83d29cc3e62c30d6dbf269f8816193655e25712cf601d',
    ['CMP-fae7935f9685e1561a1531e6','CMP-0988661533c6fbfaf5849034','CMP-22922d949a0d4fb54b7f1ec1',
      // Explicit CPB-relative-to-CP treatment effects within elevated-LDH patients,
      // not LDH biomarker contrasts; PFS/OS populations and cutoff gaps stay exact.
      'CMP-723b846f05249758bae7dae9','CMP-5aa8765368f8dd4385e602cd'],beam,
    'f91fcc91e141d8a8d828a8d82bf763f41dcaabd42ec9301f38374f7a50c2a2bd');
  // Exact EORTC18951 source-defined arms; generic negative phrases remain protected.
  const eortc18951=[{"report":"report-810650fbf4cc06b9e404ee73","source":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe","id":"CE-ceb240abd539cc4cda283b98-C-973c9d80c76c8531","kind":"single_arm","guard":{"kind":"single_arm","scope":{"population_id":"CE-ceb240abd539cc4cda283b98-r2-189c2a4cde4e6dba497e624b50e3:p1","record_kind":"canonical_review_scope","report_id":"report-810650fbf4cc06b9e404ee73","review_binding_sha256":"ceb240abd539cc4cda283b98df1491cfcd5d95d45e673bb1e0e459d4f1a82358","review_stage":"R2","source_input_sha256":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe"},"comparator_label":null,"intervention_label":null,"additional_intervention_label":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","outcome_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aA","outcome_arm_label":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","comparator_arm_id":null,"intervention_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aA","result_ids":["CE-ceb240abd539cc4cda283b98-F-e3bb00310e329b95","CE-ceb240abd539cc4cda283b98-F-1d6da788189d4fad"]},"presentation":{"comparator_label":"No comparator","intervention_label":"Dacarbazine + Cisplatin + Interferon alfa-2b","is_add_on":false,"source_url":"https://pubmed.ncbi.nlm.nih.gov/16170182/","source_primary_regimen":"Dacarbazine, cisplatin and interferon-alfa-2b with or without interleukin-2; EORTC18951","previous_labels":{"comparator":"No comparator","intervention":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","outcome":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2"},"previous_roles":{"comparator":"actual_regimen","intervention":"negated","outcome":"negated"},"reviewed_roles":{"comparator":"actual_regimen","intervention":"actual_regimen","outcome":"actual_regimen"},"source_regimen_pools":{"reference":[["dacarbazine","cisplatin","interferon_alfa_2b"]],"intervention":[["dacarbazine","cisplatin","interferon_alfa_2b","aldesleukin"]]},"excluded_reference_agents":["aldesleukin"],"note":"Exact source-bound EORTC18951 arms: ArmA contains the three-drug dacarbazine/cisplatin/interferon-alfa-2b backbone and excludesIL2; ArmB addsIL2. Absence ofIL2 is not a fourth treatment and does not negate the actually administered backbone. Original source labels, populations, numeric values, models and validation flags remain unchanged.","outcome_label":"Dacarbazine + Cisplatin + Interferon alfa-2b"}},{"report":"report-810650fbf4cc06b9e404ee73","source":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe","id":"CE-ceb240abd539cc4cda283b98-C-190520bf68469e78","kind":"single_arm","guard":{"kind":"single_arm","scope":{"population_id":"CE-ceb240abd539cc4cda283b98-r2-189c2a4cde4e6dba497e624b50e3:p1","record_kind":"canonical_review_scope","report_id":"report-810650fbf4cc06b9e404ee73","review_binding_sha256":"ceb240abd539cc4cda283b98df1491cfcd5d95d45e673bb1e0e459d4f1a82358","review_stage":"R2","source_input_sha256":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe"},"comparator_label":null,"intervention_label":null,"additional_intervention_label":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","outcome_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aB","outcome_arm_label":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","comparator_arm_id":null,"intervention_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aB","result_ids":["CE-ceb240abd539cc4cda283b98-F-76438b2ab7a4fd40","CE-ceb240abd539cc4cda283b98-F-6277a39b89dbdd84"]},"presentation":{"comparator_label":"No comparator","intervention_label":"Dacarbazine + Cisplatin + Interferon alfa-2b + Interleukin-2","is_add_on":false,"source_url":"https://pubmed.ncbi.nlm.nih.gov/16170182/","source_primary_regimen":"Dacarbazine, cisplatin and interferon-alfa-2b with or without interleukin-2; EORTC18951","previous_labels":{"comparator":"No comparator","intervention":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","outcome":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2"},"previous_roles":{"comparator":"actual_regimen","intervention":"actual_regimen","outcome":"actual_regimen"},"reviewed_roles":{"comparator":"actual_regimen","intervention":"actual_regimen","outcome":"actual_regimen"},"source_regimen_pools":{"reference":[["dacarbazine","cisplatin","interferon_alfa_2b"]],"intervention":[["dacarbazine","cisplatin","interferon_alfa_2b","aldesleukin"]]},"excluded_reference_agents":["aldesleukin"],"note":"Exact source-bound EORTC18951 arms: ArmA contains the three-drug dacarbazine/cisplatin/interferon-alfa-2b backbone and excludesIL2; ArmB addsIL2. Absence ofIL2 is not a fourth treatment and does not negate the actually administered backbone. Original source labels, populations, numeric values, models and validation flags remain unchanged.","outcome_label":"Dacarbazine + Cisplatin + Interferon alfa-2b + Interleukin-2"}},{"report":"report-810650fbf4cc06b9e404ee73","source":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe","id":"CE-ceb240abd539cc4cda283b98-C-5c535784b03604f1","kind":"treatment_comparison","guard":{"kind":"treatment_comparison","scope":{"population_id":"CE-ceb240abd539cc4cda283b98-r2-189c2a4cde4e6dba497e624b50e3:p1","record_kind":"canonical_review_scope","report_id":"report-810650fbf4cc06b9e404ee73","review_binding_sha256":"ceb240abd539cc4cda283b98df1491cfcd5d95d45e673bb1e0e459d4f1a82358","review_stage":"R2","source_input_sha256":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe"},"comparator_label":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","intervention_label":null,"additional_intervention_label":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","outcome_arm_id":null,"outcome_arm_label":null,"comparator_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aA","intervention_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aB","result_ids":["CE-ceb240abd539cc4cda283b98-F-bce1f0c276820746"]},"presentation":{"comparator_label":"Dacarbazine + Cisplatin + Interferon alfa-2b","intervention_label":"Interleukin-2","is_add_on":true,"source_url":"https://pubmed.ncbi.nlm.nih.gov/16170182/","source_primary_regimen":"Dacarbazine, cisplatin and interferon-alfa-2b with or without interleukin-2; EORTC18951","previous_labels":{"comparator":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","intervention":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2"},"previous_roles":{"comparator":"negated","intervention":"actual_regimen"},"reviewed_roles":{"comparator":"actual_regimen","intervention":"actual_regimen"},"source_regimen_pools":{"reference":[["dacarbazine","cisplatin","interferon_alfa_2b"]],"intervention":[["dacarbazine","cisplatin","interferon_alfa_2b","aldesleukin"]]},"excluded_reference_agents":["aldesleukin"],"note":"Exact source-bound EORTC18951 arms: ArmA contains the three-drug dacarbazine/cisplatin/interferon-alfa-2b backbone and excludesIL2; ArmB addsIL2. Absence ofIL2 is not a fourth treatment and does not negate the actually administered backbone. Original source labels, populations, numeric values, models and validation flags remain unchanged."}},{"report":"report-810650fbf4cc06b9e404ee73","source":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe","id":"CE-ceb240abd539cc4cda283b98-C-e52aa1778accc022","kind":"single_arm","guard":{"kind":"single_arm","scope":{"population_id":"CE-ceb240abd539cc4cda283b98-r2-189c2a4cde4e6dba497e624b50e3:p1","record_kind":"canonical_review_scope","report_id":"report-810650fbf4cc06b9e404ee73","review_binding_sha256":"ceb240abd539cc4cda283b98df1491cfcd5d95d45e673bb1e0e459d4f1a82358","review_stage":"R2","source_input_sha256":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe"},"comparator_label":null,"intervention_label":null,"additional_intervention_label":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","outcome_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aA","outcome_arm_label":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","comparator_arm_id":null,"intervention_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aA","result_ids":["CE-ceb240abd539cc4cda283b98-F-e483cee07c626794"]},"presentation":{"comparator_label":"No comparator","intervention_label":"Dacarbazine + Cisplatin + Interferon alfa-2b","is_add_on":false,"source_url":"https://pubmed.ncbi.nlm.nih.gov/16170182/","source_primary_regimen":"Dacarbazine, cisplatin and interferon-alfa-2b with or without interleukin-2; EORTC18951","previous_labels":{"comparator":"No comparator","intervention":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","outcome":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2"},"previous_roles":{"comparator":"actual_regimen","intervention":"negated","outcome":"negated"},"reviewed_roles":{"comparator":"actual_regimen","intervention":"actual_regimen","outcome":"actual_regimen"},"source_regimen_pools":{"reference":[["dacarbazine","cisplatin","interferon_alfa_2b"]],"intervention":[["dacarbazine","cisplatin","interferon_alfa_2b","aldesleukin"]]},"excluded_reference_agents":["aldesleukin"],"note":"Exact source-bound EORTC18951 arms: ArmA contains the three-drug dacarbazine/cisplatin/interferon-alfa-2b backbone and excludesIL2; ArmB addsIL2. Absence ofIL2 is not a fourth treatment and does not negate the actually administered backbone. Original source labels, populations, numeric values, models and validation flags remain unchanged.","outcome_label":"Dacarbazine + Cisplatin + Interferon alfa-2b"}},{"report":"report-810650fbf4cc06b9e404ee73","source":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe","id":"CE-ceb240abd539cc4cda283b98-C-b7045d9587eecea1","kind":"single_arm","guard":{"kind":"single_arm","scope":{"population_id":"CE-ceb240abd539cc4cda283b98-r2-189c2a4cde4e6dba497e624b50e3:p1","record_kind":"canonical_review_scope","report_id":"report-810650fbf4cc06b9e404ee73","review_binding_sha256":"ceb240abd539cc4cda283b98df1491cfcd5d95d45e673bb1e0e459d4f1a82358","review_stage":"R2","source_input_sha256":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe"},"comparator_label":null,"intervention_label":null,"additional_intervention_label":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","outcome_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aB","outcome_arm_label":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","comparator_arm_id":null,"intervention_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aB","result_ids":["CE-ceb240abd539cc4cda283b98-F-1472785ce1606eea"]},"presentation":{"comparator_label":"No comparator","intervention_label":"Dacarbazine + Cisplatin + Interferon alfa-2b + Interleukin-2","is_add_on":false,"source_url":"https://pubmed.ncbi.nlm.nih.gov/16170182/","source_primary_regimen":"Dacarbazine, cisplatin and interferon-alfa-2b with or without interleukin-2; EORTC18951","previous_labels":{"comparator":"No comparator","intervention":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","outcome":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2"},"previous_roles":{"comparator":"actual_regimen","intervention":"actual_regimen","outcome":"actual_regimen"},"reviewed_roles":{"comparator":"actual_regimen","intervention":"actual_regimen","outcome":"actual_regimen"},"source_regimen_pools":{"reference":[["dacarbazine","cisplatin","interferon_alfa_2b"]],"intervention":[["dacarbazine","cisplatin","interferon_alfa_2b","aldesleukin"]]},"excluded_reference_agents":["aldesleukin"],"note":"Exact source-bound EORTC18951 arms: ArmA contains the three-drug dacarbazine/cisplatin/interferon-alfa-2b backbone and excludesIL2; ArmB addsIL2. Absence ofIL2 is not a fourth treatment and does not negate the actually administered backbone. Original source labels, populations, numeric values, models and validation flags remain unchanged.","outcome_label":"Dacarbazine + Cisplatin + Interferon alfa-2b + Interleukin-2"}},{"report":"report-810650fbf4cc06b9e404ee73","source":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe","id":"CE-ceb240abd539cc4cda283b98-C-c40811b11b8455d9","kind":"single_arm","guard":{"kind":"single_arm","scope":{"population_id":"CE-ceb240abd539cc4cda283b98-r2-189c2a4cde4e6dba497e624b50e3:p1","record_kind":"canonical_review_scope","report_id":"report-810650fbf4cc06b9e404ee73","review_binding_sha256":"ceb240abd539cc4cda283b98df1491cfcd5d95d45e673bb1e0e459d4f1a82358","review_stage":"R2","source_input_sha256":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe"},"comparator_label":null,"intervention_label":null,"additional_intervention_label":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","outcome_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aA","outcome_arm_label":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","comparator_arm_id":null,"intervention_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aA","result_ids":["CE-ceb240abd539cc4cda283b98-F-44af0e58593d7136"]},"presentation":{"comparator_label":"No comparator","intervention_label":"Dacarbazine + Cisplatin + Interferon alfa-2b","is_add_on":false,"source_url":"https://pubmed.ncbi.nlm.nih.gov/16170182/","source_primary_regimen":"Dacarbazine, cisplatin and interferon-alfa-2b with or without interleukin-2; EORTC18951","previous_labels":{"comparator":"No comparator","intervention":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2","outcome":"Arm A: dacarbazine, cisplatin and interferon-alfa-2b without IL-2"},"previous_roles":{"comparator":"actual_regimen","intervention":"negated","outcome":"negated"},"reviewed_roles":{"comparator":"actual_regimen","intervention":"actual_regimen","outcome":"actual_regimen"},"source_regimen_pools":{"reference":[["dacarbazine","cisplatin","interferon_alfa_2b"]],"intervention":[["dacarbazine","cisplatin","interferon_alfa_2b","aldesleukin"]]},"excluded_reference_agents":["aldesleukin"],"note":"Exact source-bound EORTC18951 arms: ArmA contains the three-drug dacarbazine/cisplatin/interferon-alfa-2b backbone and excludesIL2; ArmB addsIL2. Absence ofIL2 is not a fourth treatment and does not negate the actually administered backbone. Original source labels, populations, numeric values, models and validation flags remain unchanged.","outcome_label":"Dacarbazine + Cisplatin + Interferon alfa-2b"}},{"report":"report-810650fbf4cc06b9e404ee73","source":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe","id":"CE-ceb240abd539cc4cda283b98-C-7f013a28d1000fe5","kind":"single_arm","guard":{"kind":"single_arm","scope":{"population_id":"CE-ceb240abd539cc4cda283b98-r2-189c2a4cde4e6dba497e624b50e3:p1","record_kind":"canonical_review_scope","report_id":"report-810650fbf4cc06b9e404ee73","review_binding_sha256":"ceb240abd539cc4cda283b98df1491cfcd5d95d45e673bb1e0e459d4f1a82358","review_stage":"R2","source_input_sha256":"36b147aadf3f3f5d11ff91f2e37a2f39084a2bd461b5051de8c2da93ebf489fe"},"comparator_label":null,"intervention_label":null,"additional_intervention_label":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","outcome_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aB","outcome_arm_label":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","comparator_arm_id":null,"intervention_arm_id":"r2-189c2a4cde4e6dba497e624b50e3:aB","result_ids":["CE-ceb240abd539cc4cda283b98-F-0ccb6ce5d3835a4a"]},"presentation":{"comparator_label":"No comparator","intervention_label":"Dacarbazine + Cisplatin + Interferon alfa-2b + Interleukin-2","is_add_on":false,"source_url":"https://pubmed.ncbi.nlm.nih.gov/16170182/","source_primary_regimen":"Dacarbazine, cisplatin and interferon-alfa-2b with or without interleukin-2; EORTC18951","previous_labels":{"comparator":"No comparator","intervention":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2","outcome":"Arm B: dacarbazine, cisplatin and interferon-alfa-2b with high-dose intravenous IL-2"},"previous_roles":{"comparator":"actual_regimen","intervention":"actual_regimen","outcome":"actual_regimen"},"reviewed_roles":{"comparator":"actual_regimen","intervention":"actual_regimen","outcome":"actual_regimen"},"source_regimen_pools":{"reference":[["dacarbazine","cisplatin","interferon_alfa_2b"]],"intervention":[["dacarbazine","cisplatin","interferon_alfa_2b","aldesleukin"]]},"excluded_reference_agents":["aldesleukin"],"note":"Exact source-bound EORTC18951 arms: ArmA contains the three-drug dacarbazine/cisplatin/interferon-alfa-2b backbone and excludesIL2; ArmB addsIL2. Absence ofIL2 is not a fourth treatment and does not negate the actually administered backbone. Original source labels, populations, numeric values, models and validation flags remain unchanged.","outcome_label":"Dacarbazine + Cisplatin + Interferon alfa-2b + Interleukin-2"}}];
  for(const entry of eortc18951)add(entry.report,entry.source,[entry.id],entry.presentation,null,entry.kind,entry.guard);
  // CheckMate064: the reported HR is preserved. This separate primary-source
  // presentation resolves its reference arm; it never rewrites the native gap.
  const cmPrefix='r2-c6143374b91e065215d43d7e6aa4:';
  const cmReview='2bf346e138415b8489344df09a8beefbe9fe6b84a56435364b5dafce47774077';
  const cmComparison='CE-2bf346e138415b8489344df0-C-6c9d75389541a6f9';
  const cmResult='CE-2bf346e138415b8489344df0-F-99f7cc534d9a4961';
  const cmDirection={comparator_label:'Ipilimumab → Nivolumab',intervention_label:'Nivolumab → Ipilimumab',
    is_add_on:false,direction_verified:true,expected_result_id:cmResult,
    source_url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC5474305/',
    primary_raw_sha256:'b45a938f3e6b607e65dca688f789366fa290f3025e8202dd08ec8e23ffee35af',
    primary_source_blocks:['b00043'],previous_labels:{comparator:'',intervention:''},
    note:'Separate source review: CheckMate064 Results/Figure4 reports the unadjusted OS HR0.48; the adjusted analysis is described as consistent with the primary analysis in favoring nivolumab followed by ipilimumab relative to the reverse sequence. Both arms have common later nivolumab continuation. Labels identify the induction sequences. HR, CIs, native unresolved-direction annotation, cutoff gap and pooling flags remain unchanged.'};
  Object.freeze(cmDirection.primary_source_blocks);Object.freeze(cmDirection.previous_labels);
  add('report-eb4e1504cd454b6a073ef0af','905bc58a72439c6781c0b6efc0da3dcfccc62c810a8897320cbe0f45cf6757d4',
    [cmComparison],cmDirection,null,'unresolved_comparator');
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
  const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  function factorialArmPresentation(comparison){
    const scope=comparison.scope||{};
    if(scope.report_id!==factorialReport||!['single_arm','other','unresolved_comparator'].includes(comparison.kind))return null;
    const raw=comparison.additional_intervention_label;
    const arms={
      'r3-ff0328f999cbf3d0ea6220697c18:armA':{raw:'FM+DTIC',label:'Fotemustine + Dacarbazine',agents:['fotemustine','dacarbazine']},
      'r3-ff0328f999cbf3d0ea6220697c18:armB':{raw:'FM+DTIC+IFN',label:'Fotemustine + Dacarbazine + Interferon alfa-2b',agents:['fotemustine','dacarbazine','interferon_alfa_2b']},
      'r3-ff0328f999cbf3d0ea6220697c18:armC':{raw:'DTIC',label:'Dacarbazine',agents:['dacarbazine']},
      'r3-ff0328f999cbf3d0ea6220697c18:armD':{raw:'DTIC+IFN',label:'Dacarbazine + Interferon alfa-2b',agents:['dacarbazine','interferon_alfa_2b']},
      'r3-8c1c4b294e2e6ece3e14a2861596:B':{raw:'B: fotemustine plus dacarbazine plus IFN-α2b',label:'Fotemustine + Dacarbazine + Interferon alfa-2b',agents:['fotemustine','dacarbazine','interferon_alfa_2b']},
      'r2-82408fae13c12bead434686e7e67:b':{raw:'B: fotemustine plus dacarbazine plus IFN-α2b',label:'Fotemustine + Dacarbazine + Interferon alfa-2b',agents:['fotemustine','dacarbazine','interferon_alfa_2b']}
    };
    const arm=arms[comparison.intervention_arm_id];
    const r2=scope.source_input_sha256===r2Source&&scope.review_stage==='R2'&&scope.review_binding_sha256==='c57c61a8ae62dec9915cb3b63b4f14d3a6e9bb09c2fb2744fbf0cc3fec7e177c';
    const r3=scope.source_input_sha256===r3Source&&scope.review_stage==='R3'&&scope.review_binding_sha256==='5f915ff1bd02afd837a3ca1b7c5e99d88b72882523691f1a27fda113d6853b08';
    if(!arm||!(r2||r3)||raw!==arm.raw||comparison.comparator_label!=null||comparison.comparator_arm_id!==null||
      comparison.outcome_arm_id!==comparison.intervention_arm_id||comparison.outcome_arm_label!==arm.raw||comparison.result_relation!=='arm_specific')return null;
    return deepFreeze({comparator_label:'No comparator',intervention_label:arm.label,outcome_label:arm.label,is_add_on:false,
      source_url:factorialUrl,source_regimen_pools:{intervention:[arm.agents]},
      previous_labels:{comparator:comparison.kind==='single_arm'?'No comparator':'',intervention:arm.raw,outcome:arm.raw},
      note:'The exact source-defined factorial arm retains its administered agents. Other arms/pools, original numerical outcomes and validation state remain separate.'});
  }
  function lookup(comparison){
    if(!comparison)return null;
    const scope=comparison.scope||{};
    const rule=rules.get(JSON.stringify([scope.report_id,scope.source_input_sha256,comparison.comparison_id]));
    if(!rule)return factorialArmPresentation(comparison);
    if((comparison.kind!==rule.kind&&!(rule.presentation.factorial_component&&comparison.kind==='arm_specific_result'))||(rule.version&&scope.source_version_sha256!==rule.version))return null;
    if(rule.guard&&!Object.entries(rule.guard).every(([key,value])=>same(comparison[key]??null,value)))return null;
    if(rule.presentation.factorial_component&&comparison.kind==='arm_specific_result'){
      const fm=rule.presentation.factorial_component==='fotemustine',r2=scope.review_stage==='R2';
      const prefix=r2?'r2-82408fae13c12bead434686e7e67:':'r3-8c1c4b294e2e6ece3e14a2861596:';
      const control=r2?(fm?'C+D: groups without fotemustine':'A+C: groups without IFN-α2b'):(fm?'Groups without fotemustine C+D':'Groups without IFN-α2b A+C');
      const active=r2?(fm?'A+B: fotemustine-containing groups':'B+D: IFN-α2b-containing groups'):(fm?'Fotemustine-containing groups A+B':'IFN-α2b-containing groups B+D');
      const controlId=prefix+(r2?(fm?'cd':'ac'):(fm?'fm_minus':'ifn_minus')),activeId=prefix+(r2?(fm?'ab':'bd'):(fm?'fm_plus':'ifn_plus'));
      if(!['R2','R3'].includes(scope.review_stage)||comparison.comparator_label!==control||comparison.additional_intervention_label!==active||
        comparison.comparator_arm_id!==controlId||comparison.intervention_arm_id!==activeId||comparison.outcome_arm_id!==activeId||
        comparison.outcome_arm_label!==active||comparison.result_relation!=='arm_specific')return null;
      const outcome=fm?'(Fotemustine + Dacarbazine) or (Fotemustine + Dacarbazine + Interferon alfa-2b)':'(Fotemustine + Dacarbazine + Interferon alfa-2b) or (Dacarbazine + Interferon alfa-2b)';
      return deepFreeze({...rule.presentation,outcome_label:outcome,previous_labels:{comparator:control,intervention:active,outcome:active},
        previous_roles:{comparator:'negated',intervention:'actual_regimen',outcome:'actual_regimen'},
        reviewed_roles:{comparator:'actual_regimen',intervention:'actual_regimen',outcome:'actual_regimen'}});
    }
    if(rule.presentation.direction_verified){
      if(scope.record_kind!=='canonical_review_scope'||scope.review_stage!=='R2'||scope.review_binding_sha256!==cmReview||
        scope.population_id!=='CE-2bf346e138415b8489344df0-'+cmPrefix+'pop-itt'||
        !same(comparison.result_ids,[cmResult])||comparison.comparator_arm_id!==null||comparison.intervention_arm_id!==null||
        comparison.comparator_label!=null||comparison.intervention_label!=null||comparison.additional_intervention_label!=null)return null;
    }
    return rule.presentation;
  }
  function directionFor(comparison,result){
    const rule=lookup(comparison);if(!rule?.direction_verified||!result)return null;
    const fact=result.original_fact||{},model=result.model||{};
    if(result.result_id!==cmResult||result.comparison_id!==cmComparison||result.measure!=='HR'||
      result.record_kind!=='canonical_clinical_fact'||result.report_id!==comparison.scope.report_id||
      result.pmid!=='27269740'||result.source_input_sha256!==comparison.scope.source_input_sha256||
      result.review_stage!=='R2'||result.reviewer!=='Sol'||result.population_id!==comparison.scope.population_id||
      result.model_id!=='CE-2bf346e138415b8489344df0-'+cmPrefix+'model-os-hr'||
      result.arm_id!==null||result.arm!==null||result.experimental_arm!==null||result.comparator_arm!==null||
      result.contrast_type!=='treatment_comparison'||result.endpoint?.family!=='overall_survival'||
      result.review_binding_sha256!==cmReview||result.scope!=='observed'||
      result.population?.entity_id!==cmPrefix+'pop-itt'||fact.fact_id!==cmPrefix+'fact-overall-survival-hr'||
      fact.field!=='overall-survival-hr'||fact.domain!=='efficacy_outcomes'||fact.measure!=='HR'||
      fact.clinical_endpoint_family!=='overall_survival'||fact.endpoint_id!==cmPrefix+'endpoint-os'||
      fact.contrast_type!=='treatment_comparison'||fact.scope!=='observed'||
      fact.model_id!==cmPrefix+'model-os-hr'||model.model_id!==fact.model_id||
      fact.result_population_id!==cmPrefix+'pop-itt'||fact.population_id&&fact.population_id!==cmPrefix+'pop-itt'||
      model.analysis_population_id!==cmPrefix+'pop-itt'||model.endpoint_id!==cmPrefix+'endpoint-os'||
      model.contrast_type!=='treatment_comparison'||model.scope!=='observed'||model.adjusted_status!=='not_reported'||
      !same(model.arm_ids,[cmPrefix+'arm-nivolumab-first',cmPrefix+'arm-ipilimumab-first'])||
      fact.experimental_arm_id!==null||fact.comparator_arm_id!==null||
      !same(fact.link_gaps,['cutoff','treatment_direction']))return null;
    const quantity=number=>number&&({role:number.role,status:number.status,value:number.value,raw_text:number.raw_text,qualifier:number.qualifier,unit:number.unit});
    const expected=[{role:'estimate',status:'reported',value:0.48,raw_text:'0·48',qualifier:'equal',unit:null},
      {role:'ci_lower',status:'reported',value:0.29,raw_text:'0·29',qualifier:'equal',unit:null},
      {role:'ci_upper',status:'reported',value:0.8,raw_text:'0·80',qualifier:'equal',unit:null},
      {role:'confidence_level',status:'reported',value:95,raw_text:'95',qualifier:'equal',unit:'%'}];
    if(!same((fact.numbers||[]).map(quantity),expected)||
      !same((result.reported_numbers||[]).map(quantity),expected)||
      !same((result.source_reported_numbers||[]).map(quantity),expected)||
      !same(['estimate','ci_lower','ci_upper','confidence_level'].map(key=>quantity(result[key])),expected))return null;
    return rule;
  }
  return Object.freeze({lookup,directionFor});
});
