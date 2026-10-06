/**
 * @fileoverview Keys that decide when two emails are about the same thing,
 * and the rules for folding a new email into an existing dashboard row.
 *
 * A placement cell sends a drive notice, then a reminder, then a shortlist,
 * then interview timings. Those are four emails and one row.
 */
var PdDedupe = (function () {
  'use strict';

  var LEGAL_SUFFIX = { pvt: 1, private: 1, limited: 1, ltd: 1, llp: 1, inc: 1, plc: 1, corp: 1 };
  var SHORTLIST_RANK = { '': 0, none: 1, unread: 2, possible: 3, found: 4 };

  /**
   * "ParentPay India Private Limited", "ParentPay India Pvt. Ltd." and
   * "ParentPay (UK group)" all give "parentpay".
   */
  function companyKey(name) {
    var tokens = PdText.words(String(name || '').replace(/\([^)]*\)/g, ' '));
    while (tokens.length > 1 && Object.prototype.hasOwnProperty.call(LEGAL_SUFFIX, tokens[tokens.length - 1])) tokens.pop();
    if (tokens.length > 1 && tokens[tokens.length - 1] === 'india' && tokens[tokens.length - 2] !== 'of') tokens.pop();
    return tokens.join(' ');
  }

  /** One dashboard row per company and track (placement or internship). */
  function itemKey(parsed) {
    if (parsed.companyKey) return parsed.companyKey + '|' + (parsed.track || 'placement');
    return 'misc|' + PdText.fold(parsed.title || parsed.subject || '').slice(0, 60);
  }

  /** Message ids not seen before, in their original order, without repeats. */
  function unseen(ids, seen) {
    var out = [];
    var mark = Object.create(null);
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i]);
      if (!id || mark[id] || Object.prototype.hasOwnProperty.call(seen, id)) continue;
      mark[id] = true;
      out.push(id);
    }
    return out;
  }

  /** Forget message ids older than `keepDays` so the list cannot grow forever. */
  function pruneSeen(seen, nowMs, keepDays) {
    var out = {};
    var cutoff = nowMs - keepDays * 86400000;
    Object.keys(seen).forEach(function (id) {
      if (seen[id] >= cutoff) out[id] = seen[id];
    });
    return out;
  }

  /**
   * The row a follow-up email belongs to when its own key has no row yet:
   * the same company's most recently updated row, whatever its track.
   * @param {Object<string, Object>} items stored items by key
   * @return {{key:string, track:string}|null}
   */
  function findRow(items, companyKey, wantedKey) {
    if (!companyKey || items[wantedKey]) return null;
    var best = null;
    Object.keys(items).forEach(function (key) {
      if (key.indexOf(companyKey + '|') !== 0) return;
      if (!best || (items[key].updatedMs || 0) > (items[best].updatedMs || 0)) best = key;
    });
    return best ? { key: best, track: items[best].track } : null;
  }

  function pick(next, prev) {
    return next === undefined || next === null || next === '' ? (prev === undefined ? '' : prev) : next;
  }

  /**
   * Fold a newly parsed email into the row that already exists for it.
   * Only tool-owned fields are produced here; the user's own columns
   * (status, notes) are not part of an item and are never touched.
   *
   * @param {Object|null} existing the stored item, or null for a new row
   * @param {Object} incoming the item built from the new email
   * @return {Object} the merged item
   */
  function mergeItem(existing, incoming) {
    if (!existing) return incoming;
    var newer = (incoming.updatedMs || 0) >= (existing.updatedMs || 0);
    var a = newer ? incoming : existing;
    var b = newer ? existing : incoming;
    var merged = {
      key: existing.key,
      track: existing.track,
      company: pick(existing.company, incoming.company),
      kind: pick(a.kind, b.kind),
      title: pick(a.title, b.title),
      eligible: pick(a.eligible, b.eligible),
      forMe: pick(a.forMe, b.forMe),
      deadline: pick(a.deadline, b.deadline),
      eventDate: pick(a.eventDate, b.eventDate),
      venue: pick(a.venue, b.venue),
      pay: pick(a.pay, b.pay),
      role: pick(a.role, b.role),
      round: pick(a.round, b.round),
      formUrl: pick(a.formUrl, b.formUrl),
      prefillUrl: pick(a.prefillUrl, b.prefillUrl),
      mailUrl: pick(a.mailUrl, b.mailUrl),
      latest: pick(a.latest, b.latest),
      firstSeenMs: Math.min(existing.firstSeenMs || incoming.firstSeenMs || 0, incoming.firstSeenMs || existing.firstSeenMs || 0),
      updatedMs: Math.max(existing.updatedMs || 0, incoming.updatedMs || 0),
      shortlisted: existing.shortlisted || '',
      shortlistDay: existing.shortlistDay || ''
    };
    // A drive notice arriving after its own shortlist must not wipe the stage.
    if (incoming.kind === 'drive' || incoming.kind === 'internship') {
      if (existing.kind && existing.kind !== 'drive' && existing.kind !== 'internship' && existing.kind !== 'info') {
        merged.kind = existing.kind;
        merged.latest = existing.latest;
      }
    }
    if (incoming.shortlisted) {
      var sameDay = incoming.shortlistDay && incoming.shortlistDay === existing.shortlistDay;
      var stronger = SHORTLIST_RANK[incoming.shortlisted] >= SHORTLIST_RANK[existing.shortlisted || ''];
      // Three lists for three slots arrive on one day: being in any one counts.
      if (!sameDay || stronger) {
        if (!sameDay && !newer) {
          // an older list never replaces a newer result
        } else {
          merged.shortlisted = incoming.shortlisted;
          merged.shortlistDay = incoming.shortlistDay || '';
        }
      }
    }
    return merged;
  }

  return {
    companyKey: companyKey,
    itemKey: itemKey,
    unseen: unseen,
    pruneSeen: pruneSeen,
    findRow: findRow,
    mergeItem: mergeItem
  };
})();
