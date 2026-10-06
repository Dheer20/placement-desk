'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load.js');
const fixtures = require('./fixtures/subjects.js');

const { PdSubject, PdDates } = loadCore();

function parse(subject, extra) {
  return PdSubject.parse(subject, Object.assign({ base: fixtures.base, knownCompanies: fixtures.knownCompanies }, extra || {}));
}

for (const c of fixtures.cases) {
  test('subject: ' + c.name, () => {
    const p = parse(c.subject);
    const actual = {};
    for (const key of Object.keys(c.expect)) {
      actual[key] = key === 'eventDate' || key === 'deadline' ? PdDates.toIso(p[key]) : p[key];
    }
    assert.deepEqual(actual, c.expect);
    if (c.details) {
      for (const key of Object.keys(c.details)) assert.equal(p.details[key], c.details[key], 'details.' + key);
    }
    if (c.constraints !== undefined) assert.equal(p.constraints.length, c.constraints);
    if (c.flags) {
      assert.deepEqual(Object.keys(p.flags).filter((f) => p.flags[f]).sort(), c.flags.slice().sort());
    }
  });
}

test('subject: reply and forward prefixes are ignored', () => {
  const p = parse('Fwd: RE: Acme Robotics Recruitment drive for BE/BTech (CS/IT) 2027 Batch');
  assert.equal(p.company, 'Acme Robotics');
  assert.equal(p.kind, 'drive');
});

test('subject: a subject that is only a flag word is not emptied', () => {
  const p = parse('Reminder');
  assert.equal(p.subject, 'Reminder');
  assert.equal(p.kind, 'info');
});

test('subject: an empty subject gives an empty, harmless result', () => {
  const p = parse('');
  assert.equal(p.company, '');
  assert.equal(p.kind, 'info');
  assert.equal(p.eventDate, null);
  assert.deepEqual(p.batches, []);
});

test('subject: formula-looking text is treated as plain text', () => {
  const p = parse('=HYPERLINK("https://evil.example","x") Acme Robotics Recruitment drive');
  assert.equal(p.kind, 'drive');
  assert.ok(!/^=/.test(String(globalThis.PdText.safeCell(p.title))));
});

test('subject: US date order can be chosen in settings', () => {
  const p = parse('Acme Robotics Recruitment drive scheduled on 10/07/2026 at 9:00 am', { order: 'MDY' });
  assert.equal(PdDates.toIso(p.eventDate), '2026-10-07 09:00');
});
