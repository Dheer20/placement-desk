/**
 * @fileoverview The practice coach: which skills have gone cold.
 *
 * The student keeps a list of skills, how often each should be practised,
 * and when it was last done. This works out what is due and what to nudge.
 */
var PdCoach = (function () {
  'use strict';

  var STARTER_SKILLS = [
    ['Arrays and strings', 3], ['Linked lists, stacks, queues', 5], ['Trees and graphs', 5],
    ['Dynamic programming', 7], ['SQL queries', 7], ['OS, DBMS, networks basics', 7],
    ['Aptitude: quantitative', 4], ['Aptitude: logical reasoning', 4], ['Verbal and reading', 7],
    ['Mock interview (aloud)', 10], ['Resume and project stories', 14]
  ];

  function toYmd(value, order) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
    }
    var found = PdDates.firstDate(String(value), { base: { y: 2000, m: 1, d: 1 }, order: order });
    return found && found.y > 2000 ? { y: found.y, m: found.m, d: found.d } : null;
  }

  /**
   * @param {Array<{name:string, everyDays:*, last:*, task:string}>} skills
   * @param {{y:number,m:number,d:number}} today in the student's timezone
   * @return {{rows:Array<Object>, nudge:string}}
   */
  function review(skills, today, order) {
    var rows = [];
    (skills || []).forEach(function (skill) {
      var name = PdText.normalise(skill.name);
      if (!name) { rows.push({ name: '', days: '', status: '' }); return; }
      var every = parseInt(String(skill.everyDays), 10);
      if (!isFinite(every) || every < 1) every = 7;
      var last = toYmd(skill.last, order);
      if (!last) { rows.push({ name: name, days: '', status: 'Not started', cold: every * 2, task: skill.task || '' }); return; }
      var days = PdDates.daysBetween(last, today);
      if (days < 0) days = 0;
      var status = days < every ? 'On track' : (days < every * 2 ? 'Due' : days + ' days cold');
      rows.push({ name: name, days: days, status: status, cold: days - every, task: skill.task || '' });
    });

    // Only skills the student has started can "go cold". A new user is not
    // nagged about a list they have not touched yet.
    var due = rows.filter(function (r) { return r.name && r.days !== '' && r.status !== 'On track'; });
    due.sort(function (a, b) { return b.cold - a.cold; });
    var nudge = '';
    if (due.length) {
      var top = due[0];
      nudge = top.name + (top.days === '' ? ' (not started)' : ' (' + top.days + ' days since last time)');
      if (due.length > 1) nudge += ' +' + (due.length - 1) + ' more due';
    }
    return { rows: rows, nudge: nudge };
  }

  return { STARTER_SKILLS: STARTER_SKILLS, review: review, toYmd: toYmd };
})();
