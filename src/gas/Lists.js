/**
 * @fileoverview Checking a shortlist email for the student's own name.
 *
 * Attachments are opened only to look for the student's name, roll number
 * or email address. Their contents are not written anywhere.
 */
var PdLists = (function () {
  'use strict';

  var MAX_ATTACHMENTS = 6;
  var SCREENSHOT_BYTES = 60 * 1024;

  function entryText(blobs, pattern) {
    var out = [];
    blobs.forEach(function (blob) {
      if (pattern.test(blob.getName())) out.push({ name: blob.getName(), text: blob.getDataAsString('UTF-8') });
    });
    out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return out.map(function (e) { return e.text; });
  }

  /** Rows of text from one attachment, or null when it cannot be read safely. */
  function rowsFrom(messageId, attachment) {
    var kind = PdFiles.kindOf(attachment.filename, attachment.mimeType);
    if (kind !== 'xlsx' && kind !== 'docx' && kind !== 'csv' && kind !== 'txt') return null;
    if (!attachment.attachmentId || attachment.size > PdFiles.LIMITS.maxBytes) return null;

    var bytes = PdMail.attachmentBytes(messageId, attachment.attachmentId);
    if (bytes.length > PdFiles.LIMITS.maxBytes) return null;
    if (kind === 'csv' || kind === 'txt') {
      return PdFiles.csvRows(Utilities.newBlob(bytes).getDataAsString('UTF-8')).rows;
    }

    // Read the zip's own table of contents first; refuse anything oversized.
    if (!PdFiles.zipInspect(bytes).ok) return null;
    var blobs = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip'));
    if (kind === 'docx') {
      var doc = entryText(blobs, /^word\/document\.xml$/);
      return doc.length ? PdFiles.docxRows(doc[0]).rows : null;
    }
    var shared = entryText(blobs, /^xl\/sharedStrings\.xml$/);
    var sheets = entryText(blobs, /^xl\/worksheets\/sheet\d+\.xml$/);
    if (!sheets.length) return null;
    return PdFiles.xlsxRows(shared.length ? shared[0] : '', sheets).rows;
  }

  /** Would a person have to open this attachment to see the list? */
  function needsEyes(attachment) {
    var kind = PdFiles.kindOf(attachment.filename, attachment.mimeType);
    // A spreadsheet or document that reached here was refused or unreadable.
    if (kind === 'pdf' || kind === 'legacy' || kind === 'macro' || kind === 'xlsx' || kind === 'docx' || kind === 'csv') return true;
    // Small images are signature logos; a large one may be a photo of the list.
    return kind === 'image' && attachment.size > SCREENSHOT_BYTES;
  }

  /**
   * @param {string} messageId
   * @param {{text:string, tables:Array, attachments:Array<Object>}} content
   * @return {{status:string, via:string, lookedIn:string}}
   */
  function check(messageId, content, identity) {
    var tables = content.tables && content.tables.length ? [content.tables] : [];
    var unreadable = 0;
    var read = 0;
    (content.attachments || []).slice(0, MAX_ATTACHMENTS).forEach(function (attachment) {
      var rows;
      try {
        rows = rowsFrom(messageId, attachment);
      } catch (e) {
        rows = null;
      }
      if (rows) { tables.push(rows); read++; } else if (needsEyes(attachment)) unreadable++;
    });
    var result = PdPipeline.checkList(content.text, tables, unreadable, identity);
    var lookedIn = 'Email text';
    if (read) lookedIn += ' + ' + read + ' attached file' + (read > 1 ? 's' : '');
    if (unreadable) lookedIn += ' (' + unreadable + ' could not be read)';
    return { status: result.status, via: result.via, lookedIn: lookedIn };
  }

  return { check: check };
})();
