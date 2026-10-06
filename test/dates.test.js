'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load.js');

const { PdDates } = loadCore();
const base = { y: 2026, m: 10, d: 5 };
const iso = (text, ctx) => PdDates.toIso(PdDates.firstDate(text, Object.assign({ base }, ctx || {})));

test('dates: day-month-year with ordinals and long or short month names', () => {
  assert.equal(iso('scheduled on 7th October 2026'), '2026-10-07');
  assert.equal(iso('on 30 September 2026'), '2026-09-30');
  assert.equal(iso('interviews on 8th Oct 2026 (Thursday)'), '2026-10-08');
  assert.equal(iso('on the 1st of March 2027'), '2027-03-01');
  assert.equal(iso('by 21 Sept. 2026'), '2026-09-21');
});

test('dates: month-first wording', () => {
  assert.equal(iso('scheduled on Oct 3, 2026'), '2026-10-03');
  assert.equal(iso('October 12th at 10 AM'), '2026-10-12 10:00');
});

test('dates: numeric dates are day-first by default', () => {
  assert.equal(iso('Last date to register: 06-10-2026'), '2026-10-06');
  assert.equal(iso('Tomorrow, 29/09/2026 at 1:00PM'), '2026-09-29 13:00');
  assert.equal(iso('on 6.10.26'), '2026-10-06');
  assert.equal(iso('on 2026-10-09'), '2026-10-09');
});

test('dates: month-first numeric order when the setting says so', () => {
  assert.equal(iso('on 10/07/2026', { order: 'MDY' }), '2026-10-07');
});

test('dates: impossible dates are ignored, not guessed', () => {
  assert.equal(iso('on 31-02-2026'), '');
  assert.equal(iso('on 45/13/2026'), '');
  assert.equal(iso('version 1.2 of the form'), '');
  assert.equal(iso('call 98765 43210'), '');
});

test('dates: times in the styles placement cells use', () => {
  assert.equal(iso('7th October 2026 at 9:00 a.m. at Main Campus'), '2026-10-07 09:00');
  assert.equal(iso('6-10-2026 at 7:30 am'), '2026-10-06 07:30');
  assert.equal(iso('06-10-2026 till 4:00 PM'), '2026-10-06 16:00');
  assert.equal(iso('06-10-2026 till 04:00 pm'), '2026-10-06 16:00');
  assert.equal(iso('1st October 2026 at 4:45 pm'), '2026-10-01 16:45');
  assert.equal(iso('9 October 2026, 12 noon'), '2026-10-09 12:00');
  assert.equal(iso('9 October 2026 at 1300 hrs'), '2026-10-09 13:00');
  assert.equal(iso('9 October 2026 at 16:30'), '2026-10-09 16:30');
  assert.equal(iso('9 October 2026 at 12:15 am'), '2026-10-09 00:15');
  assert.equal(iso('at 7:00 pm on 28-09-2026'), '2026-09-28 19:00');
});

test('dates: a number after the date is not mistaken for a time', () => {
  assert.equal(iso('7th October 2026 for 25 students'), '2026-10-07');
  assert.equal(iso('batch 2027 on 7th October'), '2026-10-07');
});

test('dates: "today" and "tomorrow" count from the day the email was sent', () => {
  assert.equal(iso('scheduled Today at 3:30 pm'), '2026-10-05 15:30');
  assert.equal(iso('test is tomorrow at 10 am'), '2026-10-06 10:00');
});

test('dates: a written date beats the word next to it', () => {
  assert.equal(iso('scheduled Today (28-09-2026) at 7:00 pm'), '2026-09-28 19:00');
  assert.equal(iso('Today, Thursday, 1st October 2026 at 4:45 pm'), '2026-10-01 16:45');
});

test('dates: a missing year is the nearest sensible one', () => {
  assert.equal(iso('on 9th October'), '2026-10-09');
  assert.equal(iso('on 5th January', { base: { y: 2026, m: 12, d: 20 } }), '2027-01-05');
  assert.equal(iso('held on 28th December', { base: { y: 2027, m: 1, d: 3 } }), '2026-12-28');
});

test('dates: wall-clock time becomes the right instant in the timezone', () => {
  const kolkata = PdDates.intlOffset('Asia/Kolkata');
  const parts = { y: 2026, m: 10, d: 7, h: 9, mi: 0, hasTime: true };
  assert.equal(new Date(PdDates.toEpoch(parts, kolkata)).toISOString(), '2026-10-07T03:30:00.000Z');
  assert.deepEqual(PdDates.toParts(Date.UTC(2026, 9, 7, 3, 30), kolkata), { y: 2026, m: 10, d: 7, h: 9, mi: 0, hasTime: true });
});

test('dates: daylight-saving zones are handled on both sides of the change', () => {
  const ny = PdDates.intlOffset('America/New_York');
  assert.equal(new Date(PdDates.toEpoch({ y: 2026, m: 7, d: 1, h: 9, mi: 0 }, ny)).toISOString(), '2026-07-01T13:00:00.000Z');
  assert.equal(new Date(PdDates.toEpoch({ y: 2026, m: 12, d: 1, h: 9, mi: 0 }, ny)).toISOString(), '2026-12-01T14:00:00.000Z');
});

test('dates: late evening in India is still the same calendar day there', () => {
  const kolkata = PdDates.intlOffset('Asia/Kolkata');
  // 20:00 UTC on the 6th is 01:30 on the 7th in India.
  assert.equal(PdDates.toParts(Date.UTC(2026, 9, 6, 20, 0), kolkata).d, 7);
});

test('dates: a date with no time counts until the end of that day', () => {
  const kolkata = PdDates.intlOffset('Asia/Kolkata');
  const end = PdDates.endEpoch({ y: 2026, m: 10, d: 6, hasTime: false }, kolkata);
  assert.equal(new Date(end).toISOString(), '2026-10-06T18:29:00.000Z');
});

test('dates: text forms round-trip and sort correctly', () => {
  const parts = PdDates.fromIso('2026-10-07 09:05');
  assert.equal(PdDates.toIso(parts), '2026-10-07 09:05');
  assert.equal(PdDates.toHuman(parts), 'Wed 7 Oct, 9:05 AM');
  assert.equal(PdDates.toHuman(PdDates.fromIso('2026-10-07')), 'Wed 7 Oct');
  assert.equal(PdDates.toHuman(PdDates.fromIso('2026-10-07 00:00')), 'Wed 7 Oct, 12:00 AM');
  assert.equal(PdDates.fromIso('not a date'), null);
  assert.ok('2026-10-07 09:05' < '2026-10-07 16:00');
});

test('dates: day arithmetic crosses months and years', () => {
  assert.deepEqual(PdDates.addDays({ y: 2026, m: 12, d: 31 }, 1), { y: 2027, m: 1, d: 1 });
  assert.equal(PdDates.daysBetween({ y: 2026, m: 10, d: 5 }, { y: 2026, m: 10, d: 26 }), 21);
});
