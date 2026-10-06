'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load.js');
const form = require('./fixtures/form.js');

const { PdPrefill, PdConfig } = loadCore();

const settings = PdConfig.readSettings([
  ['Your passing year', '2027'],
  ['Your branch, every way it is written', 'Computer Engineering, Computer, Comp, CS, CSE'],
  ['CGPA to percentage rule (optional)', 'x9.5']
]).settings;
const profileRows = Object.keys(form.profile).map((label) => [label, form.profile[label], '']);
const fields = PdConfig.readProfile(profileRows, settings).fields;

function mapped() {
  const parsed = PdPrefill.parseForm(PdPrefill.extractLoadData(form.page(form.loadData)));
  return { parsed, result: PdPrefill.mapQuestions(parsed.questions, fields, {}) };
}

test('prefill: form addresses are reduced to one safe canonical link', () => {
  const id = '1FAIpQLSfExampleExampleExampleExampleExampleExampleExample01';
  const want = 'https://docs.google.com/forms/d/e/' + id + '/viewform';
  assert.equal(PdPrefill.normaliseFormUrl(want + '?usp=sharing&ouid=100000000000000000001'), want);
  assert.equal(PdPrefill.normaliseFormUrl('https://docs.google.com/forms/d/e/' + id + '/formResponse'), want);
  assert.equal(PdPrefill.normaliseFormUrl('https://docs.google.com/forms/u/1/d/e/' + id + '/viewform'), want);
  assert.equal(PdPrefill.normaliseFormUrl('https://docs.google.com/forms/d/' + id + '/edit'), 'https://docs.google.com/forms/d/' + id + '/viewform');
});

test('prefill: links that are not Google Forms are refused', () => {
  for (const bad of [
    'https://evil.example/forms/d/e/1FAIpQLSfExampleExampleExample/viewform',
    'https://docs.google.com.evil.example/forms/d/e/1FAIpQLSfExampleExampleExample/viewform',
    'https://docs.google.com@evil.example/forms/d/e/1FAIpQLSfExampleExampleExample/viewform',
    'http://docs.google.com/forms/d/e/1FAIpQLSfExampleExampleExample/viewform',
    'https://docs.google.com/document/d/1FAIpQLSfExampleExampleExample/edit',
    'https://docs.google.com/forms/d/e/../../x/viewform',
    'javascript:alert(1)', ''
  ]) {
    assert.equal(PdPrefill.normaliseFormUrl(bad), '', bad);
  }
});

test('prefill: the question list is read from the page as data only', () => {
  const data = PdPrefill.extractLoadData(form.page(form.loadData));
  assert.deepEqual(data, form.loadData);
  assert.equal(PdPrefill.extractLoadData('<html>Sign in to continue</html>'), null);
  assert.equal(PdPrefill.extractLoadData('var FB_PUBLIC_LOAD_DATA_ = [1, 2'), null);
  assert.equal(PdPrefill.extractLoadData('var FB_PUBLIC_LOAD_DATA_ = alert(1); [1]'), null);
  assert.equal(PdPrefill.extractLoadData('var FB_PUBLIC_LOAD_DATA_ = [1, alert(1)];'), null);
  assert.deepEqual(PdPrefill.extractLoadData('FB_PUBLIC_LOAD_DATA_ = ["a]\\"]", [2]];'), ['a]"]', [2]]);
});

test('prefill: questions, types, options and required flags are understood', () => {
  const { parsed } = mapped();
  assert.equal(parsed.title, 'Acme Robotics - Registration');
  assert.equal(parsed.questions.length, 19, 'the section header is not a question');
  const gender = parsed.questions.find((q) => q.title === 'Gender');
  assert.deepEqual(gender, { title: 'Gender', type: 'choice', entryId: '1000006', required: true, options: ['Male', 'Female'], hasOther: true });
  assert.equal(parsed.questions.find((q) => /resume/i.test(q.title)).type, 'upload');
});

test('prefill: a damaged or unexpected page gives nothing rather than a crash', () => {
  for (const bad of [null, [], [null, null], [null, ['x', 'not a list']], 'text', 42]) {
    assert.equal(PdPrefill.parseForm(bad), null);
  }
  const odd = PdPrefill.parseForm([null, [null, [null, 'x', [1], [1, 'T', null, 0, 'oops'], [2, 'U', null, 99, [[5]]]]]]);
  assert.deepEqual(odd.questions.map((q) => [q.title, q.entryId]), [['T', '']]);
});

test('prefill: each question gets the right profile answer', () => {
  const { result } = mapped();
  const byQuestion = {};
  result.answers.forEach((a) => { byQuestion[a.question] = a.value; });
  assert.deepEqual(byQuestion, {
    'Full Name (as per college records)': 'Asha Rao',
    'PRN Number': '122B1F045',
    'Personal Email ID': 'asha.rao@example.com',
    'College Email ID': 'asha.rao@northfield.example',
    'Mobile No. (WhatsApp)': '9000000001',
    'Gender': 'Female',
    'Branch': 'Computer Engineering',
    'Name of the College': 'Northfield Institute',
    'BE / B.Tech Aggregate Percentage': '79.8',
    'CGPA (till last semester)': '8.4',
    '10th Percentage': '91.2',
    '12th / Diploma Percentage': '88',
    'Date of Birth': '2005-03-14',
    'Active backlogs': '0',
    'Passing Year': '2027'
  });
});

test('prefill: questions it cannot answer are listed with a reason, never guessed', () => {
  const { result } = mapped();
  const reasons = {};
  result.manual.forEach((m) => { reasons[m.question] = m.reason; });
  assert.deepEqual(reasons, {
    "Father's Name": 'Not in your profile',
    'Upload your resume (PDF)': 'Upload the file yourself',
    'Why do you want to join us?': 'Not in your profile',
    'Preferred location': 'Not in your profile'
  });
});

test('prefill: a choice answer must be one of the options', () => {
  assert.equal(PdPrefill.pickOption(['Computer Engineering', 'Information Technology'], 'Computer', ['CS', 'Comp']), 'Computer Engineering');
  assert.equal(PdPrefill.pickOption(['CS', 'IT'], 'Computer Engineering', ['CS', 'Comp']), 'CS');
  assert.equal(PdPrefill.pickOption(['Male', 'Female'], 'female', []), 'Female');
  assert.equal(PdPrefill.pickOption(['Computer Engineering', 'Computer Science'], 'Computer', []), '', 'two options fit: left to the student');
  assert.equal(PdPrefill.pickOption(['Mechanical', 'Civil'], 'Computer', ['CS']), '');
});

test('prefill: the link carries every answer, safely encoded', () => {
  const { result } = mapped();
  const url = PdPrefill.buildUrl(form.FORM_URL + '?usp=sharing', result.answers);
  assert.ok(url.startsWith(form.FORM_URL + '?usp=pp_url&entry.1000001=Asha%20Rao&entry.1000002=122B1F045'));
  const params = new URL(url).searchParams;
  assert.equal(params.get('entry.1000003'), 'asha.rao@example.com');
  assert.equal(params.get('entry.1000013'), '2005-03-14');
  assert.equal(params.get('entry.1000016'), null, 'file upload is never pre-filled');
  assert.equal(new URL(url).pathname.endsWith('/viewform'), true, 'opens the form to view, never the submit address');
});

test('prefill: answers with special characters cannot break out of the link', () => {
  const url = PdPrefill.buildUrl(form.FORM_URL, [{ entryId: '1', value: 'A&B=C #1 ?x=y&entry.2=evil' }, { entryId: 'x; drop', value: 'ignored' }]);
  const params = new URL(url).searchParams;
  assert.equal(params.get('entry.1'), 'A&B=C #1 ?x=y&entry.2=evil');
  assert.equal(params.get('entry.2'), null);
  assert.deepEqual(Array.from(params.keys()), ['usp', 'entry.1']);
});

test('prefill: no link is built for an address that is not a Google Form', () => {
  assert.equal(PdPrefill.buildUrl('https://evil.example/forms/d/e/abcdefghijklmnop/viewform', [{ entryId: '1', value: 'x' }]), '');
});

test('prefill: an over-long set of answers stops before the link gets too long', () => {
  const answers = [];
  for (let i = 1; i <= 40; i++) answers.push({ entryId: String(i), value: 'x'.repeat(400) });
  assert.ok(PdPrefill.buildUrl(form.FORM_URL, answers).length <= 7000);
});

test('prefill: similar-looking questions go to the right field', () => {
  const pick = (title) => { const hit = PdPrefill.pickField(title, fields); return hit ? hit.field.key : ''; };
  assert.equal(pick('Name'), 'fullName');
  assert.equal(pick('Name of the Student'), 'fullName');
  assert.equal(pick("Mother's Name"), '');
  assert.equal(pick('Company Name'), '');
  assert.equal(pick('Email'), 'email');
  assert.equal(pick('Official College Mail ID'), 'collegeEmail');
  assert.equal(pick('University Roll No'), 'rollNumber');
  assert.equal(pick('Parent Mobile Number'), '');
  assert.equal(pick('SSC %'), 'tenth');
  assert.equal(pick('HSC / 12th %'), 'twelfth');
  assert.equal(pick('Year of Passing'), 'batch');
  assert.equal(pick('Current CGPA'), 'cgpa');
  assert.equal(pick('Department'), 'branch');
});

test('prefill: CGPA rule comes from settings, and a bad rule gives nothing', () => {
  assert.equal(PdPrefill.cgpaToPercent('8.4', 'x9.5'), '79.8');
  assert.equal(PdPrefill.cgpaToPercent('8.4', 'x10-7.5'), '76.5');
  assert.equal(PdPrefill.cgpaToPercent('8,4', '\u00D7 9.5'), '79.8');
  assert.equal(PdPrefill.cgpaToPercent('8.4', ''), '');
  assert.equal(PdPrefill.cgpaToPercent('8.4', 'x9.5; DROP'), '');
  assert.equal(PdPrefill.cgpaToPercent('abc', 'x9.5'), '');
  assert.equal(PdPrefill.cgpaToPercent('84', 'x9.5'), '', 'a result over 100 is not a percentage');
});

test('prefill: the copy-ready list has every filled answer and no blanks', () => {
  const sheet = PdPrefill.answerSheet(fields);
  assert.ok(sheet.some((row) => row.label === 'Full name' && row.value === 'Asha Rao'));
  assert.ok(sheet.some((row) => row.label === 'Degree percentage' && row.value === '79.8'));
  assert.ok(!sheet.some((row) => row.label === 'Diploma percentage'));
});

test('prefill: a field the student adds to the profile is used too', () => {
  const rows = profileRows.concat([['Preferred location', 'Riverton', 'location preference']]);
  const custom = PdConfig.readProfile(rows, settings).fields;
  const parsed = PdPrefill.parseForm(form.loadData);
  const result = PdPrefill.mapQuestions(parsed.questions, custom, {});
  assert.equal(result.answers.find((a) => a.question === 'Preferred location').value, 'Riverton');
});
