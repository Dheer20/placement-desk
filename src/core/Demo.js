/**
 * @fileoverview "See an example first": a handful of made-up drives, dated
 * around today, run through the real pipeline so a new user can see what the
 * dashboard looks like before connecting Gmail.
 *
 * Every company and place here is invented. Example rows carry a key that
 * starts with "demo:" so they can be removed without touching real rows.
 */
var PdDemo = (function () {
  'use strict';

  var PREFIX = 'demo:';
  var EXAMPLE_LINK = 'https://example.com/';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function ordinal(n) {
    var tens = n % 100;
    if (tens >= 11 && tens <= 13) return n + 'th';
    return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  }

  function longDate(ymd) {
    return ordinal(ymd.d) + ' ' + MONTHS[ymd.m - 1] + ' ' + ymd.y;
  }

  function numericDate(ymd) {
    return (ymd.d < 10 ? '0' : '') + ymd.d + '-' + (ymd.m < 10 ? '0' : '') + ymd.m + '-' + ymd.y;
  }

  /**
   * @param {number} nowMs
   * @param {function(number):number} offsetFn
   * @return {Array<Object>} items ready for the Drives tab
   */
  function items(nowMs, offsetFn) {
    var today = PdDates.toParts(nowMs, offsetFn);
    var day = function (n) { return PdDates.addDays(today, n); };
    var settings = {
      senders: ['placements@yourcollege.example'], lists: [], batch: today.y + 1,
      branchAliases: ['CS', 'IT', 'Computer'], degreeAliases: ['BE', 'BTech'], order: 'DMY'
    };
    var batch = settings.batch;
    var examples = [
      { subject: 'Acme Robotics Recruitment drive for BE/BTech (All Branches) ' + batch + ' Batch scheduled on ' + longDate(day(2)) + ' at 9:00 a.m. at Main Campus || Role : Graduate Engineer Trainee || CTC : 6 LPA || Last date to register: ' + numericDate(day(1)) + ' till 4:00 PM ||' },
      { subject: 'Borealis Software Internship Drive for BE/BTech (CS/IT) ' + batch + ' Batch || Stipend : 20,000 per month || Role : Software Intern || Last date to register : ' + numericDate(day(3)) + ' till 6:00 PM ||' },
      { subject: 'Cobalt Analytics : List of ' + batch + ' batch shortlisted candidates for Technical Interviews on ' + longDate(day(2)) + ' at 10:30 am at Seminar Hall', shortlisted: 'found' },
      { subject: 'Dunmore Systems Online Assessment for BE/BTech (CS/IT) ' + batch + ' Batch scheduled on ' + longDate(day(1)) + ' at 7:00 pm' },
      { subject: 'Evergreen Labs : List of shortlisted students for the HR Round on ' + longDate(day(3)) + ' at 2:00 pm', shortlisted: 'unread' },
      { subject: 'Falcon Works Virtual Pre Placement Talk for BE/BTech (All Branches) ' + batch + ' Batch scheduled on ' + longDate(day(4)) + ' at 3:00 pm' }
    ];
    var env = { settings: settings, identity: PdMatch.buildIdentity({ names: [], ids: [], emails: [] }), myEmails: [], offsetFn: offsetFn, knownCompanies: [] };
    var out = [];
    examples.forEach(function (example, i) {
      var meta = { id: 'demo' + i, threadId: '', subject: example.subject, from: settings.senders[0], to: [], cc: [], dateMs: nowMs - (examples.length - i) * 3600000 };
      var result = PdPipeline.toItem(meta, '', env);
      if (result.skip) return;
      var item = result.item;
      item.key = PREFIX + item.key;
      item.latest = 'Example: ' + item.latest;
      // Placeholder links (example.com is reserved for documentation) so the
      // example shows where "Open form" and "Open email" will appear.
      item.mailUrl = EXAMPLE_LINK;
      if (item.deadline) item.formUrl = EXAMPLE_LINK;
      if (example.shortlisted) {
        item.shortlisted = example.shortlisted;
        var sent = PdDates.toParts(meta.dateMs, offsetFn);
        sent.hasTime = false;
        item.shortlistDay = PdDates.toIso(sent);
      }
      out.push(item);
    });
    return out;
  }

  function isDemoKey(key) {
    return String(key || '').indexOf(PREFIX) === 0;
  }

  return { PREFIX: PREFIX, items: items, isDemoKey: isDemoKey };
})();
