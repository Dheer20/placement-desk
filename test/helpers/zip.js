'use strict';

/**
 * Builds a small, valid .zip file in memory (entries are stored, not
 * compressed) so tests can exercise the attachment reader without shipping
 * binary files. Also reads such a file back, standing in for Apps Script's
 * Utilities.unzip in the fake Google services.
 */

function le16(n) { return [n & 0xff, (n >> 8) & 0xff]; }
function le32(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

/**
 * @param {Array<{name:string, text:string}>} files
 * @param {{declaredSize:(number|undefined), encrypted:(boolean|undefined)}=} tamper
 *     lets a test claim a different unpacked size or set the password flag
 * @return {Array<number>} zip bytes
 */
function makeZip(files, tamper) {
  const opts = tamper || {};
  let local = [];
  let central = [];
  for (const file of files) {
    const name = Array.from(Buffer.from(file.name, 'utf8'));
    const data = Array.from(Buffer.from(file.text, 'utf8'));
    const declared = opts.declaredSize === undefined ? data.length : opts.declaredSize;
    const flags = opts.encrypted ? 1 : 0;
    const offset = local.length;
    local = local.concat(
      le32(0x04034b50), le16(20), le16(flags), le16(0), le16(0), le16(0),
      le32(0), le32(data.length), le32(declared), le16(name.length), le16(0), name, data
    );
    central = central.concat(
      le32(0x02014b50), le16(20), le16(20), le16(flags), le16(0), le16(0), le16(0),
      le32(0), le32(data.length), le32(declared), le16(name.length), le16(0), le16(0),
      le16(0), le16(0), le32(0), le32(offset), name
    );
  }
  const end = [].concat(
    le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length),
    le32(central.length), le32(local.length), le16(0)
  );
  return local.concat(central, end);
}

/** Read back a zip made by makeZip. @return {Array<{name:string, text:string}>} */
function readZip(bytes) {
  const b = Buffer.from(bytes.map((x) => x & 0xff));
  const out = [];
  let at = 0;
  while (at + 30 <= b.length && b.readUInt32LE(at) === 0x04034b50) {
    const size = b.readUInt32LE(at + 18);
    const nameLen = b.readUInt16LE(at + 26);
    const extraLen = b.readUInt16LE(at + 28);
    const name = b.toString('utf8', at + 30, at + 30 + nameLen);
    const start = at + 30 + nameLen + extraLen;
    out.push({ name, text: b.toString('utf8', start, start + size) });
    at = start + size;
  }
  return out;
}

/** A minimal .xlsx: one sheet, values given as rows of strings or numbers. */
function makeXlsx(rows) {
  const shared = [];
  const index = (text) => {
    let i = shared.indexOf(text);
    if (i === -1) { shared.push(text); i = shared.length - 1; }
    return i;
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const col = (n) => String.fromCharCode(65 + n);
  const sheetRows = rows.map((row, r) => '<row r="' + (r + 1) + '">' + row.map((value, c) => {
    const ref = col(c) + (r + 1);
    if (value === '' || value === null) return '';
    if (typeof value === 'number') return '<c r="' + ref + '"><v>' + value + '</v></c>';
    return '<c r="' + ref + '" t="s"><v>' + index(value) + '</v></c>';
  }).join('') + '</row>').join('');
  return makeZip([
    { name: '[Content_Types].xml', text: '<Types/>' },
    { name: 'xl/workbook.xml', text: '<workbook/>' },
    { name: 'xl/sharedStrings.xml', text: '<sst>' + shared.map((s) => '<si><t>' + esc(s) + '</t></si>').join('') + '</sst>' },
    { name: 'xl/worksheets/sheet1.xml', text: '<worksheet><sheetData>' + sheetRows + '</sheetData></worksheet>' }
  ]);
}

module.exports = { makeZip, readZip, makeXlsx };
