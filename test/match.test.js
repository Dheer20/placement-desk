'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load.js');

const { PdMatch } = loadCore();

// A made-up student. No real person's details appear in this repository.
const me = PdMatch.buildIdentity({
  names: ['Asha Rao'],
  ids: ['122B1F045'],
  emails: ['asha.rao@example.com']
});

const status = (r) => r.status + (r.via ? ':' + r.via : '');

test('match: exact name in a cell, in any case and either order', () => {
  assert.equal(status(PdMatch.matchCell('Asha Rao', me)), 'found:name');
  assert.equal(status(PdMatch.matchCell('  ASHA   RAO ', me)), 'found:name');
  assert.equal(status(PdMatch.matchCell('Rao Asha', me)), 'found:name');
  assert.equal(status(PdMatch.matchCell('RAO, ASHA', me)), 'found:name');
});

test('match: near names do not count', () => {
  for (const other of ['Ashaa Rao', 'Asha Rau', 'Ash Rao', 'Asha', 'Rao', 'Ashar Ao', 'Natasha Rao', 'Asha Raorane']) {
    assert.equal(PdMatch.matchCell(other, me).status, 'none', other);
  }
});

test('match: a longer first name is not a shorter one', () => {
  const short = PdMatch.buildIdentity({ names: ['Dev Mehta'], ids: [], emails: [] });
  assert.equal(PdMatch.matchCell('Devansh Mehta', short).status, 'none');
  assert.equal(PdMatch.matchCell('Dev Mehta', short).status, 'found');
  assert.equal(PdMatch.matchText('Selected: Devansh Mehta, Devika Mehta', short).status, 'none');
});

test('match: an extra middle name is shown as "check this", not as a match', () => {
  assert.equal(status(PdMatch.matchCell('Asha Vijay Rao', me)), 'possible:name');
  assert.equal(status(PdMatch.matchCell('Ms. Rao Asha V.', me)), 'possible:name');
  assert.equal(PdMatch.matchCell('Asha Vijay Kumar Devi Rao', me).status, 'none');
});

test('match: listing the middle-name spelling makes it exact', () => {
  const both = PdMatch.buildIdentity({ names: ['Asha Rao', 'Asha Vijay Rao'], ids: [], emails: [] });
  assert.equal(status(PdMatch.matchCell('RAO ASHA VIJAY', both)), 'found:name');
});

test('match: roll number must be the whole value', () => {
  assert.equal(status(PdMatch.matchCell('122B1F045', me)), 'found:id');
  assert.equal(status(PdMatch.matchCell(' 122b1f045 ', me)), 'found:id');
  assert.equal(status(PdMatch.matchCell('122-B1F-045', me)), 'found:id');
  assert.equal(PdMatch.matchCell('122B1F0451', me).status, 'none');
  assert.equal(PdMatch.matchCell('1122B1F045', me).status, 'none');
  assert.equal(PdMatch.matchCell('122B1F04', me).status, 'none');
});

test('match: numeric roll numbers survive spreadsheet formatting', () => {
  const numeric = PdMatch.buildIdentity({ names: [], ids: ['72212345678'], emails: [] });
  assert.equal(PdMatch.matchCell('72212345678', numeric).status, 'found');
  assert.equal(PdMatch.matchCell('72212345678.0', numeric).status, 'found');
  assert.equal(PdMatch.matchCell('7.2212345678E10', numeric).status, 'found');
  assert.equal(PdMatch.matchCell('72212345679', numeric).status, 'none');
  assert.equal(PdMatch.matchCell('722123456780', numeric).status, 'none');
});

test('match: email must be the whole address', () => {
  assert.equal(status(PdMatch.matchCell('Asha.Rao@Example.com', me)), 'found:email');
  assert.equal(PdMatch.matchCell('asha.rao@example.com.test', me).status, 'none');
  assert.equal(PdMatch.matchCell('xasha.rao@example.com', me).status, 'none');
});

test('match: first name and surname in separate columns', () => {
  const rows = [
    ['Sr', 'First name', 'Last name', 'Branch'],
    ['1', 'Vikram', 'Nair', 'IT'],
    ['2', 'Asha', 'Rao', 'CS']
  ];
  assert.equal(status(PdMatch.matchRows(rows, me)), 'found:name');
});

test('match: a roll number on the row is stronger evidence than the name', () => {
  assert.equal(status(PdMatch.matchRows([['2', 'Asha Rao', '122B1F045']], me)), 'found:id');
  assert.equal(status(PdMatch.matchRows([['2', 'A. Rao', '122B1F045']], me)), 'found:id');
});

test('match: a namesake with a different roll number is only a "check this"', () => {
  assert.equal(status(PdMatch.matchRows([['7', 'Asha Rao', '122B1F099']], me)), 'possible:name');
  assert.equal(status(PdMatch.matchRows([['7', 'Asha', 'Rao', '121B2F045']], me)), 'possible:name');
  // Numbers that are not roll numbers (serial, marks, phone) do not make a namesake.
  assert.equal(status(PdMatch.matchRows([['7', 'Asha Rao', '88.5', '9000000001']], me)), 'found:name');
  // The namesake row does not hide the student's real row further down.
  assert.equal(status(PdMatch.matchRows([['7', 'Asha Rao', '122B1F099'], ['8', 'Asha Rao', '122B1F045']], me)), 'found:id');
});

test('match: words from two different people in one row do not combine', () => {
  const rows = [['Asha Nair', 'Vikram Rao']];
  assert.equal(PdMatch.matchRows(rows, me).status, 'none');
});

test('match: a table without the student gives no match', () => {
  const rows = [['1', 'Vikram Nair', '122B1F046'], ['2', 'Meera Iyer', '122B1F044'], ['', '', '']];
  assert.deepEqual(PdMatch.matchRows(rows, me), { status: 'none', via: '' });
});

test('match: the result never contains anyone else from the list', () => {
  const rows = [['1', 'Vikram Nair', '122B1F046'], ['2', 'Asha Rao', '122B1F045']];
  const result = PdMatch.matchRows(rows, me);
  assert.deepEqual(Object.keys(result).sort(), ['status', 'via']);
  assert.ok(!JSON.stringify(result).includes('Vikram'));
});

test('match: free text is matched on whole words only', () => {
  assert.equal(status(PdMatch.matchText('Shortlisted: Vikram Nair, Asha Rao and Meera Iyer.', me)), 'found:name');
  assert.equal(status(PdMatch.matchText('3) RAO ASHA - CS', me)), 'found:name');
  assert.equal(status(PdMatch.matchText('PRN 122B1F045 is shortlisted', me)), 'found:id');
  assert.equal(status(PdMatch.matchText('Contact asha.rao@example.com.', me)), 'found:email');
  assert.equal(PdMatch.matchText('Natasha Raoul and Asharao were selected', me).status, 'none');
  assert.equal(PdMatch.matchText('PRN 122B1F0459 and X122B1F045', me).status, 'none');
});

test('match: a one-word name in running text is only a "check this"', () => {
  const single = PdMatch.buildIdentity({ names: ['Asha'], ids: [], emails: [] });
  assert.equal(status(PdMatch.matchText('Asha and Vikram were selected', single)), 'possible:name');
  assert.equal(status(PdMatch.matchCell('Asha', single)), 'found:name');
});

test('match: words that are built into JavaScript objects are not matches', () => {
  for (const word of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty', 'CONSTRUCTOR', 'prototype']) {
    assert.equal(PdMatch.matchCell(word, me).status, 'none', word);
    assert.equal(PdMatch.matchRows([[word, 'x'], ['1', word]], me).status, 'none', word);
    assert.equal(PdMatch.matchText('Shortlisted: ' + word + ' and others', me).status, 'none', word);
  }
});

test('match: an empty profile never matches anything', () => {
  const nobody = PdMatch.buildIdentity({ names: ['', '  '], ids: ['', 'ab'], emails: ['not-an-email'] });
  assert.ok(PdMatch.isEmpty(nobody));
  assert.equal(PdMatch.matchRows([['', 'ab', 'not-an-email']], nobody).status, 'none');
  assert.equal(PdMatch.matchText('anything at all', nobody).status, 'none');
});

test('match: accents and unusual spacing fold to the same name', () => {
  const accented = PdMatch.buildIdentity({ names: ['Zo\u00EB M\u00FCller'], ids: [], emails: [] });
  assert.equal(PdMatch.matchCell('ZOE MULLER', accented).status, 'found');
  assert.equal(PdMatch.matchCell('Zoe\u00A0Muller', accented).status, 'found');
});
