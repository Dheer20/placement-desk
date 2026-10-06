/**
 * @fileoverview Reading shortlist attachments safely.
 *
 * Attachments are untrusted. The rules here:
 *   - size limits are checked before anything is unpacked (a small zip can
 *     claim to unpack to gigabytes);
 *   - .xlsx and .docx files are read as plain XML text. Formulas and macros
 *     are never run: only the values already stored in the file are read;
 *   - the text is used for one thing, checking for the student's own name,
 *     and is never stored.
 */
var PdFiles = (function () {
  'use strict';

  var LIMITS = {
    maxBytes: 8 * 1024 * 1024,
    maxEntries: 2000,
    maxUnzippedBytes: 40 * 1024 * 1024,
    maxEntryBytes: 25 * 1024 * 1024,
    maxRows: 20000,
    maxCells: 200000
  };

  /** What kind of attachment this is, from its name and type. */
  function kindOf(filename, mimeType) {
    var name = String(filename || '').toLowerCase();
    var mime = String(mimeType || '').toLowerCase();
    if (/\.xlsm$|\.xlsb$|\.docm$/.test(name) || /macroenabled/.test(mime)) return 'macro';
    if (/\.xlsx$/.test(name) || mime.indexOf('spreadsheetml.sheet') !== -1) return 'xlsx';
    if (/\.docx$/.test(name) || mime.indexOf('wordprocessingml.document') !== -1) return 'docx';
    if (/\.csv$/.test(name) || mime === 'text/csv') return 'csv';
    if (/\.txt$/.test(name) || mime === 'text/plain') return 'txt';
    if (/\.pdf$/.test(name) || mime === 'application/pdf') return 'pdf';
    if (/\.xls$|\.doc$/.test(name)) return 'legacy';
    if (/^image\//.test(mime) || /\.(?:png|jpe?g|gif|webp|heic)$/.test(name)) return 'image';
    return 'other';
  }

  function u16(bytes, at) {
    return (bytes[at] & 0xff) | ((bytes[at + 1] & 0xff) << 8);
  }

  function u32(bytes, at) {
    return ((bytes[at] & 0xff) | ((bytes[at + 1] & 0xff) << 8) | ((bytes[at + 2] & 0xff) << 16)) + (bytes[at + 3] & 0xff) * 16777216;
  }

  /**
   * Read a zip file's table of contents without unpacking it, and refuse
   * anything too large, encrypted or malformed.
   * @param {Array<number>} bytes file bytes (signed or unsigned)
   * @return {{ok:boolean, reason:string, entries:Array<{name:string,size:number}>, total:number}}
   */
  function zipInspect(bytes, limits) {
    var lim = limits || LIMITS;
    var fail = function (reason) { return { ok: false, reason: reason, entries: [], total: 0 }; };
    var n = bytes ? bytes.length : 0;
    if (n < 22) return fail('not a zip file');
    if (n > lim.maxBytes) return fail('file too large');

    var eocd = -1;
    for (var i = n - 22; i >= Math.max(0, n - 65557); i--) {
      if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) return fail('not a zip file');

    var count = u16(bytes, eocd + 10);
    var dirSize = u32(bytes, eocd + 12);
    var dirStart = u32(bytes, eocd + 16);
    if (count === 0xffff || dirStart === 0xffffffff) return fail('zip64 not supported');
    if (count > lim.maxEntries) return fail('too many files inside');
    if (dirStart + dirSize > eocd) return fail('damaged zip file');

    var entries = [];
    var total = 0;
    var at = dirStart;
    for (var e = 0; e < count; e++) {
      if (at + 46 > n || u32(bytes, at) !== 0x02014b50) return fail('damaged zip file');
      var flags = u16(bytes, at + 8);
      var size = u32(bytes, at + 24);
      var nameLen = u16(bytes, at + 28);
      var extraLen = u16(bytes, at + 30);
      var commentLen = u16(bytes, at + 32);
      if (flags & 1) return fail('password-protected file');
      if (size === 0xffffffff) return fail('zip64 not supported');
      if (size > lim.maxEntryBytes) return fail('a file inside is too large');
      if (at + 46 + nameLen > n) return fail('damaged zip file');
      var name = '';
      for (var c = 0; c < nameLen; c++) name += String.fromCharCode(bytes[at + 46 + c] & 0xff);
      total += size;
      if (total > lim.maxUnzippedBytes) return fail('unpacks to too much data');
      entries.push({ name: name, size: size });
      at += 46 + nameLen + extraLen + commentLen;
    }
    return { ok: true, reason: '', entries: entries, total: total };
  }

  function xmlDecode(text) {
    return String(text).replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, function (all, code) {
      if (code === 'lt') return '<';
      if (code === 'gt') return '>';
      if (code === 'amp') return '&';
      if (code === 'quot') return '"';
      if (code === 'apos') return "'";
      var n = code.charAt(1) === 'x' || code.charAt(1) === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!isFinite(n) || n <= 0 || n > 0x10ffff) return '';
      return String.fromCodePoint ? String.fromCodePoint(n) : String.fromCharCode(n);
    });
  }

  /** The visible text inside an OOXML fragment: the contents of its <t> tags. */
  function textRuns(fragment, tag) {
    var re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g');
    var out = '';
    var m;
    while ((m = re.exec(fragment))) out += xmlDecode(m[1]);
    return out;
  }

  function columnIndex(ref) {
    var letters = /^([A-Z]+)/i.exec(ref || '');
    if (!letters) return -1;
    var n = 0;
    var s = letters[1].toUpperCase();
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  /**
   * Rows of text from a workbook.
   * @param {string} sharedStringsXml contents of xl/sharedStrings.xml ('' if absent)
   * @param {Array<string>} sheetXmls contents of each xl/worksheets/sheetN.xml
   * @return {{rows:Array<Array<string>>, truncated:boolean}}
   */
  function xlsxRows(sharedStringsXml, sheetXmls, limits) {
    var lim = limits || LIMITS;
    var shared = [];
    var m;
    var si = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    var source = String(sharedStringsXml || '');
    while ((m = si.exec(source))) {
      shared.push(textRuns(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, ''), 't'));
    }

    var rows = [];
    var cells = 0;
    var truncated = false;
    for (var s = 0; s < sheetXmls.length && !truncated; s++) {
      var rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
      var sheet = String(sheetXmls[s] || '');
      while ((m = rowRe.exec(sheet))) {
        if (rows.length >= lim.maxRows || cells >= lim.maxCells) { truncated = true; break; }
        var row = [];
        var cellRe = /<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g;
        var c;
        while ((c = cellRe.exec(m[1]))) {
          var attrs = c[1] || '';
          var inner = c[2] || '';
          var type = (/\st="([^"]*)"/.exec(attrs) || [])[1] || 'n';
          var ref = (/\sr="([^"]*)"/.exec(attrs) || [])[1] || '';
          var value;
          if (type === 'inlineStr') {
            value = textRuns(inner, 't');
          } else {
            var v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
            var raw = v ? xmlDecode(v[1]) : '';
            if (type === 's') {
              var index = parseInt(raw, 10);
              value = index >= 0 && index < shared.length ? shared[index] : '';
            } else {
              value = raw;
            }
          }
          var col = columnIndex(ref);
          if (col < 0 || col > 500) col = row.length;
          while (row.length < col) row.push('');
          row[col] = value;
          cells++;
        }
        if (row.length) rows.push(row);
      }
    }
    return { rows: rows, truncated: truncated };
  }

  /** Rows of text from a Word document: table rows, then loose paragraphs. */
  function docxRows(documentXml, limits) {
    var lim = limits || LIMITS;
    var xml = String(documentXml || '');
    var rows = [];
    var m;
    var tr = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
    while ((m = tr.exec(xml)) && rows.length < lim.maxRows) {
      var row = [];
      var tc = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;
      var c;
      while ((c = tc.exec(m[1]))) row.push(textRuns(c[1], 'w:t'));
      if (row.length) rows.push(row);
    }
    var loose = xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g, '');
    var p = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
    while ((m = p.exec(loose)) && rows.length < lim.maxRows) {
      var text = textRuns(m[1], 'w:t');
      if (text) rows.push([text]);
    }
    return { rows: rows, truncated: rows.length >= lim.maxRows };
  }

  /** Rows from CSV text. Understands quoted cells and , ; or tab separators. */
  function csvRows(text, limits) {
    var lim = limits || LIMITS;
    var s = String(text || '').replace(/^\uFEFF/, '');
    var firstLine = s.split(/\r?\n/, 1)[0] || '';
    var delimiter = ',';
    if (firstLine.split('\t').length > firstLine.split(',').length) delimiter = '\t';
    else if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';

    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    var truncated = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (quoted) {
        if (ch === '"') {
          if (s.charAt(i + 1) === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += ch;
      } else if (ch === '"' && cell === '') {
        quoted = true;
      } else if (ch === delimiter) {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s.charAt(i + 1) === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        if (rows.length >= lim.maxRows) { truncated = true; break; }
      } else cell += ch;
    }
    if (!truncated && (cell !== '' || row.length)) { row.push(cell); rows.push(row); }
    return { rows: rows, truncated: truncated };
  }

  return {
    LIMITS: LIMITS,
    kindOf: kindOf,
    zipInspect: zipInspect,
    xmlDecode: xmlDecode,
    xlsxRows: xlsxRows,
    docxRows: docxRows,
    csvRows: csvRows
  };
})();
