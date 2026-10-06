'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load.js');

const { PdText, PdQueries, PdEligibility } = loadCore();

test('text: cells that look like formulas are stored as plain text', () => {
  for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', '=IMPORTXML("https://x.example","//a")', '\t=1', '\n=1']) {
    assert.equal(String(PdText.safeCell(evil)).charAt(0), "'", JSON.stringify(evil));
  }
  assert.equal(PdText.safeCell('Acme Robotics'), 'Acme Robotics');
  assert.equal(PdText.safeCell('6 LPA - fixed'), '6 LPA - fixed');
  assert.equal(PdText.safeCell(42), 42);
  assert.equal(PdText.safeCell(null), '');
});

test('text: control characters are removed and long text is cut', () => {
  assert.equal(PdText.safeCell('a\u0000b\u0007c'), 'abc');
  assert.equal(String(PdText.safeCell('x'.repeat(5000))).length, PdText.MAX_CELL);
});

test('text: HTML is escaped', () => {
  assert.equal(PdText.escapeHtml('<script>alert("x")</script> & \'y\''), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
});

test('text: only plain http(s) links are kept', () => {
  assert.equal(PdText.safeUrl('https://docs.google.com/forms/d/e/abc/viewform'), 'https://docs.google.com/forms/d/e/abc/viewform');
  for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'https://a.example/x y', 'https://a.example/"><script>', 'ftp://a.example', '', 'https://']) {
    assert.equal(PdText.safeUrl(bad), '', bad);
  }
  assert.equal(PdText.safeUrl('https://a.example/' + 'x'.repeat(3000)), '');
});

test('text: host names cannot be spoofed with user-info tricks', () => {
  assert.equal(PdText.hostOf('https://docs.google.com/forms/x'), 'docs.google.com');
  assert.equal(PdText.hostOf('https://docs.google.com@evil.example/forms/x'), '');
  assert.equal(PdText.hostOf('https://DOCS.Google.com:443/forms'), 'docs.google.com');
});

test('queries: searches carry the exclusions and the look-back window', () => {
  const queries = PdQueries.build({
    senders: ['placements@northfield.example'], lists: ['batch2027@lists.northfield.example'],
    keywords: ['shortlist', 'test link'], excludeTerms: ['fee receipt']
  }, 2);
  assert.equal(queries.length, 2);
  assert.match(queries[0].query, /^\{from:placements@northfield\.example to:batch2027@lists\.northfield\.example cc:batch2027@lists\.northfield\.example\} newer_than:2d /);
  for (const q of queries) {
    assert.match(q.query, /-subject:\(OTP OR "one time password" OR "verification code"/);
    assert.match(q.query, /password/);
    assert.match(q.query, /"fee receipt"/);
    assert.match(q.query, /-in:spam -in:trash/);
  }
  assert.match(queries[1].query, /^\(shortlist OR "test link"\) newer_than:2d/);
  assert.match(queries[1].query, /-category:social -category:promotions$/);
});

test('queries: settings text cannot inject search operators', () => {
  const queries = PdQueries.build({
    senders: ['x@y.example) OR in:anywhere (', 'ok@northfield.example'],
    lists: [], keywords: ['shortlist") OR label:(bank'], excludeTerms: []
  }, 21);
  assert.equal(queries[0].query.indexOf('in:anywhere'), -1);
  assert.match(queries[0].query, /^\{from:ok@northfield\.example\} newer_than:21d/);
  assert.ok(!/\) OR label:\(/.test(queries[1].query));
});

test('queries: with no placement sender only the keyword search is used', () => {
  const queries = PdQueries.build({ senders: [], lists: [], keywords: [], excludeTerms: [] }, 2);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].name, 'keywords');
});

test('queries: codes, passwords and security mail are never opened', () => {
  const trusted = ['placements@northfield.example'];
  for (const subject of [
    'Your OTP is 123456', 'One-time password for login', 'Your verification code', 'Reset your password',
    'Security alert', 'New sign-in on Windows', '2-step verification turned on', 'Verify your email address'
  ]) {
    assert.equal(PdQueries.isSensitive(subject, 'someone@site.example', []), true, subject);
    assert.equal(PdQueries.isSensitive(subject, 'placements@northfield.example', trusted), true, 'even from placement cell: ' + subject);
  }
});

test('queries: bank, payment and social mail is never opened', () => {
  assert.equal(PdQueries.isSensitive('Rs 500 debited from a/c XX12', 'alerts@harbourbank.example', []), true);
  assert.equal(PdQueries.isSensitive('Your account statement for September', 'x@site.example', []), true);
  assert.equal(PdQueries.isSensitive('UPI payment successful', 'x@site.example', []), true);
  assert.equal(PdQueries.isSensitive('Hello', 'notification@facebookmail.example', []), true);
  assert.equal(PdQueries.isSensitive('You have a new follower', 'no-reply@instagram.example', []), true);
});

test('queries: a bank that is hiring is still placement mail from the placement cell', () => {
  const trusted = ['placements@northfield.example'];
  const subject = 'Harbour Bank recruitment drive for BE/BTech (All Branches) 2027 Batch || credit card division';
  assert.equal(PdQueries.isSensitive(subject, 'Placement Cell <placements@northfield.example>', trusted), false);
  assert.equal(PdQueries.isSensitive('Acme Robotics Recruitment drive', 'placements@northfield.example', trusted), false);
});

test('eligibility: batch, branch and degree decide who an email is for', () => {
  const me = { batch: 2027, branchAliases: ['Computer', 'CS', 'CSE'], degreeAliases: ['BE', 'B.Tech'] };
  const t = (o) => Object.assign({ degrees: [], branches: [], allBranches: false, batches: [] }, o);
  assert.equal(PdEligibility.evaluate(t({ allBranches: true, batches: [2027] }), me, false).forMe, 'yes');
  assert.equal(PdEligibility.evaluate(t({ branches: ['CS/IT', 'CS', 'IT'], batches: [2027] }), me, false).forMe, 'yes');
  assert.equal(PdEligibility.evaluate(t({ branches: ['Mechanical'], batches: [2027] }), me, false).forMe, 'no');
  assert.equal(PdEligibility.evaluate(t({ allBranches: true, batches: [2026] }), me, false).forMe, 'no');
  assert.equal(PdEligibility.evaluate(t({ allBranches: true, batches: [2026, 2027] }), me, false).forMe, 'yes');
  assert.equal(PdEligibility.evaluate(t({ degrees: ['MBA'], allBranches: true }), me, false).forMe, 'no');
  assert.equal(PdEligibility.evaluate(t({ degrees: ['BTECH', 'MBA'], allBranches: true }), me, false).forMe, 'yes');
  assert.equal(PdEligibility.evaluate(t({}), me, false).forMe, 'maybe');
  assert.equal(PdEligibility.evaluate(t({ batches: [2027] }), me, false).forMe, 'yes');
});

test('eligibility: an email addressed to the student always counts', () => {
  const me = { batch: 2027, branchAliases: ['CS'], degreeAliases: ['BE'] };
  const target = { degrees: [], branches: ['Mechanical'], allBranches: false, batches: [2026] };
  assert.equal(PdEligibility.evaluate(target, me, true).forMe, 'yes');
});

test('eligibility: branch names match whole names only', () => {
  const me = { batch: 2027, branchAliases: ['IT'], degreeAliases: [] };
  const t = (branches) => ({ degrees: [], branches, allBranches: false, batches: [] });
  assert.equal(PdEligibility.evaluate(t(['CS/IT', 'CS', 'IT']), me, false).forMe, 'yes');
  assert.equal(PdEligibility.evaluate(t(['ITES']), me, false).forMe, 'no');
  const etc = { batch: 2027, branchAliases: ['E&TC', 'ENTC'], degreeAliases: [] };
  assert.equal(PdEligibility.evaluate(t(['Mechanical', 'E & TC']), etc, false).forMe, 'yes');
});

test('eligibility: with no branch saved, nothing is hidden', () => {
  const me = { batch: 2027, branchAliases: [], degreeAliases: [] };
  const target = { degrees: [], branches: ['Mechanical'], allBranches: false, batches: [] };
  assert.equal(PdEligibility.evaluate(target, me, false).forMe, 'maybe');
});
