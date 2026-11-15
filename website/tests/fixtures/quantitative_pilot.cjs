'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// These examples describe the reviewed 254-article pilot, not whichever cohort
// happens to be published today. Keep the exact released evidence immutable.
const sha256 = 'f832b11033c0c8b9d46adea4efe31bd33bd196884d6dde21b03e436266c318ba';
const filename = path.join(__dirname, '../../../data/current/reextraction/melanoma-quantitative-r2-continuation-20261107/publications', sha256 + '.json');

function readPilotSnapshot() {
  const bytes = fs.readFileSync(filename);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new Error('The immutable quantitative pilot regression fixture changed');
  }
  return JSON.parse(bytes);
}

module.exports = {readPilotSnapshot, sha256, filename};
