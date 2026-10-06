'use strict';

/**
 * Loads the Apps Script source files the way Apps Script does: every file
 * runs in one shared global scope, with no modules. Tests then use the same
 * globals (PdDates, PdMatch, ...) that the deployed script uses.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', '..', 'src');

function listScripts(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(listScripts(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function run(dir) {
  for (const file of listScripts(dir)) {
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
  }
}

let coreLoaded = false;
let gasLoaded = false;

/** Load the pure logic in src/core. Safe to call more than once. */
function loadCore() {
  if (!coreLoaded) {
    run(path.join(SRC, 'core'));
    coreLoaded = true;
  }
  return globalThis;
}

/**
 * Load src/gas on top of the core. The Google services it calls
 * (SpreadsheetApp, Gmail, ...) must already be on globalThis as fakes.
 */
function loadGas() {
  loadCore();
  if (!gasLoaded) {
    run(path.join(SRC, 'gas'));
    gasLoaded = true;
  }
  return globalThis;
}

module.exports = { loadCore, loadGas, listScripts, SRC };
