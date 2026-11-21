'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const charts=require('../dist/app.js');
const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8');
const start=source.indexOf('  function treatmentTag('),end=source.indexOf('\n  function ',start+10);
const context=vm.createContext({charts,escape:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
vm.runInContext(source.slice(start,end),context);

test('table displays combination drugs separately with a plus and retains alternative wording',()=>{
  const combination=context.treatmentTag('Ipilimumab and nivolumab combination immunotherapy');
  assert.match(combination,/>Ipilimumab<\/span>/);
  assert.match(combination,/>Nivolumab<\/span>/);
  assert.match(combination,/<span class="treatment-join">\+<\/span>/);
  assert.doesNotMatch(combination,/combination immunotherapy|treatment-add-on/);
  const alternative=context.treatmentTag('Nivolumab or pembrolizumab');
  assert.match(alternative,/<span class="treatment-join">or<\/span>/);
  assert.doesNotMatch(alternative,/treatment-add-on|treatment-join">\+/);
});

test('table cleans named drug administration descriptors and distinguishes leading add-on plus',()=>{
  assert.match(context.treatmentTag('Topical imiquimod'),/>Imiquimod<\/span>/);
  assert.match(context.treatmentTag('Randomized blinded sorafenib'),/>Sorafenib<\/span>/);
  assert.doesNotMatch(context.treatmentTag('Ipilimumab 3 mg/kg'),/3 mg|kg/);
  const addon=context.treatmentTag('Bevacizumab',true);
  assert.match(addon,/class="treatment-add-on"[^>]*>\+<\/span>/);
  assert.match(addon,/Added to the comparator regimen/);
  assert.match(addon,/>Bevacizumab<\/span>/);
});

test('table preserves uncertainty, optional treatments, placebo and escaped source text',()=>{
  assert.match(context.treatmentTag('Nivolumab followed by unknown rescue agent'),/Nivolumab.*treatment-join">→.*unknown rescue agent/);
  assert.match(context.treatmentTag('Dacarbazine ± interferon alfa-2b'),/±/);
  assert.match(context.treatmentTag('Carboplatin + paclitaxel(+placebo)'),/Carboplatin.*treatment-join">\+.*Paclitaxel.*\(\+placebo\)/);
  const unsafe=context.treatmentTag('<img src=x onerror=alert(1)>');
  assert.doesNotMatch(unsafe,/<img/);assert.match(unsafe,/&lt;img/);
});

test('table preserves distinct treatment classes instead of folding other therapies into checkpoint immunotherapy',()=>{
  for(const [label,kind]of [
    ['Nivolumab','ici'],['Imiquimod','immunotherapy'],['Interleukin-2','cytokines'],
    ['Lifileucel','cell-therapies'],['IO102/IO103','vaccines'],['Talimogene laherparepvec','oncolytic-viruses'],
    ['Abiraterone','endocrine'],['Surgery','surgery'],['BRAF/MEK-directed therapy, combination unspecified','targeted']
  ])assert.match(context.treatmentTag(label),new RegExp('data-treatment-class="'+kind+'"'),label);
  const mixed=context.treatmentTag('Nivolumab + aldesleukin');
  assert.match(mixed,/data-treatment-class="ici"/);assert.match(mixed,/data-treatment-class="cytokines"/);
});

test('saved arm badges share Studies colors while keeping each drug’s dose and sequence',()=>{
  const label='Nivolumab 1 mg/kg + ipilimumab 3 mg/kg, followed by temozolomide';
  const html=charts.savedTreatmentTag(label);
  assert.equal(html.replace(/<[^>]*>/g,''),label);
  for(const drug of ['Nivolumab','ipilimumab','temozolomide']){
    const expected=context.treatmentTag(drug).match(/data-treatment-class="([^"]+)"/)[1];
    assert.ok(html.includes(`data-treatment-class="${expected}">${drug}</span>`));
  }
  const source=charts.savedTreatmentTag('Nivolumab <script> & placebo');
  assert.doesNotMatch(source,/<script>/);
  assert.match(source,/&lt;script&gt; &amp;/);
});
