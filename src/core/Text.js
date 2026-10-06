/**
 * @fileoverview Text helpers: normalising, escaping and making untrusted
 * email text safe to show in a Sheet or an HTML page.
 *
 * Everything that comes out of an email is untrusted input. Nothing in this
 * project writes email text anywhere without passing through one of these.
 */
var PdText = (function () {
  'use strict';

  var MAX_CELL = 1500;
  var MAX_URL = 2000;

  /** Trim, collapse whitespace and fold look-alike Unicode forms together. */
  function normalise(value) {
    if (value === null || value === undefined) return '';
    var s = String(value);
    if (s.normalize) s = s.normalize('NFKC');
    return s
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Comparison form: lower case, no accents, punctuation turned into spaces.
   * "  RAO,  Asha K. " and "rao asha k" fold to the same string.
   */
  function fold(value) {
    var s = normalise(value).toLowerCase();
    if (s.normalize) s = s.normalize('NFKD').replace(/[\u0300-\u036F]/g, '');
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** Fold and split into whole words. */
  function words(value) {
    var folded = fold(value);
    return folded ? folded.split(' ') : [];
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(value, max) {
    var s = String(value === null || value === undefined ? '' : value);
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + '\u2026';
  }

  /**
   * Make a value safe to write into a spreadsheet cell.
   *
   * A cell whose text starts with = + - or @ is run as a formula, so an email
   * subject like `=IMPORTXML(...)` could pull data out of the Sheet. A leading
   * apostrophe makes Sheets store the text as text.
   */
  function safeCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Object.prototype.toString.call(value) === '[object Date]') return value;
    var s = String(value)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\r\n?/g, '\n');
    s = truncate(s, MAX_CELL);
    // Checked on a real Sheet: formatting a cell as plain text does NOT stop
    // "=1+1" becoming a formula; only the leading apostrophe does. A value
    // that itself starts with an apostrophe gets one too, or Sheets would
    // swallow it.
    if (/^[=+\-@\t\n']/.test(s)) s = "'" + s;
    return s;
  }

  /** Only http(s) links without spaces or control characters are kept. */
  function safeUrl(value) {
    var s = String(value === null || value === undefined ? '' : value).trim();
    if (!s || s.length > MAX_URL) return '';
    // eslint-disable-next-line no-control-regex
    if (/[\s\u0000-\u001F"<>\\^`{|}]/.test(s)) return '';
    if (!/^https?:\/\/[^/?#]+/i.test(s)) return '';
    return s;
  }

  /** Host name of a URL in lower case, or '' when it is not a safe URL. */
  function hostOf(url) {
    var safe = safeUrl(url);
    if (!safe) return '';
    var m = /^https?:\/\/([^/?#]+)/i.exec(safe);
    if (!m) return '';
    var host = m[1].toLowerCase();
    if (host.indexOf('@') !== -1) return '';
    return host.replace(/:\d+$/, '');
  }

  /** Split "a, b ; c" style config values into trimmed non-empty parts. */
  function splitList(value) {
    return String(value === null || value === undefined ? '' : value)
      .split(/[,;\n]/)
      .map(normalise)
      .filter(function (part) { return part !== ''; });
  }

  return {
    MAX_CELL: MAX_CELL,
    normalise: normalise,
    fold: fold,
    words: words,
    escapeHtml: escapeHtml,
    truncate: truncate,
    safeCell: safeCell,
    safeUrl: safeUrl,
    hostOf: hostOf,
    splitList: splitList
  };
})();
