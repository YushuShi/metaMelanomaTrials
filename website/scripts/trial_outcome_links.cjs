'use strict';

const treatments = require('../dist/treatment_groups.js');
const words = value => String(value ?? '').toLowerCase();
const registrations = value => String(value || '').toUpperCase().match(/NCT\d{8}/g) || [];
const phases = label => String(label || '').split(/\s*(?:→|->|followed by)\s*/i);
const regimenKey = label => phases(label).map(part => treatments.describe(part).key).join(' → ');

function primaryPending(trial) {
  if (trial.primary_results_pmid || trial.primary_pmid || trial.primary_date || trial.primary_url) return false;
  return /(?:phase iii results|primary(?:\s+\w+){0,3})\s+pending\b/i.test(trial.status || '');
}

function attachPhaseLinks(rows, phaseComparison) {
  const index = new Map();
  function register(trial, group, phase, link) {
    const label = trial.regimen || group.regimen;
    if (!label) return;
    const key = regimenKey(label);
    const regimens = new Set([key]);
    // A curated contrast may spell out induction and maintenance for this arm.
    for (const outcome of trial.outcomes || []) {
      const course = outcome.comparison?.treatment;
      if (course && regimenKey(phases(course)[0]) === key) regimens.add(regimenKey(course));
    }
    const requiredDoses = Array.from(words(label).matchAll(/([a-z][a-z-]+)\s+(\d+(?:\.\d+)?)\s*mg\s*\/\s*kg/g),
      match => [match[1], match[2]]);
    const scoped = trial.id?.match(/^NCT\d{8}:(.+)$/i)?.[1];
    const descriptor = {regimens, requiredDoses, scoped, nct: trial.nct, link: {...link, phase}};
    const publications = [trial.primary_pmid, ...(trial.publications || []).map(p => p.pmid)];
    const ids = [trial.nct, ...publications.filter(Boolean).map(id => 'pmid:' + id)];
    for (const id of new Set(ids.filter(Boolean))) {
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(descriptor);
    }
  }
  for (const group of phaseComparison?.groups || []) {
    const phase3 = new Map(group.phase3.map(trial => [trial.id, trial]));
    for (const earlier of group.phase2) for (const laterId of earlier.match_ids || []) {
      const later = phase3.get(laterId);
      if (!later) continue;
      const link = {id: earlier.id + '|' + later.id, phase2Name: earlier.name, phase3Name: later.name, pending: primaryPending(later)};
      register(earlier, group, 2, link);
      register(later, group, 3, link);
    }
  }
  for (const row of rows) {
    const ncts = [...new Set([...registrations(row.nct), ...registrations(row.trialId)])];
    const matches = new Set([...ncts, 'pmid:' + row.pmid].flatMap(id => index.get(id) || []));
    row.phaseLinks = [];
    if (!matches.size) continue;
    const key = regimenKey(row.regimen);
    for (const descriptor of matches) {
      if (descriptor.nct && ncts.length && !ncts.includes(descriptor.nct)) continue;
      if (!descriptor.regimens.has(key)) continue;
      const context = words([row.cohort, row.armLabel, row.regimen, row.dose, row.trialId].filter(Boolean).join(' '));
      if (descriptor.scoped && !context.split(/[^a-z0-9]+/).includes(words(descriptor.scoped))) continue;
      if (!descriptor.requiredDoses.every(([drug,dose]) => new RegExp(drug + '\\s+' + dose.replace('.', '\\.') + '\\s*mg\\s*/\\s*kg').test(context))) continue;
      if (!row.phaseLinks.some(link => link.id === descriptor.link.id && link.phase === descriptor.link.phase))
        row.phaseLinks.push(descriptor.link);
    }
  }
  return rows;
}

module.exports = {attachPhaseLinks, primaryPending};
