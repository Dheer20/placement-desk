'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load.js');
const mail = require('./fixtures/emails.js');

const { PdBody, PdDedupe, PdPipeline, PdPlan, PdConfig, PdDates, PdMime, PdCoach, PdText } = loadCore();

const config = PdConfig.readSettings([
  ['Placement cell email addresses', mail.PLACEMENT_SENDER],
  ['Mailing list addresses (optional)', mail.BATCH_LIST],
  ['Your passing year', '2027'],
  ['Your branch, every way it is written', 'Computer, Comp, CS, CSE'],
  ['Timezone', 'Asia/Kolkata']
]);
const profile = PdConfig.readProfile([
  ['Full name', 'Asha Rao'], ['Roll number / PRN', '122B1F045'], ['Personal email', 'asha.rao@example.com']
], config.settings);
const offsetFn = PdDates.intlOffset('Asia/Kolkata');
const env = (known) => ({ settings: config.settings, identity: profile.identity, myEmails: profile.emails, offsetFn, knownCompanies: known || [] });
const run = (m, known) => PdPipeline.toItem(m, m.body, env(known));
const at = (y, mo, d, h, mi) => PdDates.toEpoch({ y, m: mo, d, h, mi }, offsetFn);

test('config: settings are read by their label and checked', () => {
  assert.deepEqual(config.problems, []);
  const s = config.settings;
  assert.deepEqual(s.senders, [mail.PLACEMENT_SENDER]);
  assert.equal(s.batch, 2027);
  assert.equal(s.order, 'DMY');
  assert.deepEqual(s.hours, [8, 13, 19]);
  assert.equal(s.notify, true);
  assert.equal(s.autoPrefill, false);
  assert.equal(s.lookbackDays, 2);
  assert.equal(s.sweepDays, 21);
});

test('config: an empty or broken Settings tab falls back to safe defaults with clear messages', () => {
  const bad = PdConfig.readSettings([
    ['Placement cell email addresses', 'not an address, ok@northfield.example'],
    ['Timezone', 'Mars/Olympus Mons; DROP'],
    ['Check at these hours', '25, x, 8, 8'],
    ['Days to look back on each check', '9999'],
    ['How dates are written in your emails', 'Month first (10-06-2026)']
  ]);
  assert.deepEqual(bad.settings.senders, ['ok@northfield.example']);
  assert.equal(bad.settings.timezone, 'Asia/Kolkata');
  assert.deepEqual(bad.settings.hours, [8]);
  assert.equal(bad.settings.lookbackDays, 14);
  assert.equal(bad.settings.order, 'MDY');
  assert.equal(bad.problems.length, 4);
  assert.ok(PdConfig.readSettings([]).problems.length >= 3);
});

test('config: the profile becomes an identity for list checks', () => {
  assert.deepEqual(profile.identity.idList, ['122B1F045']);
  assert.deepEqual(profile.emails, ['asha.rao@example.com']);
  const extra = PdConfig.readProfile([
    ['First name', 'Asha'], ['Last name', 'Rao'],
    ['Other spellings of your name on lists', 'Asha Vijay Rao, Rao Asha V'],
    ['Other roll numbers or IDs', 'T190000001']
  ], config.settings);
  assert.equal(extra.identity.names.length, 3);
  assert.deepEqual(extra.identity.idList, ['T190000001']);
});

test('mime: text, HTML and attachments are found in a nested message', () => {
  const payload = {
    mimeType: 'multipart/mixed',
    headers: [{ name: 'Subject', value: 'Hello' }, { name: 'TO', value: 'A <a@x.example>, "B, C" <B@X.example>' }],
    parts: [
      { mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/plain', body: { data: 'cGxhaW4', size: 5 } },
        { mimeType: 'text/html', body: { data: 'aHRtbA', size: 4 } }
      ] },
      { mimeType: 'application/pdf', filename: 'list.pdf', body: { attachmentId: 'att1', size: 1234 } }
    ]
  };
  assert.equal(PdMime.header(payload, 'subject'), 'Hello');
  assert.deepEqual(PdMime.addresses(PdMime.header(payload, 'to')), ['a@x.example', 'b@x.example']);
  assert.deepEqual(PdMime.collect(payload), {
    plain: ['cGxhaW4'], html: ['aHRtbA'],
    attachments: [{ filename: 'list.pdf', mimeType: 'application/pdf', size: 1234, attachmentId: 'att1' }]
  });
});

test('mime: HTML becomes text with scripts removed and table cells kept apart', () => {
  const text = PdMime.htmlToText('<style>p{}</style><p>Hi &amp; welcome</p><script>alert(1)</script><table><tr><td>1</td><td>Asha Rao</td></tr><tr><td>2</td><td>Vikram Nair</td></tr></table>');
  assert.ok(!/alert|p\{\}|</.test(text));
  assert.match(text, /Hi & welcome/);
  assert.deepEqual(PdMime.tableRows(text), [['1', 'Asha Rao'], ['2', 'Vikram Nair']]);
});

test('body: the bulleted details, links and deadline are read', () => {
  const body = PdBody.parse(mail.driveBody, { base: { y: 2026, m: 10, d: 5 } });
  assert.equal(body.fields.company, 'Acme Robotics India Private Limited');
  assert.equal(body.fields.ctc, '6 LPA');
  assert.equal(body.fields.role, 'Graduate Engineer Trainee');
  assert.equal(PdDates.toIso(body.deadline), '2026-10-06 16:00');
  assert.equal(PdDates.toIso(body.eventDate), '2026-10-07 09:00');
  assert.equal(body.formUrl, 'https://docs.google.com/forms/d/e/1FAIpQLSfExampleExampleExampleExampleExampleExampleExample01/viewform?usp=sharing&ouid=100000000000000000001');
  assert.deepEqual(body.links.map((l) => l.kind), ['document', 'form']);
  assert.equal(body.eligibility.allBranches, true);
  assert.deepEqual(body.eligibility.batches, [2027]);
  assert.ok(!/unsubscribe/.test(body.text), 'mailing-list footer is dropped');
});

test('body: unsafe and look-alike links are not kept as forms', () => {
  const links = PdBody.extractLinks('see javascript:alert(1) and https://evil.example/forms/d/e/abc/viewform and https://docs.google.com@evil.example/forms/d/e/abc/viewform and https://forms.gle/AbCdEf123456.');
  assert.deepEqual(links, [
    { url: 'https://evil.example/forms/d/e/abc/viewform', kind: 'other' },
    { url: 'https://forms.gle/AbCdEf123456', kind: 'form' }
  ]);
});

test('body: a very long body is cut, not processed whole', () => {
  const body = PdBody.parse('x'.repeat(500000), { base: { y: 2026, m: 10, d: 5 } });
  assert.ok(body.text.length <= 60000);
});

test('dedupe: one company written several ways gives one key', () => {
  for (const name of ['Acme Robotics India Private Limited', 'Acme Robotics India Pvt. Ltd.', 'ACME ROBOTICS', 'Acme Robotics (Riverton unit)', 'Acme  Robotics Ltd']) {
    assert.equal(PdDedupe.companyKey(name), 'acme robotics', name);
  }
  assert.equal(PdDedupe.companyKey('Mistral Corporation of India Ltd. (MCI)'), 'mistral corporation of india');
  assert.equal(PdDedupe.companyKey('India'), 'india');
  assert.equal(PdDedupe.companyKey(''), '');
  assert.notEqual(PdDedupe.companyKey('Acme Robotics'), PdDedupe.companyKey('Acme Robots'));
});

test('dedupe: message ids already handled are skipped, and old ones forgotten', () => {
  assert.deepEqual(PdDedupe.unseen(['a', 'b', 'a', 'c', ''], { b: 1 }), ['a', 'c']);
  assert.deepEqual(PdDedupe.unseen(['toString', 'constructor'], {}), ['toString', 'constructor']);
  const day = 86400000;
  assert.deepEqual(PdDedupe.pruneSeen({ old: 1 * day, recent: 95 * day }, 100 * day, 60), { recent: 95 * day });
});

test('pipeline: a drive email becomes one complete dashboard item', () => {
  const { skip, item, checkList } = run(mail.drive());
  assert.equal(skip, '');
  assert.equal(checkList, false);
  assert.deepEqual({
    key: item.key, company: item.company, kind: item.kind, title: item.title, eligible: item.eligible, forMe: item.forMe,
    deadline: item.deadline, eventDate: item.eventDate, venue: item.venue, pay: item.pay, role: item.role
  }, {
    key: 'acme robotics|placement', company: 'Acme Robotics India Private Limited', kind: 'drive',
    title: 'Acme Robotics India Private Limited \u2013 Placement drive', eligible: 'All branches, 2027', forMe: 'yes',
    deadline: '2026-10-06 16:00', eventDate: '2026-10-07 09:00', venue: 'Main Campus, Riverton', pay: '6 LPA', role: 'Graduate Engineer Trainee'
  });
  assert.equal(item.formUrl.startsWith('https://docs.google.com/forms/d/e/'), true);
  assert.equal(item.mailUrl, 'https://mail.google.com/mail/u/0/#all/18f00000000000a1');
});

test('pipeline: emails for another branch or batch are left out', () => {
  assert.equal(run(mail.otherBranch()).skip, 'for another branch or batch');
  assert.equal(run(mail.otherBatch()).skip, 'for another branch or batch');
  assert.equal(run(mail.internship()).skip, '', 'CS/IT is my branch');
});

test('pipeline: a keyword hit from a stranger must itself look like placement mail', () => {
  assert.equal(run(mail.newsletter()).skip, 'not placement mail');
});

test('pipeline: a reminder updates the same row instead of adding one', () => {
  const first = run(mail.drive()).item;
  const reminder = run(mail.driveReminder(), [first.company]).item;
  assert.equal(reminder.key, first.key);
  const merged = PdDedupe.mergeItem(first, reminder);
  assert.equal(merged.deadline, '2026-10-06 18:00', 'the new deadline wins');
  assert.equal(merged.company, first.company, 'the name on the row stays stable');
  assert.equal(merged.firstSeenMs, first.firstSeenMs);
  assert.equal(merged.updatedMs, reminder.updatedMs);
  assert.match(merged.latest, /^Reminder/);
});

test('pipeline: emails arriving out of order still end in the right state', () => {
  const first = run(mail.drive()).item;
  const reminder = run(mail.driveReminder()).item;
  const merged = PdDedupe.mergeItem(reminder, first);
  assert.equal(merged.deadline, '2026-10-06 18:00', 'the older email does not undo the newer deadline');
  assert.equal(merged.firstSeenMs, first.firstSeenMs);
});

test('pipeline: a shortlist email joins the company row and asks for a list check', () => {
  const drive = run(mail.drive()).item;
  const result = run(mail.shortlistWithSheet(), [drive.company]);
  assert.equal(result.item.key, drive.key);
  assert.equal(result.checkList, true);
  assert.equal(result.item.kind, 'shortlist');
  assert.equal(result.item.deadline, '', 'a shortlist has no registration deadline');
  assert.equal(result.item.eventDate, '2026-10-09 09:00');
  assert.equal(result.item.round, 'face-to-face interviews');
});

test('pipeline: a follow-up that does not say "internship" still joins the internship row', () => {
  const internship = run(mail.internship()).item;
  assert.equal(internship.key, 'borealis software|internship');
  const items = { [internship.key]: internship };
  const withRows = Object.assign(env([internship.company]), { findRow: (companyKey, wanted) => PdDedupe.findRow(items, companyKey, wanted) });
  const m = mail.shortlistInline();
  const followUp = PdPipeline.toItem(m, m.body, withRows).item;
  assert.equal(followUp.key, internship.key);
  assert.equal(followUp.track, 'internship');
});

test('dedupe: a follow-up picks the company\'s most recent row, and never another company\'s', () => {
  const items = {
    'acme robotics|placement': { track: 'placement', updatedMs: 5 },
    'acme robotics|internship': { track: 'internship', updatedMs: 9 },
    'acme robotics labs|placement': { track: 'placement', updatedMs: 99 }
  };
  assert.deepEqual(PdDedupe.findRow(items, 'acme robotics', 'acme robotics|event'), { key: 'acme robotics|internship', track: 'internship' });
  assert.equal(PdDedupe.findRow(items, 'acme robotics', 'acme robotics|placement'), null, 'its own row exists');
  assert.equal(PdDedupe.findRow(items, 'acme', 'acme|placement'), null, '"acme" is a different company from "acme robotics"');
  assert.equal(PdDedupe.findRow(items, '', 'misc|x'), null);
});

test('pipeline: list check finds the student in the email text or in a table', () => {
  const me = profile.identity;
  assert.deepEqual(PdPipeline.checkList(mail.inlineShortlistBody, [], 0, me), { status: 'found', via: 'id' });
  assert.equal(PdPipeline.checkList(mail.shortlistBody, [[['1', 'Vikram Nair'], ['2', 'Asha Rao']]], 0, me).status, 'found');
  assert.equal(PdPipeline.checkList(mail.shortlistBody, [[['1', 'Vikram Nair']]], 0, me).status, 'none');
  assert.equal(PdPipeline.checkList(mail.shortlistBody, [], 1, me).status, 'unread', 'a PDF that cannot be read is never reported as "not on the list"');
  assert.equal(PdPipeline.checkList(mail.shortlistBody, [[['2', 'Asha Rao']]], 1, me).status, 'found');
});

test('pipeline: a later list for the same day does not erase being found', () => {
  const base = run(mail.shortlistInline()).item;
  const found = Object.assign({}, base, { shortlisted: 'found', shortlistDay: '2026-10-08' });
  const slotTwo = Object.assign({}, base, { shortlisted: 'none', shortlistDay: '2026-10-08', updatedMs: base.updatedMs + 60000 });
  assert.equal(PdDedupe.mergeItem(found, slotTwo).shortlisted, 'found');
  const nextRound = Object.assign({}, base, { shortlisted: 'none', shortlistDay: '2026-10-12', updatedMs: base.updatedMs + 4 * 86400000 });
  assert.equal(PdDedupe.mergeItem(found, nextRound).shortlisted, 'none', 'a new round on a later day replaces it');
});

test('pipeline: hostile text in an email is carried as plain text and bad links are dropped', () => {
  const { item, skip } = run(mail.injection());
  assert.equal(skip, '');
  assert.equal(item.formUrl, '', 'javascript: and look-alike hosts are not form links');
  assert.equal(item.shortlisted, '', 'text telling the tool what to do changes nothing');
  for (const key of Object.keys(item)) {
    const cell = PdText.safeCell(item[key]);
    assert.ok(typeof cell !== 'string' || !/^[=+\-@]/.test(cell), key + ' would be run as a formula: ' + cell);
  }
});

test('pipeline: an email sent to the student personally counts whatever its branch', () => {
  const direct = mail.otherBranch();
  direct.to = ['asha.rao@example.com'];
  assert.equal(run(direct).skip, '');
});

test('plan: the next step follows deadlines, lists and the student\'s own mark', () => {
  const item = run(mail.drive()).item;
  const before = at(2026, 10, 5, 18, 0);
  assert.equal(PdPlan.todo(item, '', before, offsetFn), 'Register by Tue 6 Oct, 4:00 PM');
  assert.equal(PdPlan.todo(item, '', at(2026, 10, 6, 15, 59), offsetFn), 'Register by Tue 6 Oct, 4:00 PM');
  assert.equal(PdPlan.todo(item, '', at(2026, 10, 6, 16, 1), offsetFn), '', 'the deadline has passed');
  assert.equal(PdPlan.todo(item, 'Applied', before, offsetFn), 'Drive \u2013 Wed 7 Oct, 9:00 AM');
  for (const mark of ['Skip', 'Not applicable', 'hidden', ' SKIP ']) assert.equal(PdPlan.todo(item, mark, before, offsetFn), '', mark);
});

test('plan: being on a list is the top to-do until the date passes', () => {
  const item = Object.assign(run(mail.shortlistWithSheet()).item, { shortlisted: 'found' });
  assert.equal(PdPlan.todo(item, 'Applied', at(2026, 10, 8, 12, 0), offsetFn), 'You are on the list: face-to-face interviews \u2013 Fri 9 Oct, 9:00 AM');
  assert.equal(PdPlan.todo(item, 'Applied', at(2026, 10, 9, 9, 1), offsetFn), '');
  const unread = Object.assign({}, item, { shortlisted: 'unread' });
  assert.equal(PdPlan.todo(unread, '', at(2026, 10, 8, 12, 0), offsetFn), 'Open the email and check the list yourself');
  const notOn = Object.assign({}, item, { shortlisted: 'none' });
  assert.equal(PdPlan.todo(notOn, '', at(2026, 10, 8, 12, 0), offsetFn), '');
});

test('plan: the summary is never longer than six lines', () => {
  const now = at(2026, 10, 5, 18, 0);
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const item = Object.assign({}, run(mail.drive()).item, { key: 'k' + i, company: 'Company ' + i });
    if (i % 3 === 0) Object.assign(item, { shortlisted: 'found', eventDate: '2026-10-06 10:00' });
    if (i % 3 === 1) Object.assign(item, { shortlisted: 'possible', eventDate: '2026-10-06 11:00' });
    rows.push({ item, mark: '', todo: PdPlan.todo(item, '', now, offsetFn) });
  }
  const s = PdPlan.summary(rows, { newKeys: rows.map((r) => r.item.key), nudge: 'Arrays (9 days since last time)', sheetUrl: 'https://docs.google.com/spreadsheets/d/x' }, now, offsetFn);
  assert.ok(s.lines.length <= 6, s.lines.join('\n'));
  assert.equal(s.worthSending, true);
  assert.match(s.lines[0], /^On a list: Company 0 \(Tue 6 Oct, 10:00 AM\) \+3 more$/);
  assert.match(s.lines[1], /^Check these lists yourself: /);
});

test('plan: every dashboard number counts exactly what the list below it shows', () => {
  const now = at(2026, 10, 5, 18, 0);
  const make = (over) => {
    const item = Object.assign({}, run(mail.drive()).item, over);
    return { item, mark: '', todo: PdPlan.todo(item, '', now, offsetFn) };
  };
  const rows = [
    make({ key: 'a' }),
    make({ key: 'b', deadline: '2026-10-09 16:00', eventDate: '2026-10-10 09:00' }),
    make({ key: 'c', kind: 'shortlist', shortlisted: 'found', deadline: '', eventDate: '2026-10-08 10:00' }),
    make({ key: 'd', kind: 'shortlist', shortlisted: 'unread', deadline: '', eventDate: '2026-10-30 10:00' }),
    make({ key: 'e', deadline: '2026-10-01 16:00', eventDate: '2026-10-02 09:00' })
  ];
  const model = PdPlan.dashboard(rows, { problems: [], practice: [], checkedMs: now }, now, offsetFn);
  assert.deepEqual(model.tiles.map((t) => [t.label, t.value, t.tone]), [
    ['To do', '4', 'accent'],
    ['On a list', '1', 'good'],
    ['Closing within 36 hours', '1', 'warn'],
    ['Coming up in 14 days', '3', 'quiet']
  ]);
  const todo = model.sections[0];
  assert.equal(todo.rows.length, 4);
  assert.deepEqual(todo.tones, ['warn', 'good', '', 'warn'], 'closing soon, on a list, later, unreadable list');
  assert.equal(model.sections[1].rows.length, 3);
});

test('plan: with nothing to do the dashboard says so and offers the next step', () => {
  const now = at(2026, 10, 5, 18, 0);
  const model = PdPlan.dashboard([], { problems: [], practice: [], checkedMs: now }, now, offsetFn);
  assert.deepEqual(model.tiles.map((t) => t.value), ['0', '0', '0', '0']);
  assert.deepEqual(model.tiles.map((t) => t.tone), ['accent', 'quiet', 'quiet', 'quiet'], 'no alarm colours when there is nothing');
  assert.match(model.sections[0].empty, /Check my email now/);
});

test('plan: with nothing to do there is nothing worth sending', () => {
  const s = PdPlan.summary([], { newKeys: [], nudge: '', sheetUrl: 'https://docs.google.com/spreadsheets/d/x' }, at(2026, 10, 5, 18, 0), offsetFn);
  assert.equal(s.worthSending, false);
});

test('coach: skills are on track, due or cold by days since last practice', () => {
  const today = { y: 2026, m: 10, d: 10 };
  const review = PdCoach.review([
    { name: 'Arrays and strings', everyDays: 3, last: '09-10-2026' },
    { name: 'SQL queries', everyDays: 7, last: '01-10-2026' },
    { name: 'Dynamic programming', everyDays: 7, last: '20-09-2026' },
    { name: 'Mock interview', everyDays: 10, last: '' },
    { name: '', everyDays: '', last: '' },
    { name: 'Aptitude', everyDays: 'soon', last: new Date(2026, 9, 9) }
  ], today);
  assert.deepEqual(review.rows.map((r) => [r.name, r.days, r.status]), [
    ['Arrays and strings', 1, 'On track'],
    ['SQL queries', 9, 'Due'],
    ['Dynamic programming', 20, '20 days cold'],
    ['Mock interview', '', 'Not started'],
    ['', '', ''],
    ['Aptitude', 1, 'On track']
  ]);
  assert.equal(review.nudge, 'Dynamic programming (20 days since last time) +1 more due', 'a skill never started is not "cold"');
});

test('coach: nothing due means no nudge', () => {
  assert.equal(PdCoach.review([{ name: 'SQL', everyDays: 7, last: '2026-10-09' }], { y: 2026, m: 10, d: 10 }).nudge, '');
});
