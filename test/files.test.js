'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load.js');
const { makeZip, makeXlsx, readZip } = require('./helpers/zip.js');

const { PdFiles, PdMatch } = loadCore();

test('files: attachment kinds, including macro files that are never read', () => {
  assert.equal(PdFiles.kindOf('Shortlist.xlsx', ''), 'xlsx');
  assert.equal(PdFiles.kindOf('list', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
  assert.equal(PdFiles.kindOf('names.CSV', ''), 'csv');
  assert.equal(PdFiles.kindOf('list.docx', ''), 'docx');
  assert.equal(PdFiles.kindOf('list.pdf', ''), 'pdf');
  assert.equal(PdFiles.kindOf('list.xlsm', ''), 'macro');
  assert.equal(PdFiles.kindOf('list.xlsx', 'application/vnd.ms-excel.sheet.macroEnabled.12'), 'macro');
  assert.equal(PdFiles.kindOf('list.xls', ''), 'legacy');
  assert.equal(PdFiles.kindOf('photo.png', 'image/png'), 'image');
  assert.equal(PdFiles.kindOf('run.exe', 'application/octet-stream'), 'other');
});

test('files: a normal zip is accepted and its contents listed', () => {
  const zip = makeZip([{ name: 'a.txt', text: 'hello' }, { name: 'dir/b.txt', text: 'world!' }]);
  const info = PdFiles.zipInspect(zip);
  assert.equal(info.ok, true);
  assert.deepEqual(info.entries, [{ name: 'a.txt', size: 5 }, { name: 'dir/b.txt', size: 6 }]);
  assert.equal(info.total, 11);
});

test('files: signed bytes (as Apps Script gives them) work the same', () => {
  const zip = makeZip([{ name: 'a.txt', text: 'hello' }]).map((b) => (b > 127 ? b - 256 : b));
  assert.equal(PdFiles.zipInspect(zip).ok, true);
});

test('files: a zip that claims to unpack to a huge size is refused before unpacking', () => {
  const bomb = makeZip([{ name: 'xl/worksheets/sheet1.xml', text: 'tiny' }], { declaredSize: 2000000000 });
  const info = PdFiles.zipInspect(bomb);
  assert.equal(info.ok, false);
  assert.match(info.reason, /too large/);
});

test('files: many medium files that add up to too much are refused', () => {
  const files = [];
  for (let i = 0; i < 5; i++) files.push({ name: 'f' + i, text: 'x' });
  const info = PdFiles.zipInspect(makeZip(files, { declaredSize: 10 * 1024 * 1024 }), Object.assign({}, PdFiles.LIMITS, { maxUnzippedBytes: 30 * 1024 * 1024 }));
  assert.equal(info.ok, false);
  assert.match(info.reason, /too much data/);
});

test('files: password-protected, oversized and non-zip data are refused', () => {
  assert.match(PdFiles.zipInspect(makeZip([{ name: 'a', text: 'x' }], { encrypted: true })).reason, /password/);
  assert.match(PdFiles.zipInspect([1, 2, 3]).reason, /not a zip/);
  assert.match(PdFiles.zipInspect(Array.from(Buffer.from('this is plain text, definitely not a zip archive'))).reason, /not a zip/);
  assert.match(PdFiles.zipInspect(makeZip([{ name: 'a', text: 'x' }]), Object.assign({}, PdFiles.LIMITS, { maxBytes: 10 })).reason, /file too large/);
  assert.match(PdFiles.zipInspect(makeZip([{ name: 'a', text: 'x' }, { name: 'b', text: 'y' }]), Object.assign({}, PdFiles.LIMITS, { maxEntries: 1 })).reason, /too many files/);
});

test('files: a truncated zip is refused, not crashed on', () => {
  const zip = makeZip([{ name: 'a.txt', text: 'hello' }]);
  const cut = zip.slice(0, zip.length - 30).concat(zip.slice(zip.length - 22));
  assert.equal(PdFiles.zipInspect(cut).ok, false);
});

test('files: workbook rows are read from shared strings, numbers and inline text', () => {
  const shared = '<sst><si><t>Name</t></si><si><t>Asha Rao</t></si><si><r><t>Vik</t></r><r><t>ram Nair</t></r><rPh><t>ignored</t></rPh></si><si><t>R&amp;D &lt;lab&gt;</t></si></sst>';
  const sheet = '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>PRN</t></is></c></row>' +
    '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>72212345678</v></c><c r="D2" t="s"><v>3</v></c></row>' +
    '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="str"><f>CONCAT("a","b")</f><v>122B1F046</v></c></row>' +
    '<row r="4"><c r="A4" t="s"><v>99</v></c><c r="B4" s="1"/></row>' +
    '</sheetData></worksheet>';
  const { rows, truncated } = PdFiles.xlsxRows(shared, [sheet]);
  assert.equal(truncated, false);
  assert.deepEqual(rows, [
    ['Name', 'PRN'],
    ['Asha Rao', '72212345678', '', 'R&D <lab>'],
    ['Vikram Nair', '122B1F046'],
    ['', '']
  ]);
});

test('files: a formula cell gives its stored value and the formula is never run', () => {
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="str"><f>HYPERLINK("https://evil.example","Asha Rao")</f><v>Asha Rao</v></c></row></sheetData></worksheet>';
  const { rows } = PdFiles.xlsxRows('', [sheet]);
  assert.deepEqual(rows, [['Asha Rao']]);
});

test('files: very large workbooks stop at the row limit', () => {
  let sheet = '<worksheet><sheetData>';
  for (let i = 1; i <= 50; i++) sheet += '<row r="' + i + '"><c r="A' + i + '"><v>' + i + '</v></c></row>';
  sheet += '</sheetData></worksheet>';
  const result = PdFiles.xlsxRows('', [sheet], Object.assign({}, PdFiles.LIMITS, { maxRows: 10 }));
  assert.equal(result.rows.length, 10);
  assert.equal(result.truncated, true);
});

test('files: a built .xlsx goes through the whole path and finds the student', () => {
  const xlsx = makeXlsx([['Sr', 'Name', 'PRN'], [1, 'Vikram Nair', '122B1F046'], [2, 'RAO ASHA', '122B1F045']]);
  assert.equal(PdFiles.zipInspect(xlsx).ok, true);
  const parts = readZip(xlsx);
  const shared = parts.find((p) => p.name === 'xl/sharedStrings.xml').text;
  const sheets = parts.filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p.name)).map((p) => p.text);
  const { rows } = PdFiles.xlsxRows(shared, sheets);
  const me = PdMatch.buildIdentity({ names: ['Asha Rao'], ids: ['122B1F045'], emails: [] });
  assert.equal(PdMatch.matchRows(rows, me).status, 'found');
  const other = PdMatch.buildIdentity({ names: ['Asha Rane'], ids: ['122B1F04'], emails: [] });
  assert.equal(PdMatch.matchRows(rows, other).status, 'none');
});

test('files: Word tables and paragraphs become rows', () => {
  const xml = '<w:document><w:body>' +
    '<w:p><w:r><w:t>Shortlisted </w:t></w:r><w:r><w:t xml:space="preserve">students</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Asha</w:t></w:r><w:r><w:t> Rao</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '</w:body></w:document>';
  assert.deepEqual(PdFiles.docxRows(xml).rows, [['1', 'Asha Rao'], ['Shortlisted students']]);
});

test('files: CSV with quotes, embedded commas, blank lines and other separators', () => {
  assert.deepEqual(PdFiles.csvRows('Name,PRN\r\n"Rao, Asha",122B1F045\n\n"He said ""hi""",x\n').rows,
    [['Name', 'PRN'], ['Rao, Asha', '122B1F045'], ['He said "hi"', 'x']]);
  assert.deepEqual(PdFiles.csvRows('Name;PRN\nAsha Rao;122B1F045').rows, [['Name', 'PRN'], ['Asha Rao', '122B1F045']]);
  assert.deepEqual(PdFiles.csvRows('\uFEFFName\tPRN\nAsha Rao\t122B1F045').rows, [['Name', 'PRN'], ['Asha Rao', '122B1F045']]);
  assert.deepEqual(PdFiles.csvRows('').rows, []);
});

test('files: XML entities decode, and nonsense entities are dropped', () => {
  assert.equal(PdFiles.xmlDecode('A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos; &#65;&#x42;'), 'A & B <c> "d" \'e\' AB');
  assert.equal(PdFiles.xmlDecode('x&#99999999999;y&#0;z'), 'xyz');
});
