'use strict';

/**
 * The whole tool, end to end, against fake Google services: a made-up
 * mailbox goes in, and the Sheet, the summary email and the privacy
 * guarantees are checked.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./helpers/load.js');
const { install } = require('./fakes/gas.js');
const { makeXlsx, makeZip } = require('./helpers/zip.js');
const mail = require('./fixtures/emails.js');
const form = require('./fixtures/form.js');

const IST = 5.5 * 3600000;
const ist = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h, mi || 0) - IST;

const ACME_SHEET = makeXlsx([['Sr', 'Name', 'PRN'], [1, 'Vikram Nair', '122B1F046'], [2, 'Asha Rao', '122B1F045'], [3, 'Meera Iyer', '122B1F044']]);

function mailbox() {
  return [
    mail.drive(), mail.driveReminder(), mail.internship(), mail.otherBranch(), mail.otherBatch(),
    mail.shortlistWithSheet(), mail.shortlistInline(), mail.shortlistPdf(),
    mail.otp(), mail.bank(), mail.newsletter(), mail.injection()
  ];
}

/** A fresh fake Google account with the Sheet set up and filled in. */
function start(over) {
  const state = install(Object.assign({
    mailbox: mailbox(),
    nowMs: ist(2026, 10, 5, 18),
    attachmentData: { 'att-acme-1': ACME_SHEET },
    web: {}
  }, over || {}));
  const g = loadGas();
  g.pdSetup();
  const put = (tab, label, value) => {
    const sheet = state.sheet(tab);
    const row = sheet.cells.find((r) => r[0] === label);
    assert.ok(row, 'no row "' + label + '" on ' + tab);
    row[1] = value;
  };
  put('Settings', 'Placement cell email addresses', mail.PLACEMENT_SENDER);
  put('Settings', 'Mailing list addresses (optional)', mail.BATCH_LIST);
  put('Settings', 'Your passing year', '2027');
  put('Settings', 'Your branch, every way it is written', 'Computer Engineering, Computer, Comp, CS, CSE');
  put('Settings', 'CGPA to percentage rule (optional)', 'x9.5');
  Object.keys(form.profile).forEach((label) => put('Profile', label, form.profile[label]));
  const run = (mode, nowMs) => { state.nowMs = nowMs; return g.PdRunner.run(mode, { nowMs }); };
  const drives = () => {
    const head = g.PdStore.DRIVE_HEAD;
    return state.sheet('Drives').table().slice(1).map((r) => {
      const o = {};
      head.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i]; });
      return o;
    });
  };
  return { state, g, run, drives, put };
}

/** The Dashboard as text: one line per row, empty layout cells dropped. */
const dashboardText = (state) => state.sheet('Dashboard').table().map((r) => r.filter((c) => c !== '').join(' | ')).join('\n');
const company = (rows, name) => rows.find((r) => String(r.Company).startsWith(name));

test('e2e: setup creates every tab once and never overwrites what is there', () => {
  const { state, g } = start();
  assert.deepEqual(['Dashboard', 'Drives', 'List checks', 'Practice', 'Practice log', 'Profile', 'Settings', 'Log', '_seen'].map((n) => !!state.sheet(n)), Array(9).fill(true));
  assert.equal(state.sheet('_seen').hidden, true);
  const before = JSON.stringify(state.sheet('Settings').table());
  g.pdSetup();
  assert.equal(JSON.stringify(state.sheet('Settings').table()), before);
  assert.match(state.toasts[state.toasts.length - 1], /already set up/);
});

test('e2e: setup removes the blank starter sheet, but never a sheet with anything in it', () => {
  const blank = start();
  blank.state.sheet('Drives').book.insertSheet('Sheet1');
  blank.g.pdSetup();
  assert.equal(blank.state.sheet('Sheet1'), undefined);

  const used = start();
  used.state.sheet('Drives').book.insertSheet('Sheet1');
  used.state.sheet('Sheet1').cells.push(['my own notes']);
  used.g.pdSetup();
  assert.deepEqual(used.state.sheet('Sheet1').table(), [['my own notes']]);
});

test('e2e: a first check fills the dashboard with what is for this student', () => {
  const { state, run, drives } = start();
  const stats = run('scheduled', ist(2026, 10, 5, 18));
  const rows = drives();
  assert.deepEqual(rows.map((r) => r.Company).sort(), ['Acme Robotics India Private Limited', 'Borealis Software', 'Falcon Labs']);
  const acme = company(rows, 'Acme');
  assert.deepEqual({
    todo: acme['To do'], type: acme.Type, forMe: acme['For me'], who: acme['Who it is for'], by: acme['Register by'],
    on: acme['Happening on'], where: acme.Where, pay: acme.Pay, role: acme.Role, form: acme.Form, email: acme.Email, mark: acme['My mark']
  }, {
    todo: 'Register by Tue 6 Oct, 4:00 PM', type: 'Placement drive', forMe: 'Yes', who: 'All branches, 2027', by: 'Tue 6 Oct, 4:00 PM',
    on: 'Wed 7 Oct, 9:00 AM', where: 'Main Campus, Riverton', pay: '6 LPA', role: 'Graduate Engineer Trainee', form: 'Open form', email: 'Open email', mark: ''
  });
  assert.equal(stats.added, 3);
  assert.equal(stats.leftOut, 3, 'other branch, other batch and the newsletter');
  assert.equal(stats.problems, 0);
  const dashboard = dashboardText(state);
  assert.match(dashboard, /Last checked: Mon 5 Oct, 6:00 PM/);
  assert.match(dashboard, /^2 \| 0 \| 2 \| 1$/m, 'the number tiles: to do, on a list, closing soon, coming up');
  assert.match(dashboard, /^To do \| On a list \| Closing within 36 hours \| Coming up in 14 days$/m);
  assert.match(dashboard, /Tue 6 Oct, 4:00 PM \| Register by Tue 6 Oct, 4:00 PM \| Acme Robotics India Private Limited \| Open form \| Open email/);
  const log = state.sheet('Log').table();
  assert.deepEqual(log[log.length - 1].slice(1, 9), ['scheduled', '6', '6', '3', '0', '3', '0', '0']);
});

test('e2e: private mail is kept out by the searches themselves', () => {
  const { state, run } = start();
  run('scheduled', ist(2026, 10, 5, 18));
  for (const q of state.queries) assert.match(q, /-subject:\(OTP OR /);
  assert.ok(!state.metadataFetched.includes('18f00000000000e1'), 'the OTP mail is never even listed');
  assert.ok(!state.metadataFetched.includes('18f00000000000e2'), 'the bank mail is never even listed');
  assert.ok(!state.bodiesFetched.includes('18f00000000000e3'), 'the newsletter is dropped on its subject, unopened');
});

test('e2e: even if a search leaks, private mail is never opened', () => {
  const { state, run } = start();
  state.leaky = true;
  const stats = run('scheduled', ist(2026, 10, 5, 18));
  assert.equal(stats.neverOpened, 2);
  assert.ok(state.metadataFetched.includes('18f00000000000e1'));
  assert.ok(!state.bodiesFetched.includes('18f00000000000e1'), 'OTP body never fetched');
  assert.ok(!state.bodiesFetched.includes('18f00000000000e2'), 'bank body never fetched');
  const everything = JSON.stringify(['Dashboard', 'Drives', 'List checks', 'Log', '_seen'].map((n) => state.sheet(n).table()));
  assert.ok(!everything.includes('482913'), 'the code is nowhere in the Sheet');
  assert.ok(!/debited|verification code/i.test(everything));
});

test('e2e: a reminder updates the row; the student\'s mark and notes are never written', () => {
  const { state, run, drives, g } = start();
  run('scheduled', ist(2026, 10, 5, 18));
  const sheet = state.sheet('Drives');
  const acmeRow = sheet.cells.findIndex((r) => String(r[2]).startsWith('Acme'));
  sheet.cells[acmeRow][0] = 'Applied';
  sheet.cells[acmeRow][16] = 'Asked a senior about the interview';
  sheet.writes.length = 0;

  const stats = run('scheduled', ist(2026, 10, 6, 10));
  const rows = drives();
  assert.equal(rows.length, 3, 'no duplicate row for the reminder');
  const acme = company(rows, 'Acme');
  assert.equal(acme['My mark'], 'Applied');
  assert.equal(acme['My notes'], 'Asked a senior about the interview');
  assert.equal(acme['Register by'], 'Tue 6 Oct, 6:00 PM', 'the reminder moved the deadline');
  assert.equal(acme['To do'], 'Drive \u2013 Wed 7 Oct, 9:00 AM', 'already applied, so no "Register" to-do');
  assert.match(acme['Latest email'], /^Reminder/);
  assert.equal(stats.added, 0);
  assert.equal(stats.updated, 1);
  const { mark, notes } = g.PdStore.COL;
  assert.deepEqual(sheet.writes.filter(([, col]) => col === mark || col === notes), [], 'columns "My mark" and "My notes" were never written');
});

test('e2e: a row the student added by hand is left alone', () => {
  const { state, run, drives } = start();
  run('scheduled', ist(2026, 10, 5, 18));
  const sheet = state.sheet('Drives');
  sheet.cells.push(['Applied', 'Follow up on Friday', 'Off-campus: Gale Systems', 'Referral', '', '', '', '', '', '', '', '', '', '', '', '', 'via alumni', '', '']);
  run('scheduled', ist(2026, 10, 6, 10));
  const mine = company(drives(), 'Off-campus');
  assert.deepEqual([mine['My mark'], mine['To do'], mine.Type, mine['My notes']], ['Applied', 'Follow up on Friday', 'Referral', 'via alumni']);
});

test('e2e: shortlists are checked in spreadsheets, in the email text, and flagged when unreadable', () => {
  const { state, run, drives } = start();
  run('scheduled', ist(2026, 10, 5, 18));
  run('scheduled', ist(2026, 10, 6, 10));
  const stats = run('scheduled', ist(2026, 10, 8, 14));
  const rows = drives();
  assert.equal(stats.onList, 2);

  const acme = company(rows, 'Acme');
  assert.equal(acme['On the list?'], 'YES \u2013 you are on the list');
  assert.equal(acme['To do'], 'You are on the list: face-to-face interviews \u2013 Fri 9 Oct, 9:00 AM');
  assert.equal(acme.Type, 'Shortlist');
  const borealis = company(rows, 'Borealis');
  assert.equal(borealis['On the list?'], 'YES \u2013 you are on the list');
  const evergreen = company(rows, 'Evergreen');
  assert.equal(evergreen['On the list?'], 'Could not read the file');
  assert.equal(evergreen['To do'], 'Open the email and check the list yourself');

  const checks = state.sheet('List checks').table().slice(1).map((r) => r.slice(1));
  assert.deepEqual(checks, [
    ['Acme Robotics', 'face-to-face interviews', 'Email text + 1 attached file', 'YES \u2013 you are on the list', 'Roll number'],
    ['Borealis Software', 'Programming Round', 'Email text', 'YES \u2013 you are on the list', 'Roll number'],
    ['Evergreen Systems', 'Virtual Interviews', 'Email text (1 could not be read)', 'Could not read the file', '']
  ]);
  assert.deepEqual(state.attachmentsFetched, ['att-acme-1'], 'the PDF is not downloaded');
});

test('e2e: nobody else from a shortlist is stored anywhere', () => {
  const { state, run } = start();
  run('scheduled', ist(2026, 10, 8, 14));
  const everything = JSON.stringify(state.sheet('Drives').book.getSheets().map((s) => s.table())) + JSON.stringify(state.sent) + JSON.stringify(state.properties);
  for (const other of ['Vikram', 'Nair', 'Meera', 'Iyer', '122B1F046', '122B1F044']) {
    assert.ok(!everything.includes(other), other + ' was stored');
  }
});

test('e2e: someone not on the list is told so, and a near-name does not count', () => {
  const t = start();
  t.put('Profile', 'Full name', 'Asha Rane');
  t.put('Profile', 'Roll number / PRN', '122B1F04');
  t.put('Profile', 'Personal email', 'asha.rane@example.com');
  t.put('Profile', 'College email', '');
  const stats = t.run('scheduled', ist(2026, 10, 8, 14));
  assert.equal(stats.onList, 0);
  const acme = company(t.drives(), 'Acme');
  assert.equal(acme['On the list?'], 'Not on the list');
});

test('e2e: text from an email can never become a formula or a script', () => {
  const { state, run, drives } = start();
  run('scheduled', ist(2026, 10, 5, 18));
  for (const sheet of state.sheet('Drives').book.getSheets()) {
    assert.deepEqual(sheet.formulas, [], 'a formula was written to ' + sheet.getName());
  }
  const falcon = company(drives(), 'Falcon');
  assert.equal(falcon.Pay, '<script>alert(1)</script>', 'kept as plain text in a cell');
  assert.equal(falcon.Form, '', 'the javascript: and look-alike links are not offered');
  assert.match(falcon['Latest email'], /^=IMPORTXML/, 'shown as text; the fake sheet recorded no formula');
});

test('e2e: hostile text stays plain text when rows are rewritten later', () => {
  const { state, run, g } = start({ web: { [form.FORM_URL]: { code: 200, body: form.page(form.loadData) } } });
  run('scheduled', ist(2026, 10, 5, 18));
  const sheet = state.sheet('Drives');
  // A row the student typed themselves, starting with a formula character.
  sheet.cells.push(['', '=1+1', '+Gale Systems', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  run('scheduled', ist(2026, 10, 6, 10));
  run('scheduled', ist(2026, 10, 8, 14));
  state.activeSheet = sheet;
  const row = sheet.cells.findIndex((r) => String(r[2]).startsWith('Acme')) + 1;
  sheet.getActiveRange = () => ({ getRow: () => row });
  g.pdPrefillSelected();
  for (const s of sheet.book.getSheets()) assert.deepEqual(s.formulas, [], 'a formula was written to ' + s.getName());
  assert.match(String(sheet.cells.find((r) => String(r[2]).startsWith('Falcon'))[12]), /^=IMPORTXML/);
});

test('e2e: emails are handled oldest first, so a shortlist joins its drive even in one batch', () => {
  const { run, drives } = start();
  run('catchup', ist(2026, 10, 9, 9));
  const rows = drives();
  assert.equal(rows.filter((r) => String(r.Company).startsWith('Borealis')).length, 1, 'internship notice and its shortlist share a row');
  assert.equal(rows.filter((r) => String(r.Company).startsWith('Acme')).length, 1);
  assert.equal(company(rows, 'Borealis')['On the list?'], 'YES \u2013 you are on the list');
});

test('e2e: checking twice changes nothing the second time', () => {
  const { state, run } = start();
  run('scheduled', ist(2026, 10, 5, 18));
  const before = JSON.stringify(state.sheet('Drives').table());
  const bodies = state.bodiesFetched.length;
  const stats = run('manual', ist(2026, 10, 5, 18));
  assert.equal(stats.fresh, 0);
  assert.equal(state.bodiesFetched.length, bodies, 'no email is opened twice');
  assert.equal(JSON.stringify(state.sheet('Drives').table()), before);
});

test('e2e: the daily sweep catches an email the short look-back missed', () => {
  const { run, drives } = start();
  const late = ist(2026, 10, 20, 9);
  assert.equal(run('scheduled', late).fresh, 0, 'everything is older than two days');
  assert.equal(drives().length, 0);
  const stats = run('sweep', late);
  assert.ok(stats.added >= 4);
  assert.ok(company(drives(), 'Acme'));
});

test('e2e: a Gmail hiccup is retried on the next check, and given up on after three tries', () => {
  const { state, run, drives } = start();
  state.failIds.add('18f00000000000a1');
  assert.equal(run('scheduled', ist(2026, 10, 5, 18)).problems, 1);
  assert.equal(company(drives(), 'Acme'), undefined);
  state.failIds.clear();
  assert.equal(run('scheduled', ist(2026, 10, 5, 19)).problems, 0);
  assert.ok(company(drives(), 'Acme'), 'picked up on the retry');

  const stuck = start();
  stuck.state.failIds.add('18f00000000000b1');
  for (let i = 0; i < 3; i++) assert.equal(stuck.run('scheduled', ist(2026, 10, 5, 18 + i)).problems, 1);
  assert.equal(stuck.run('scheduled', ist(2026, 10, 5, 22)).problems, 0, 'no longer retried');
});

test('e2e: message parts delivered as raw bytes are read the same way', () => {
  const { state, run, drives } = start();
  state.bytesMode = true;
  run('scheduled', ist(2026, 10, 5, 18));
  assert.equal(company(drives(), 'Acme').Role, 'Graduate Engineer Trainee');
});

test('e2e: an oversized or booby-trapped attachment is refused and flagged for a human', () => {
  const bomb = makeZip([{ name: 'xl/worksheets/sheet1.xml', text: 'x' }], { declaredSize: 2000000000 });
  const { run, drives } = start({ attachmentData: { 'att-acme-1': bomb } });
  run('scheduled', ist(2026, 10, 8, 14));
  assert.equal(company(drives(), 'Acme')['On the list?'], 'Could not read the file');
});

test('e2e: the summary email goes only to the student, in plain text, six lines at most', () => {
  const { state, run } = start();
  run('scheduled', ist(2026, 10, 5, 18));
  assert.equal(state.sent.length, 1);
  const message = state.sent[0];
  assert.deepEqual(Object.keys(message).sort(), ['body', 'subject', 'to']);
  assert.equal(message.to, 'asha.rao@example.com');
  const lines = message.body.split('\n');
  assert.ok(lines.length <= 6, message.body);
  assert.match(message.body, /Closing soon: /);
  assert.match(message.body, /New for you: /);
  assert.match(lines[lines.length - 1], /^Dashboard: https:\/\/docs\.google\.com\/spreadsheets\//);

  run('scheduled', ist(2026, 10, 5, 19));
  assert.equal(state.sent.length, 1, 'no repeat email when nothing is new');
});

test('e2e: no summary is sent for a manual check or when it is switched off', () => {
  const manual = start();
  manual.run('manual', ist(2026, 10, 5, 18));
  assert.equal(manual.state.sent.length, 0);
  const off = start();
  off.put('Settings', 'Email me a short summary', 'No');
  off.run('scheduled', ist(2026, 10, 5, 18));
  assert.equal(off.state.sent.length, 0);
});

test('e2e: forms are not fetched unless the student turns that on', () => {
  const { state, run } = start();
  run('scheduled', ist(2026, 10, 5, 18));
  assert.deepEqual(state.fetched, []);
});

test('e2e: with pre-fill on, a public form gets a ready link and nothing is submitted', () => {
  const t = start({ web: { [form.FORM_URL]: { code: 200, body: form.page(form.loadData) } } });
  t.put('Settings', 'Build pre-filled form links automatically', 'Yes');
  t.run('scheduled', ist(2026, 10, 5, 18));
  const acmeUrl = t.state.sheet('Drives').rich.get((t.state.sheet('Drives').cells.findIndex((r) => String(r[2]).startsWith('Acme')) + 1) + ',14').getLinkUrl();
  assert.ok(acmeUrl.startsWith(form.FORM_URL + '?usp=pp_url&entry.1000001=Asha%20Rao'));
  for (const request of t.state.fetched) {
    assert.ok(request.url.startsWith('https://docs.google.com/forms/'), request.url);
    assert.ok(request.url.endsWith('/viewform'), 'only the view address is requested, never the submit address');
    assert.deepEqual(request.options, { method: 'get', followRedirects: false, muteHttpExceptions: true });
  }
});

test('e2e: a form that needs sign-in falls back to copy-ready answers', () => {
  const t = start({ web: { [form.FORM_URL]: { code: 401, body: 'Sign in' } } });
  t.run('manual', ist(2026, 10, 5, 18));
  const sheet = t.state.sheet('Drives');
  t.state.activeSheet = sheet;
  const row = sheet.cells.findIndex((r) => String(r[2]).startsWith('Acme')) + 1;
  sheet.getActiveRange = () => ({ getRow: () => row });
  t.g.pdPrefillSelected();
  const panel = t.state.sidebars[t.state.sidebars.length - 1];
  assert.match(panel, /This form needs sign-in/);
  assert.match(panel, /value="Asha Rao"/);
  assert.match(panel, /value="122B1F045"/);
});

test('e2e: the answers panel escapes everything it shows', () => {
  const t = start();
  t.put('Profile', 'City', '"><script>alert(1)</script>');
  t.g.pdShowAnswers();
  const panel = t.state.sidebars[t.state.sidebars.length - 1];
  assert.ok(!panel.includes('<script>alert(1)</script>'));
  assert.match(panel, /&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('e2e: automatic checks are created once, in the student\'s timezone, and can be removed', () => {
  const { state, g } = start();
  g.pdTurnOn();
  g.pdTurnOn();
  assert.deepEqual(state.triggers.map((t) => [t.handler, t.hour, t.timeZone]), [
    ['pdScheduledRun', 8, 'Asia/Kolkata'], ['pdScheduledRun', 13, 'Asia/Kolkata'], ['pdScheduledRun', 19, 'Asia/Kolkata'], ['pdDailySweep', 7, 'Asia/Kolkata']
  ]);
  g.pdTurnOff();
  assert.deepEqual(state.triggers, []);
});

test('e2e: only read-only Gmail and this one Sheet are required', () => {
  const { state, run } = start();
  run('manual', ist(2026, 10, 5, 18));
  assert.deepEqual(state.requiredScopes, ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/spreadsheets.currentonly']);
  const manifest = require('../src/appsscript.json');
  for (const scope of manifest.oauthScopes) {
    assert.ok(!/mail\.google\.com|gmail\.(modify|send|compose|insert|labels|settings)|auth\/drive|auth\/spreadsheets$/.test(scope), 'too broad: ' + scope);
  }
});

test('e2e: the example fills the dashboard with made-up rows and removes them cleanly', () => {
  const { state, g, drives } = start();
  const sheet = state.sheet('Drives');
  sheet.cells.push(['Applied', 'My own row', 'Off-campus: Gale Systems', '', '', '', '', '', '', '', '', '', '', '', '', '', 'keep me', '', '']);
  g.pdExample();
  const rows = drives();
  assert.equal(rows.filter((r) => String(r._key).startsWith('demo:')).length, 6);
  assert.deepEqual(rows.filter((r) => r._key).map((r) => r.Type), ['Placement drive', 'Internship drive', 'Shortlist', 'Test', 'Shortlist', 'Talk']);
  assert.match(company(rows, 'Acme')['To do'], /^Register by /);
  assert.equal(company(rows, 'Cobalt')['On the list?'], 'YES \u2013 you are on the list');
  const dashboard = dashboardText(state);
  assert.match(dashboard, /You are on the list: Technical Interviews/);
  assert.deepEqual(state.metadataFetched, [], 'the example never touches Gmail');

  g.pdExample();
  assert.equal(drives().filter((r) => String(r._key).startsWith('demo:')).length, 6, 'running it twice does not duplicate rows');

  g.pdExampleClear();
  const left = drives();
  assert.equal(left.length, 1);
  assert.deepEqual([left[0]['My mark'], left[0].Company, left[0]['My notes']], ['Applied', 'Off-campus: Gale Systems', 'keep me']);
});

test('e2e: example rows are cleared by the first real check and never reach the summary', () => {
  const { state, g, run, drives } = start();
  g.pdExample();
  run('scheduled', ist(2026, 10, 5, 18));
  assert.equal(drives().filter((r) => String(r._key).startsWith('demo:')).length, 0);
  assert.ok(!/Cobalt|Dunmore|Example/.test(JSON.stringify(state.sent)));
  assert.equal(drives().length, 3);
});

test('e2e: a second check while one is running does nothing', () => {
  const { state, run, drives } = start();
  state.locked = true;
  const stats = run('scheduled', ist(2026, 10, 5, 18));
  assert.match(stats.note, /already running/);
  assert.equal(drives().length, 0);
});

test('e2e: the practice tab is updated and the coldest skill reaches the summary', () => {
  const { state, run } = start();
  const practice = state.sheet('Practice');
  practice.cells[1][2] = '04-10-2026';
  practice.cells[2][2] = '10-09-2026';
  run('scheduled', ist(2026, 10, 5, 18));
  assert.deepEqual(practice.table()[1].slice(0, 5), ['Arrays and strings', '3', '04-10-2026', '1', 'On track']);
  assert.deepEqual(practice.table()[2].slice(3, 5), ['25', '25 days cold']);
  assert.deepEqual(practice.table()[3].slice(3, 5), ['', 'Not started']);
  const dashboard = dashboardText(state);
  assert.match(dashboard, /Practice that has gone cold/);
  assert.match(dashboard, /Linked lists, stacks, queues \| 25 days cold/);
  assert.ok(!/Not started/.test(dashboard), 'skills never started are not listed as cold');
});

test('e2e: one click logs today\'s practice on the selected skill', () => {
  const { state, g } = start();
  const practice = state.sheet('Practice');
  state.activeSheet = practice;
  practice.getActiveRange = () => ({ getRow: () => 3 });
  g.pdLogPractice();

  const today = new Date(Date.now() + 5.5 * 3600000);
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const stamp = dd + '-' + mm + '-' + today.getUTCFullYear();
  assert.deepEqual(practice.table()[2].slice(0, 5), ['Linked lists, stacks, queues', '5', stamp, '0', 'On track']);
  assert.deepEqual(state.sheet('Practice log').table(), [['Date', 'Skill', 'My notes'], [stamp, 'Linked lists, stacks, queues', '']]);
  assert.match(state.toasts[state.toasts.length - 1], /^Logged for today: Linked lists/);

  // Not on the Practice tab, or on the header row: nothing is written.
  state.activeSheet = state.sheet('Drives');
  state.sheet('Drives').getActiveRange = () => ({ getRow: () => 3 });
  g.pdLogPractice();
  practice.getActiveRange = () => ({ getRow: () => 1 });
  state.activeSheet = practice;
  g.pdLogPractice();
  assert.equal(state.sheet('Practice log').table().length, 2);
});

test('e2e: a new user is not nagged about practice they have not started', () => {
  const { state, run } = start();
  run('scheduled', ist(2026, 10, 5, 18));
  const dashboard = dashboardText(state);
  assert.match(dashboard, /Nothing has gone cold/);
  assert.ok(!/Not started/.test(dashboard));
  assert.ok(!/Practice:/.test(state.sent[0].body));
  assert.equal(state.sheet('Practice').table()[1][4], 'Not started', 'the Practice tab itself still says so');
});
