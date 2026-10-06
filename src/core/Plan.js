/**
 * @fileoverview What the student should do next, and the short summary.
 *
 * The student's own mark on a row (applied / skip / not applicable / hidden)
 * is only ever read here. Nothing in this project writes to it.
 */
var PdPlan = (function () {
  'use strict';

  var MARKS = ['', 'Applied', 'Skip', 'Not applicable', 'Hidden'];
  var LIST_TEXT = {
    found: 'YES \u2013 you are on the list',
    possible: 'Check \u2013 possible match',
    none: 'Not on the list',
    unread: 'Could not read the file',
    '': ''
  };
  var DAY_MS = 86400000;

  function mark(value) {
    var s = PdText.fold(value);
    if (s === 'applied' || s === 'skip' || s === 'hidden') return s;
    if (s === 'not applicable' || s === 'na' || s === 'n a') return 'not applicable';
    return '';
  }

  function upcoming(iso, nowMs, offsetFn) {
    var parts = PdDates.fromIso(iso);
    return !!parts && PdDates.endEpoch(parts, offsetFn) >= nowMs;
  }

  function human(iso) {
    return PdDates.toHuman(PdDates.fromIso(iso));
  }

  /**
   * The one next step for a row, or '' when there is nothing to do.
   * @param {Object} item
   * @param {string} userMark the student's own mark on the row
   */
  function todo(item, userMark, nowMs, offsetFn) {
    var m = mark(userMark);
    if (m === 'skip' || m === 'not applicable' || m === 'hidden') return '';
    var recent = nowMs - (item.updatedMs || 0) <= 3 * DAY_MS;
    var eventSoon = upcoming(item.eventDate, nowMs, offsetFn);
    var when = item.eventDate ? ' \u2013 ' + human(item.eventDate) : '';

    if (item.shortlisted === 'found' && (eventSoon || (!item.eventDate && recent))) {
      return 'You are on the list' + (item.round ? ': ' + item.round : '') + when;
    }
    if (item.shortlisted === 'possible' && (eventSoon || recent)) return 'Check the list: possible match' + when;
    if (item.shortlisted === 'unread' && (eventSoon || recent)) return 'Open the email and check the list yourself';
    if (item.shortlisted === 'none') return '';

    if (item.kind === 'assessment' && eventSoon) return 'Take the test' + when;
    if (item.kind === 'interview' && eventSoon) return 'Interview' + when;

    if (m !== 'applied' && (item.kind === 'drive' || item.kind === 'internship' || item.kind === 'hackathon' || item.kind === 'info')) {
      if (upcoming(item.deadline, nowMs, offsetFn)) return 'Register by ' + human(item.deadline);
      if (!item.deadline && item.formUrl && nowMs - (item.updatedMs || 0) <= 7 * DAY_MS) return 'Register (no last date given)';
    }
    if (item.kind === 'talk' && eventSoon) return 'Attend' + when;
    if (m === 'applied' && eventSoon) return 'Drive' + when;
    return '';
  }

  /** Sort key: the date that makes the row urgent, soonest first. */
  function urgency(item, nowMs, offsetFn) {
    var candidates = [item.deadline, item.eventDate].filter(function (iso) { return upcoming(iso, nowMs, offsetFn); });
    candidates.sort();
    return candidates.length ? candidates[0] : '9999';
  }

  /**
   * The summary: at most six short lines, most important first.
   * @param {Array<{item:Object, mark:string, todo:string}>} rows
   * @param {{newKeys:Array<string>, nudge:string, sheetUrl:string}} extra
   * @return {{lines:Array<string>, worthSending:boolean}}
   */
  function summary(rows, extra, nowMs, offsetFn) {
    var lines = [];
    var live = rows.filter(function (r) { return r.todo; });
    live.sort(function (a, b) {
      var x = urgency(a.item, nowMs, offsetFn);
      var y = urgency(b.item, nowMs, offsetFn);
      return x < y ? -1 : (x > y ? 1 : 0);
    });
    function names(list, max) {
      var shown = list.slice(0, max).map(function (r) { return r.item.company || PdText.truncate(r.item.title, 30); });
      return shown.join(', ') + (list.length > max ? ' +' + (list.length - max) + ' more' : '');
    }
    function within(iso, hours) {
      var parts = PdDates.fromIso(iso);
      if (!parts) return false;
      var end = PdDates.endEpoch(parts, offsetFn);
      return end >= nowMs && end - nowMs <= hours * 3600000;
    }

    var onList = live.filter(function (r) { return r.item.shortlisted === 'found'; });
    if (onList.length) {
      var first = onList[0].item;
      lines.push('On a list: ' + (first.company || first.title) + (first.eventDate ? ' (' + human(first.eventDate) + ')' : '') +
        (onList.length > 1 ? ' +' + (onList.length - 1) + ' more' : ''));
    }
    var check = live.filter(function (r) { return r.item.shortlisted === 'possible' || r.item.shortlisted === 'unread'; });
    if (check.length) lines.push('Check these lists yourself: ' + names(check, 3));

    var closing = live.filter(function (r) { return /^Register by/.test(r.todo) && within(r.item.deadline, 36); });
    if (closing.length) lines.push('Closing soon: ' + names(closing, 3) + ' (first: ' + human(closing[0].item.deadline) + ')');

    var fresh = live.filter(function (r) { return (extra.newKeys || []).indexOf(r.item.key) !== -1 && onList.indexOf(r) === -1; });
    if (fresh.length) lines.push('New for you: ' + names(fresh, 3));

    var soon = live.filter(function (r) { return within(r.item.eventDate, 48) && onList.indexOf(r) === -1 && closing.indexOf(r) === -1; });
    if (soon.length) lines.push('Next 2 days: ' + names(soon, 3) + ' (' + human(soon[0].item.eventDate) + ')');

    var worthSending = lines.length > 0;
    if (extra.nudge && lines.length < 5) lines.push('Practice: ' + extra.nudge);
    if (extra.sheetUrl && lines.length < 6) lines.push('Dashboard: ' + extra.sheetUrl);
    return { lines: lines.slice(0, 6), worthSending: worthSending };
  }

  /**
   * The words shown on a Drives row for one item (tool-owned columns only).
   * Dates are written as text, so the Sheet never re-interprets them.
   */
  function display(item, todoText, offsetFn) {
    var updated = item.updatedMs ? PdDates.toParts(item.updatedMs, offsetFn) : null;
    if (updated) updated.hasTime = false;
    return {
      todo: todoText,
      company: item.company || PdText.truncate(item.title, 80),
      type: PdSubject.KIND_LABEL[item.kind] || '',
      forMe: item.forMe === 'yes' ? 'Yes' : (item.forMe === 'maybe' ? 'Maybe' : ''),
      eligible: item.eligible || '',
      deadline: human(item.deadline),
      event: human(item.eventDate),
      where: item.venue || '',
      pay: item.pay || '',
      role: item.role || '',
      list: LIST_TEXT[item.shortlisted || ''] || '',
      latest: item.latest || '',
      updated: PdDates.toHuman(updated)
    };
  }

  /**
   * Everything the Dashboard tab shows, as plain rows.
   * Link cells are {text, url} objects; everything else is text.
   * @param {Array<{item:Object, mark:string, todo:string}>} rows
   * @param {{problems:Array<string>, practice:Array<Object>, checkedMs:number}} extra
   */
  function dashboard(rows, extra, nowMs, offsetFn) {
    function byUrgency(a, b) {
      var x = urgency(a.item, nowMs, offsetFn);
      var y = urgency(b.item, nowMs, offsetFn);
      return x < y ? -1 : (x > y ? 1 : 0);
    }
    function link(text, url) {
      return url ? { text: text, url: url } : '';
    }
    function when(item) {
      var u = urgency(item, nowMs, offsetFn);
      return u === '9999' ? '' : human(u);
    }
    function name(item) {
      return item.company || PdText.truncate(item.title, 60);
    }

    var todos = rows.filter(function (r) { return r.todo; }).sort(byUrgency).slice(0, 40).map(function (r) {
      return [when(r.item), r.todo, name(r.item), link('Open form', r.item.prefillUrl || r.item.formUrl), link('Open email', r.item.mailUrl)];
    });

    var horizon = nowMs + 14 * DAY_MS;
    var coming = rows.filter(function (r) {
      var m = mark(r.mark);
      if (m === 'skip' || m === 'not applicable' || m === 'hidden') return false;
      var parts = PdDates.fromIso(r.item.eventDate);
      if (!parts) return false;
      var end = PdDates.endEpoch(parts, offsetFn);
      return end >= nowMs && end <= horizon;
    }).sort(function (a, b) { return a.item.eventDate < b.item.eventDate ? -1 : 1; }).slice(0, 25).map(function (r) {
      return [human(r.item.eventDate), PdSubject.KIND_LABEL[r.item.kind] || '', name(r.item), r.item.venue || '', mark(r.mark) === 'applied' ? 'Applied' : ''];
    });

    var practice = (extra.practice || []).filter(function (p) { return p.name && p.days !== '' && p.status && p.status !== 'On track'; })
      .sort(function (a, b) { return b.cold - a.cold; }).slice(0, 8).map(function (p) {
        return [p.name, p.status, p.task && PdText.safeUrl(p.task) ? link('Open task', PdText.safeUrl(p.task)) : (p.task || '')];
      });

    var checked = PdDates.toParts(extra.checkedMs || nowMs, offsetFn);
    return {
      title: 'Placement Desk',
      checked: 'Last checked: ' + PdDates.toHuman(checked),
      problems: extra.problems || [],
      sections: [
        { title: 'To do', header: ['When', 'What', 'Company', 'Form', 'Email'], rows: todos, empty: 'Nothing to do right now.' },
        { title: 'Coming up (next 14 days)', header: ['When', 'What', 'Company', 'Where', 'Your mark'], rows: coming, empty: 'Nothing scheduled.' },
        { title: 'Practice that has gone cold', header: ['Skill', 'Status', 'Next task'], rows: practice, empty: 'Nothing has gone cold. To track a skill, put a date under Practice > Last practised.' }
      ]
    };
  }

  return {
    MARKS: MARKS, LIST_TEXT: LIST_TEXT, mark: mark, todo: todo, urgency: urgency,
    summary: summary, upcoming: upcoming, display: display, dashboard: dashboard
  };
})();
