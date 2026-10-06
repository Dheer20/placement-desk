/**
 * @fileoverview Finding dates and times in email text, and converting them to
 * real instants in the user's timezone.
 *
 * Dates are kept as wall-clock parts ({y, m, d, h, mi}) until the very end,
 * because "7th October at 9:00 a.m." means 9 a.m. where the student lives,
 * not 9 a.m. on the server that happens to run the script.
 */
var PdDates = (function () {
  'use strict';

  var MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12
  };
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var DAY_MS = 86400000;

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function isValidYmd(y, m, d) {
    return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
  }

  function expandYear(text) {
    var n = parseInt(text, 10);
    return text.length <= 2 ? 2000 + n : n;
  }

  /** Whole days from a to b (b later gives a positive number). */
  function daysBetween(a, b) {
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
  }

  function addDays(ymd, n) {
    var t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d) + n * DAY_MS);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  /**
   * A day and month with no year: pick the year that puts it closest to the
   * email's own date, leaning forward (a December mail saying "5th January"
   * means next January).
   */
  function inferYear(m, d, base) {
    var y = base.y;
    var gap = daysBetween(base, { y: y, m: m, d: Math.min(d, daysInMonth(y, m)) });
    if (gap < -60) return y + 1;
    if (gap > 300) return y - 1;
    return y;
  }

  /**
   * Read a clock time from the start of `text`.
   * Understands 9:00 a.m., 7.30 pm, 1:00PM, 10 AM, 16:00, 1300 hrs, 12 noon.
   * @return {{h:number, mi:number, length:number}|null}
   */
  function parseTime(text) {
    var s = String(text || '');
    var m = /^\s*(\d{1,2})\s*(noon|midnight)\b/i.exec(s);
    if (m) {
      var twelve = parseInt(m[1], 10);
      if (twelve !== 12) return null;
      return { h: /noon/i.test(m[2]) ? 12 : 0, mi: 0, length: m[0].length };
    }
    m = /^\s*([01]\d|2[0-3])([0-5]\d)\s*(?:hrs|hours)\b/i.exec(s);
    if (m) return { h: parseInt(m[1], 10), mi: parseInt(m[2], 10), length: m[0].length };

    m = /^\s*(\d{1,2})(?:\s*[:.]\s*([0-5]\d))?\s*(a\.?\s?m\b\.?|p\.?\s?m\b\.?|hrs\b|hours\b)?/i.exec(s);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var mi = m[2] ? parseInt(m[2], 10) : 0;
    var marker = (m[3] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!m[2] && !marker) return null;
    if (marker === 'am' || marker === 'pm') {
      if (h < 1 || h > 12) return null;
      if (marker === 'pm' && h !== 12) h += 12;
      if (marker === 'am' && h === 12) h = 0;
    } else if (h > 23) {
      return null;
    }
    return { h: h, mi: mi, length: m[0].length };
  }

  /** Look just after (or just before) a date for the time that goes with it. */
  function attachTime(text, start, end, found) {
    var after = text.slice(end, end + 48);
    var lead = /^\s*\)?\s*,?\s*(?:\(?(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\)?)?\s*,?\s*(?:(?:at|till|until|upto|up to|by|before|from|@)\s+|[-\u2013]\s*)?/i.exec(after);
    var skip = lead ? lead[0].length : 0;
    var time = parseTime(after.slice(skip));
    if (time) {
      found.h = time.h; found.mi = time.mi; found.hasTime = true;
      found.length += skip + time.length;
      return;
    }
    var before = text.slice(Math.max(0, start - 28), start);
    var behind = /(\d{1,2}(?:\s*[:.]\s*[0-5]\d)?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?|hrs|hours|noon)?)\s*,?\s*(?:on|of)?\s*$/i.exec(before);
    if (behind) {
      time = parseTime(behind[1]);
      if (time) { found.h = time.h; found.mi = time.mi; found.hasTime = true; }
    }
  }

  /**
   * Find every date in a piece of text.
   * @param {string} text
   * @param {{base:{y:number,m:number,d:number}, order:(string|undefined)}} ctx
   *     base: the email's own date in the user's timezone (for "tomorrow" and
   *     for dates with no year). order: 'DMY' (default) or 'MDY' for 06-10-2026.
   * @return {!Array<{y:number,m:number,d:number,h:number,mi:number,hasTime:boolean,index:number,length:number,relative:boolean}>}
   */
  function findDates(text, ctx) {
    var s = String(text || '');
    var base = ctx.base;
    var order = ctx.order === 'MDY' ? 'MDY' : 'DMY';
    var out = [];
    var taken = [];
    var m;

    function overlaps(index, length) {
      for (var i = 0; i < taken.length; i++) {
        if (index < taken[i][1] && index + length > taken[i][0]) return true;
      }
      return false;
    }
    function push(y, mo, d, index, length, relative) {
      if (!isValidYmd(y, mo, d) || overlaps(index, length)) return;
      var found = { y: y, m: mo, d: d, h: 0, mi: 0, hasTime: false, index: index, length: length, relative: !!relative };
      attachTime(s, index, index + length, found);
      taken.push([index, index + length]);
      out.push(found);
    }

    // 7th October 2026, 30 September 2026, 8th Oct, 1st of March 26
    var dayMonth = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?' + MONTH_RE + '\\b\\.?,?(?:\\s*(\\d{4}|\'?\\d{2})(?![\\d:.]))?', 'gi');
    while ((m = dayMonth.exec(s))) {
      var d1 = parseInt(m[1], 10);
      var mo1 = MONTHS[m[2].toLowerCase()];
      var y1 = m[3] ? expandYear(m[3].replace("'", '')) : inferYear(mo1, d1, base);
      push(y1, mo1, d1, m.index, m[0].length, false);
    }

    // October 7th, 2026 / Oct 7
    var monthDay = new RegExp('\\b' + MONTH_RE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:.]\\d)(?:,?\\s*(\\d{4}))?', 'gi');
    while ((m = monthDay.exec(s))) {
      var mo2 = MONTHS[m[1].toLowerCase()];
      var d2 = parseInt(m[2], 10);
      var y2 = m[3] ? parseInt(m[3], 10) : inferYear(mo2, d2, base);
      push(y2, mo2, d2, m.index, m[0].length, false);
    }

    // 2026-10-07
    var iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(s))) {
      push(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m.index, m[0].length, false);
    }

    // 06-10-2026, 29/09/2026, 6.10.26
    var numeric = /(^|[^\d\-/.])(\d{1,2})([-/.])(\d{1,2})\3(\d{4}|\d{2})(?![\d\-/])/g;
    while ((m = numeric.exec(s))) {
      var a = parseInt(m[2], 10);
      var b = parseInt(m[4], 10);
      var index = m.index + m[1].length;
      var length = m[0].length - m[1].length;
      var day = order === 'MDY' ? b : a;
      var month = order === 'MDY' ? a : b;
      push(expandYear(m[5]), month, day, index, length, false);
    }

    // today / tomorrow / tonight, measured from the email's own date
    var relative = /\b(today|tonight|tomorrow|day after tomorrow)\b/gi;
    while ((m = relative.exec(s))) {
      var word = m[1].toLowerCase();
      var shift = word === 'tomorrow' ? 1 : (word === 'day after tomorrow' ? 2 : 0);
      var when = addDays(base, shift);
      push(when.y, when.m, when.d, m.index, m[0].length, true);
    }

    out.sort(function (p, q) { return p.index - q.index; });
    return out;
  }

  /**
   * The most useful date in a piece of text: an explicit date beats a
   * relative word ("Tomorrow, 29/09/2026" means the 29th).
   */
  function firstDate(text, ctx) {
    var all = findDates(text, ctx);
    for (var i = 0; i < all.length; i++) if (!all[i].relative) return all[i];
    return all.length ? all[0] : null;
  }

  /**
   * Offset function for a named timezone using the JavaScript engine's own
   * timezone database. Returns minutes east of UTC for a given instant.
   */
  function intlOffset(timeZone) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    });
    return function (epochMs) {
      var parts = {};
      fmt.formatToParts(new Date(epochMs)).forEach(function (p) { parts[p.type] = parseInt(p.value, 10); });
      var asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
      return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / 60000);
    };
  }

  function fixedOffset(minutes) {
    return function () { return minutes; };
  }

  /** Wall-clock parts in the user's zone -> a real instant (ms since 1970). */
  function toEpoch(parts, offsetFn) {
    var wall = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h || 0, parts.mi || 0);
    var guess = wall - offsetFn(wall) * 60000;
    return wall - offsetFn(guess) * 60000;
  }

  /** A real instant -> wall-clock parts in the user's zone. */
  function toParts(epochMs, offsetFn) {
    var t = new Date(epochMs + offsetFn(epochMs) * 60000);
    return {
      y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
      h: t.getUTCHours(), mi: t.getUTCMinutes(), hasTime: true
    };
  }

  /**
   * The instant a date stops being "upcoming". A date with no time counts
   * until the end of that day.
   */
  function endEpoch(parts, offsetFn) {
    if (parts.hasTime) return toEpoch(parts, offsetFn);
    return toEpoch({ y: parts.y, m: parts.m, d: parts.d, h: 23, mi: 59 }, offsetFn);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /** "2026-10-07" or "2026-10-07 09:00": sorts correctly as plain text. */
  function toIso(parts) {
    if (!parts) return '';
    var s = parts.y + '-' + pad(parts.m) + '-' + pad(parts.d);
    return parts.hasTime ? s + ' ' + pad(parts.h) + ':' + pad(parts.mi) : s;
  }

  /** "06-10-2026" (or "10-06-2026" for month-first), the way students type dates. */
  function toNumeric(parts, order) {
    var day = pad(parts.d);
    var month = pad(parts.m);
    return (order === 'MDY' ? month + '-' + day : day + '-' + month) + '-' + parts.y;
  }

  function fromIso(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(text || ''));
    if (!m) return null;
    return {
      y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10),
      h: m[4] ? parseInt(m[4], 10) : 0, mi: m[5] ? parseInt(m[5], 10) : 0, hasTime: !!m[4]
    };
  }

  /** "Wed 7 Oct, 9:00 AM" for people to read. */
  function toHuman(parts) {
    if (!parts) return '';
    var dow = new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
    var s = DAY_SHORT[dow] + ' ' + parts.d + ' ' + MONTH_SHORT[parts.m - 1];
    if (!parts.hasTime) return s;
    var h12 = parts.h % 12 === 0 ? 12 : parts.h % 12;
    return s + ', ' + h12 + ':' + pad(parts.mi) + (parts.h < 12 ? ' AM' : ' PM');
  }

  return {
    parseTime: parseTime,
    findDates: findDates,
    firstDate: firstDate,
    intlOffset: intlOffset,
    fixedOffset: fixedOffset,
    toEpoch: toEpoch,
    toParts: toParts,
    endEpoch: endEpoch,
    toIso: toIso,
    toNumeric: toNumeric,
    fromIso: fromIso,
    toHuman: toHuman,
    daysBetween: daysBetween,
    addDays: addDays
  };
})();
