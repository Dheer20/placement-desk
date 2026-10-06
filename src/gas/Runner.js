/**
 * @fileoverview One check of the mailbox, start to finish.
 *
 * Order of work:
 *   1. search Gmail (read-only) with the private-mail exclusions built in;
 *   2. for each message not handled before: read the headers, drop anything
 *      private, and only then read the body;
 *   3. turn it into a dashboard row, checking any list for the student's name;
 *   4. write the tool-owned columns, redraw the Dashboard, log the counts.
 *
 * The log holds counts only. No subject, body, name or address is logged.
 */
var PdRunner = (function () {
  'use strict';

  var MAX_IDS = 400;
  var TIME_BUDGET_MS = 4.5 * 60 * 1000;
  var KEEP_SEEN_DAYS = 90;
  var REQUIRED_SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/spreadsheets.currentonly'
  ];

  /** Minutes east of UTC for the student's timezone at a given instant. */
  function offsetFor(timeZone) {
    try {
      var viaIntl = PdDates.intlOffset(timeZone);
      viaIntl(Date.now());
      return viaIntl;
    } catch (e) {
      return function (ms) {
        var z = Utilities.formatDate(new Date(ms), timeZone, 'Z');
        var m = /^([+-])(\d{2})(\d{2})$/.exec(z);
        return m ? (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) : 0;
      };
    }
  }

  function dayIso(ms, offsetFn) {
    var p = PdDates.toParts(ms, offsetFn);
    p.hasTime = false;
    return PdDates.toIso(p);
  }

  function props() {
    return PropertiesService.getDocumentProperties();
  }

  function readJson(key) {
    try {
      var parsed = JSON.parse(props().getProperty(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * @param {string} mode 'manual', 'scheduled', 'sweep' or 'catchup'
   * @param {{nowMs:(number|undefined)}=} opts
   * @return {Object} counts for the log and for the on-screen message
   */
  function run(mode, opts) {
    var startedMs = Date.now();
    var nowMs = (opts && opts.nowMs) || startedMs;
    var stats = { mode: mode, found: 0, fresh: 0, added: 0, updated: 0, leftOut: 0, neverOpened: 0, problems: 0, note: '', onList: 0, emailed: false };

    var lock = LockService.getDocumentLock();
    if (!lock.tryLock(5000)) { stats.note = 'Another check is already running.'; return stats; }
    try {
      if (ScriptApp.requireScopes) ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, REQUIRED_SCOPES);
      PdStore.ensureTabs();

      var config = PdConfig.readSettings(PdStore.readSettingsRows());
      var settings = config.settings;
      var profile = PdConfig.readProfile(PdStore.readProfileRows(), settings);
      var offsetFn = offsetFor(settings.timezone);
      var problems = config.problems.slice();
      if (PdMatch.isEmpty(profile.identity)) problems.push('Add your name or roll number in Profile, or shortlists cannot be checked.');

      // ---- 1. search -------------------------------------------------------
      var days = mode === 'sweep' || mode === 'catchup' ? settings.sweepDays : settings.lookbackDays;
      var ids = [];
      PdQueries.build(settings, days).forEach(function (q) {
        ids = ids.concat(PdMail.search(q.query, MAX_IDS));
      });
      var seen = PdStore.readSeen();
      var fresh = PdDedupe.unseen(ids, seen).reverse();
      stats.found = PdDedupe.unseen(ids, {}).length;
      stats.fresh = fresh.length;

      // ---- 2 and 3. read and understand ------------------------------------
      var stored = PdStore.readDrives();
      var rowByKey = {};
      var items = {};
      var known = [];
      stored.forEach(function (entry) {
        if (!entry.item) return;
        rowByKey[entry.key] = entry;
        items[entry.key] = entry.item;
        if (entry.item.company) known.push(entry.item.company);
      });
      var env = {
        settings: settings, identity: profile.identity, myEmails: profile.emails, offsetFn: offsetFn, knownCompanies: known,
        findRow: function (companyKey, wantedKey) { return PdDedupe.findRow(items, companyKey, wantedKey); }
      };
      var failures = readJson('failures');
      var touched = {};
      var newKeys = [];
      var listRows = [];
      var leftForNextRun = 0;

      fresh.forEach(function (id) {
        if (Date.now() - startedMs > TIME_BUDGET_MS) { leftForNextRun++; return; }
        try {
          var meta = PdMail.meta(id);
          if (PdQueries.isSensitive(meta.subject, meta.from, settings.senders)) {
            stats.neverOpened++;
            seen[id] = nowMs;
            return;
          }
          // The subject alone often settles it; then the body is never fetched.
          if (PdPipeline.toItem(meta, '', env).skip) {
            stats.leftOut++;
            seen[id] = nowMs;
            return;
          }
          var content = PdMail.content(id);
          var result = PdPipeline.toItem(meta, content.text, env);
          if (result.skip) {
            stats.leftOut++;
            seen[id] = nowMs;
            return;
          }
          var item = result.item;
          if (result.checkList) {
            var check = PdLists.check(id, content, profile.identity);
            item.shortlisted = check.status;
            item.shortlistDay = dayIso(meta.dateMs, offsetFn);
            if (check.status === 'found') stats.onList++;
            listRows.push([
              PdDates.toHuman(PdDates.toParts(nowMs, offsetFn)), item.company || item.title, item.round || '',
              check.lookedIn, PdPlan.LIST_TEXT[check.status],
              check.via === 'id' ? 'Roll number' : (check.via === 'email' ? 'Email address' : (check.via === 'name' ? 'Name' : ''))
            ]);
          }
          if (settings.autoPrefill && item.formUrl && PdPlan.upcoming(item.deadline, nowMs, offsetFn)) {
            var filled = PdForms.prefill(item.formUrl, profile.fields, settings);
            if (filled.state === 'ok') item.prefillUrl = filled.url;
          }
          var isNew = !items[item.key];
          items[item.key] = PdDedupe.mergeItem(items[item.key] || null, item);
          if (isNew) { stats.added++; newKeys.push(item.key); if (item.company) known.push(item.company); } else if (!touched[item.key]) stats.updated++;
          touched[item.key] = true;
          seen[id] = nowMs;
          delete failures[id];
        } catch (e) {
          // Try again on the next run; give up on a message after three tries.
          stats.problems++;
          failures[id] = (failures[id] || 0) + 1;
          if (failures[id] >= 3) { seen[id] = nowMs; delete failures[id]; }
        }
      });
      if (leftForNextRun) stats.note = leftForNextRun + ' emails left for the next check.';

      // ---- 4. write ---------------------------------------------------------
      // Re-read the tab so marks typed during this run are respected.
      var marks = {};
      PdStore.readDrives().forEach(function (entry) { if (entry.key) { marks[entry.key] = entry.mark; rowByKey[entry.key] = entry; } });
      var planned = Object.keys(items).map(function (key) {
        var mark = marks[key] || '';
        return { item: items[key], mark: mark, todo: PdPlan.todo(items[key], mark, nowMs, offsetFn), row: rowByKey[key] ? rowByKey[key].row : 0 };
      });
      PdStore.writeDrives(planned.map(function (p) { return { row: p.row, item: p.item, todo: p.todo }; }), offsetFn);
      PdStore.appendListChecks(listRows);
      PdStore.writeSeen(PdDedupe.pruneSeen(seen, nowMs, KEEP_SEEN_DAYS));
      props().setProperty('failures', JSON.stringify(failures));

      var today = PdDates.toParts(nowMs, offsetFn);
      var coach = PdCoach.review(PdStore.readPractice(), today, settings.order);
      PdStore.writePractice(coach.rows);
      PdStore.writeDashboard(PdPlan.dashboard(planned, { problems: problems, practice: coach.rows, checkedMs: nowMs }, nowMs, offsetFn));

      // ---- summary ------------------------------------------------------------
      var summary = PdPlan.summary(planned, { newKeys: newKeys, nudge: coach.nudge, sheetUrl: PdStore.book().getUrl() }, nowMs, offsetFn);
      stats.lines = summary.lines;
      var todayIso = dayIso(nowMs, offsetFn);
      var firstToday = props().getProperty('lastSummaryDay') !== todayIso;
      var news = newKeys.length > 0 || stats.onList > 0;
      if (settings.notify && mode !== 'manual' && summary.worthSending && (news || firstToday)) {
        try {
          var me = PdMail.myAddress();
          if (me) {
            // Plain text, and only ever to the student's own address.
            MailApp.sendEmail({ to: me, subject: 'Placement Desk: ' + PdText.truncate(summary.lines[0], 120), body: summary.lines.join('\n') });
            props().setProperty('lastSummaryDay', todayIso);
            stats.emailed = true;
          }
        } catch (e) {
          stats.note = (stats.note ? stats.note + ' ' : '') + 'Summary email not sent (permission not given).';
        }
      }

      PdStore.appendLog([
        PdDates.toHuman(today), mode, String(stats.found), String(stats.fresh), String(stats.added), String(stats.updated),
        String(stats.leftOut), String(stats.neverOpened), String(stats.problems), stats.note
      ]);
      return stats;
    } finally {
      lock.releaseLock();
    }
  }

  return { run: run, offsetFor: offsetFor, REQUIRED_SCOPES: REQUIRED_SCOPES };
})();
