/**
 * @fileoverview Is this student on the list?
 *
 * The rule is strict on purpose: an exact name, roll number (PRN) or email
 * address only. "Devansh" is not "Dev", and roll number 1234 is not found
 * inside 12345. A wrong "you are shortlisted" is worse than a missed one,
 * because people act on it.
 *
 * Nothing about any other person on a list is ever returned or stored.
 */
var PdMatch = (function () {
  'use strict';

  var RANK = { none: 0, possible: 1, found: 2 };

  function foldId(value) {
    var s = PdText.normalise(value).toUpperCase();
    // Spreadsheets often turn long roll numbers into 1.2345E+11 or add ".0".
    if (/^\d+(?:\.\d+)?E\+?\d+$/.test(s)) {
      var n = Number(s);
      if (isFinite(n) && Math.floor(n) === n && Math.abs(n) < 9007199254740992) s = String(n);
    }
    s = s.replace(/^(\d+)\.0+$/, '$1');
    return s.replace(/[\s\-_/.]/g, '');
  }

  function sortedKey(tokens) {
    return tokens.slice().sort().join(' ');
  }

  /**
   * @param {{names:Array<string>, ids:Array<string>, emails:Array<string>}} profile
   *     names: the full name plus any other spellings the student lists.
   * @return {Object} identity used by the matchers
   */
  function buildIdentity(profile) {
    // Lookup tables with no inherited properties: a list cell that says
    // "constructor" or "toString" must not look like a match.
    var identity = {
      names: [], nameKeys: Object.create(null), phrases: [],
      ids: Object.create(null), idList: [], emails: Object.create(null), emailList: []
    };
    (profile.names || []).forEach(function (name) {
      var tokens = PdText.words(name);
      if (!tokens.length) return;
      var key = sortedKey(tokens);
      if (identity.nameKeys[key]) return;
      identity.nameKeys[key] = true;
      identity.names.push(tokens);
      identity.phrases.push(tokens.join(' '));
      if (tokens.length > 1) {
        // "Asha Rao" is also written "Rao Asha" on most lists.
        identity.phrases.push(tokens.slice(-1).concat(tokens.slice(0, -1)).join(' '));
      }
    });
    (profile.ids || []).forEach(function (id) {
      var folded = foldId(id);
      if (folded.length >= 3 && !identity.ids[folded]) { identity.ids[folded] = true; identity.idList.push(folded); }
    });
    (profile.emails || []).forEach(function (email) {
      var folded = PdText.normalise(email).toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(folded) && !identity.emails[folded]) {
        identity.emails[folded] = true;
        identity.emailList.push(folded);
      }
    });
    return identity;
  }

  function isEmpty(identity) {
    return !identity.names.length && !identity.idList.length && !identity.emailList.length;
  }

  /** One cell against the identity. */
  function matchCell(cell, identity) {
    var text = PdText.normalise(cell);
    if (!text) return { status: 'none', via: '' };
    if (identity.emails[text.toLowerCase()]) return { status: 'found', via: 'email' };
    if (identity.ids[foldId(text)]) return { status: 'found', via: 'id' };
    var tokens = PdText.words(text);
    if (!tokens.length) return { status: 'none', via: '' };
    if (identity.nameKeys[sortedKey(tokens)]) return { status: 'found', via: 'name' };
    // Every word of a two-or-more-word name is present, plus a little extra
    // (a middle name, a title): worth showing, but only as "check this".
    for (var i = 0; i < identity.names.length; i++) {
      var name = identity.names[i];
      if (name.length < 2 || tokens.length <= name.length || tokens.length > name.length + 2) continue;
      var all = name.every(function (word) { return tokens.indexOf(word) !== -1; });
      if (all) return { status: 'possible', via: 'name' };
    }
    return { status: 'none', via: '' };
  }

  function better(a, b) {
    return RANK[b.status] > RANK[a.status] ? b : a;
  }

  /**
   * A table (spreadsheet, CSV or a table in a document) against the identity.
   * Also tries neighbouring cells joined together, because lists often put
   * first name and surname in separate columns.
   * @param {Array<Array<string>>} rows
   */
  function matchRows(rows, identity) {
    var best = { status: 'none', via: '' };
    if (isEmpty(identity)) return best;
    for (var r = 0; r < rows.length && best.status !== 'found'; r++) {
      best = better(best, matchRow(rows[r] || [], identity));
    }
    return best;
  }

  /** "122B1F045" -> "999A9A999": the pattern of a roll number, not its value. */
  function shape(foldedId) {
    return foldedId.replace(/[0-9]/g, '9').replace(/[A-Z]/g, 'A');
  }

  /** Does this row carry somebody else's roll number (same pattern as mine, different value)? */
  function hasOtherId(row, identity) {
    if (!identity.idList.length) return false;
    var shapes = identity.idList.map(shape);
    return row.some(function (cell) {
      var folded = foldId(cell);
      return folded.length >= 5 && !identity.ids[folded] && shapes.indexOf(shape(folded)) !== -1;
    });
  }

  /**
   * One row of a list. A roll number or email is the strongest evidence.
   * A name on a row that carries a different roll number is a namesake, so
   * it is reported as "check this" and never as a match.
   */
  function matchRow(row, identity) {
    var byName = { status: 'none', via: '' };
    for (var c = 0; c < row.length; c++) {
      var cell = matchCell(row[c], identity);
      if (cell.status === 'found' && cell.via !== 'name') return cell;
      byName = better(byName, cell);
      for (var span = 2; span <= 3 && c + span <= row.length; span++) {
        var joined = PdText.words(row.slice(c, c + span).join(' '));
        if (joined.length && identity.nameKeys[sortedKey(joined)]) byName = { status: 'found', via: 'name' };
      }
    }
    if (byName.status === 'found' && hasOtherId(row, identity)) return { status: 'possible', via: 'name' };
    return byName;
  }

  function hasToken(haystackUpper, needleUpper) {
    for (var at = haystackUpper.indexOf(needleUpper); at !== -1; at = haystackUpper.indexOf(needleUpper, at + 1)) {
      var before = at === 0 ? '' : haystackUpper.charAt(at - 1);
      var after = haystackUpper.charAt(at + needleUpper.length);
      if (!/[A-Z0-9]/.test(before) && !/[A-Z0-9]/.test(after)) return true;
    }
    return false;
  }

  /** Free text (an email body) against the identity. */
  function matchText(text, identity) {
    var best = { status: 'none', via: '' };
    if (isEmpty(identity)) return best;
    var raw = PdText.normalise(text);
    if (!raw) return best;
    var lower = raw.toLowerCase();
    for (var e = 0; e < identity.emailList.length; e++) {
      var email = identity.emailList[e];
      var at = lower.indexOf(email);
      while (at !== -1) {
        var b = at === 0 ? '' : lower.charAt(at - 1);
        var a = lower.charAt(at + email.length);
        if (!/[a-z0-9._%+-]/.test(b) && !/[a-z0-9-]/.test(a)) return { status: 'found', via: 'email' };
        at = lower.indexOf(email, at + 1);
      }
    }
    var upper = raw.toUpperCase();
    var compact = upper.replace(/([A-Z0-9])[\s\-_/.](?=[A-Z0-9])/g, '$1');
    for (var i = 0; i < identity.idList.length; i++) {
      if (hasToken(upper, identity.idList[i]) || hasToken(compact, identity.idList[i])) return { status: 'found', via: 'id' };
    }
    var folded = ' ' + PdText.fold(raw) + ' ';
    for (var p = 0; p < identity.phrases.length; p++) {
      var phrase = identity.phrases[p];
      if (folded.indexOf(' ' + phrase + ' ') === -1) continue;
      // A single common first name inside a paragraph proves nothing.
      best = better(best, { status: phrase.indexOf(' ') === -1 ? 'possible' : 'found', via: 'name' });
    }
    return best;
  }

  return {
    buildIdentity: buildIdentity,
    isEmpty: isEmpty,
    matchCell: matchCell,
    matchRows: matchRows,
    matchText: matchText,
    better: better,
    foldId: foldId
  };
})();
