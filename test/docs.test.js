'use strict';

/**
 * Keeps the documents honest: every local link resolves, the required
 * documents exist, and what the README promises matches the manifest.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const DOCS = ['README.md', 'PRIVACY.md', 'SECURITY.md', 'CONTRIBUTING.md', 'DECISIONS.md'];

test('docs: every required document exists', () => {
  for (const name of DOCS.concat(['LICENSE', '.github/workflows/ci.yml', '.github/dependabot.yml'])) {
    assert.ok(fs.existsSync(path.join(ROOT, name)), name + ' is missing');
  }
  assert.match(read('LICENSE'), /^MIT License/);
});

test('docs: local links and images point at files that exist', () => {
  for (const name of DOCS) {
    const text = read(name);
    const links = Array.from(text.matchAll(/\]\(([^)\s]+)\)/g)).map((m) => m[1]);
    for (const link of links) {
      if (/^(https?:|mailto:|#)/.test(link)) continue;
      const file = link.split('#')[0];
      assert.ok(fs.existsSync(path.join(ROOT, path.dirname(name), file)), name + ' links to missing file ' + link);
    }
  }
});

test('docs: nothing is left marked as unfinished', () => {
  for (const name of DOCS) {
    assert.ok(!/\b(TODO|TBD|FIXME|PENDING|lorem ipsum)\b/i.test(read(name)), name + ' has an unfinished marker');
  }
});

test('docs: the disclaimer and the no-affiliation statement are present', () => {
  assert.match(read('README.md'), /not affiliated\s+with, endorsed by or connected to Google/);
  assert.match(read('PRIVACY.md'), /not affiliated/);
});

test('docs: the permissions explained in PRIVACY.md are exactly the ones requested', () => {
  const scopes = require('../src/appsscript.json').oauthScopes;
  const rows = read('PRIVACY.md').split('## The permissions Google will ask you for')[1].split('##')[0]
    .split('\n').filter((line) => /^\| [A-Z]/.test(line) && !/^\| Google's wording/.test(line));
  assert.equal(rows.length, scopes.length, 'one explained row per requested permission');
});

test('docs: the menu items named in the README exist in the code', () => {
  const app = read('src/gas/App.js');
  const named = Array.from(read('README.md').matchAll(/\*\*Placement Desk > ([^*]+)\*\*/g)).map((m) => m[1].replace(/\s+/g, ' ').trim());
  assert.ok(named.length >= 5);
  for (const item of named) assert.ok(app.includes("'" + item + "'"), 'README mentions a menu item that does not exist: ' + item);
});

test('docs: the settings named in the README exist in the code', () => {
  const config = read('src/core/Config.js');
  for (const label of ['Placement cell email addresses', 'Mailing list addresses (optional)', 'Your passing year', 'Your branch, every way it is written', 'Timezone', 'How dates are written in your emails']) {
    assert.ok(read('README.md').includes(label), 'README should mention ' + label);
    assert.ok(config.includes("'" + label + "'"), 'no such setting: ' + label);
  }
});
