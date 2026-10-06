/**
 * @fileoverview Reading and writing the Sheet.
 *
 * Two rules hold everywhere in this file:
 *   1. Text from emails is written through PdText.safeCell into cells that
 *      are formatted as plain text, so it can never run as a formula.
 *   2. The student's own columns (My mark, My notes) are read but never
 *      written. Tool columns and student columns are separate ranges.
 */
var PdStore = (function () {
  'use strict';

  var TAB = {
    dashboard: 'Dashboard', drives: 'Drives', lists: 'List checks', practice: 'Practice',
    profile: 'Profile', settings: 'Settings', log: 'Log', seen: '_seen'
  };

  var DRIVE_HEAD = [
    'My mark', 'To do', 'Company', 'Type', 'For me', 'Who it is for', 'Register by', 'Happening on',
    'Where', 'Pay', 'Role', 'On the list?', 'Latest email', 'Form', 'Email', 'Updated', 'My notes', '_key', '_data'
  ];
  // 1-based column numbers on the Drives tab.
  var COL = { mark: 1, text: 2, textCount: 12, form: 14, email: 15, updated: 16, notes: 17, key: 18, data: 19 };
  var LIST_HEAD = ['Checked', 'Company', 'Round', 'Looked in', 'Result', 'Matched by'];
  var PRACTICE_HEAD = ['Skill', 'Practise every (days)', 'Last practised', 'Days since', 'Status', 'Next task (link or note)', 'My notes'];
  var LOG_HEAD = ['When', 'Run', 'Emails found', 'New emails', 'Rows added', 'Rows updated', 'Left out', 'Never opened', 'Problems', 'Note'];
  var MAX_SEEN = 20000;

  function book() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  function sheet(name) {
    return book().getSheetByName(name);
  }

  function plainText(range) {
    range.setNumberFormat('@');
    return range;
  }

  function writeHeader(sh, head) {
    plainText(sh.getRange(1, 1, 1, head.length)).setValues([head]).setFontWeight('bold').setBackground('#e8eaed');
    sh.setFrozenRows(1);
  }

  function ensure(name, head, index) {
    var sh = sheet(name);
    if (!sh) {
      sh = book().insertSheet(name, index);
      if (head) {
        plainText(sh.getRange(1, 1, sh.getMaxRows(), head.length));
        writeHeader(sh, head);
      }
    }
    return sh;
  }

  /**
   * Create any missing tabs. Existing tabs and everything typed into them
   * are left exactly as they are, so this is safe to run again at any time.
   */
  function ensureTabs() {
    var created = [];
    function make(name, head, index, fill) {
      if (sheet(name)) return;
      var sh = ensure(name, head, index);
      created.push(name);
      if (fill) fill(sh);
    }

    make(TAB.dashboard, null, 0, function (sh) {
      plainText(sh.getRange(1, 1, sh.getMaxRows(), 5));
      sh.getRange(1, 1).setValue('Placement Desk').setFontWeight('bold').setFontSize(14);
      sh.getRange(2, 1).setValue('Fill in the Settings and Profile tabs, then choose Placement Desk > Check my email now.');
      sh.setColumnWidth(1, 170).setColumnWidth(2, 380).setColumnWidth(3, 240).setColumnWidth(4, 110).setColumnWidth(5, 110);
    });

    make(TAB.drives, DRIVE_HEAD, 1, function (sh) {
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(PdPlan.MARKS.filter(function (m) { return m !== ''; }), true)
        .setAllowInvalid(true).build();
      sh.getRange(2, COL.mark, sh.getMaxRows() - 1, 1).setDataValidation(rule);
      sh.hideColumns(COL.key, 2);
      sh.setColumnWidth(COL.mark, 110).setColumnWidth(2, 260).setColumnWidth(3, 200).setColumnWidth(13, 320).setColumnWidth(COL.notes, 220);
      var listColumn = sh.getRange(2, 12, sh.getMaxRows() - 1, 1);
      sh.setConditionalFormatRules([
        SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('YES').setBackground('#d9ead3').setBold(true).setRanges([listColumn]).build(),
        SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('Check').setBackground('#fff2cc').setRanges([listColumn]).build()
      ]);
    });

    make(TAB.lists, LIST_HEAD, 2);

    make(TAB.practice, PRACTICE_HEAD, 3, function (sh) {
      var rows = PdCoach.STARTER_SKILLS.map(function (s) { return [s[0], String(s[1]), '', '', '', '', '']; });
      sh.getRange(2, 1, rows.length, PRACTICE_HEAD.length).setValues(rows);
      sh.setColumnWidth(1, 240).setColumnWidth(6, 280);
    });

    make(TAB.profile, ['Field', 'Your answer', 'Also asked as (optional)', 'Tip'], 4, function (sh) {
      var rows = PdPrefill.FIELDS.map(function (f) { return [f.label, '', '', '']; });
      PdConfig.PROFILE_EXTRA.forEach(function (f) { rows.push([f.label, '', '', f.help]); });
      rows[0][3] = 'Exactly as it appears on college lists. This is what shortlists are checked for.';
      sh.getRange(2, 1, rows.length, 4).setValues(rows);
      sh.setColumnWidth(1, 240).setColumnWidth(2, 260).setColumnWidth(3, 220).setColumnWidth(4, 420);
    });

    make(TAB.settings, ['Setting', 'Value', 'What it does'], 5, function (sh) {
      var rows = PdConfig.SETTINGS.map(function (s) { return [s.label, s.value, s.help]; });
      sh.getRange(2, 1, rows.length, 3).setValues(rows);
      sh.setColumnWidth(1, 330).setColumnWidth(2, 300).setColumnWidth(3, 560);
    });

    make(TAB.log, LOG_HEAD, 6);

    make(TAB.seen, ['id', 'ms'], 7, function (sh) { sh.hideSheet(); });
    return created;
  }

  function tableRows(name, columns) {
    var sh = sheet(name);
    if (!sh) return [];
    var last = sh.getLastRow();
    if (last < 2) return [];
    return sh.getRange(2, 1, last - 1, columns).getValues();
  }

  function readSettingsRows() {
    return tableRows(TAB.settings, 2);
  }

  function readProfileRows() {
    return tableRows(TAB.profile, 3);
  }

  /**
   * Every row on the Drives tab.
   * @return {Array<{row:number, mark:string, key:string, item:(Object|null)}>}
   */
  function readDrives() {
    var values = tableRows(TAB.drives, DRIVE_HEAD.length);
    return values.map(function (v, i) {
      var item = null;
      var key = String(v[COL.key - 1] || '');
      if (key) {
        try {
          var parsed = JSON.parse(String(v[COL.data - 1] || ''));
          if (parsed && typeof parsed === 'object' && parsed.key === key) item = parsed;
        } catch (e) {
          item = null;
        }
      }
      return { row: i + 2, mark: String(v[COL.mark - 1] || ''), key: key, item: item };
    });
  }

  function linkCell(text, url) {
    var builder = SpreadsheetApp.newRichTextValue().setText(url ? text : '');
    if (url) builder.setLinkUrl(url);
    return builder.build();
  }

  /**
   * Write the tool-owned columns for the given rows and append new rows.
   * Rows the student added by hand (no hidden key) keep whatever they hold.
   * @param {Array<{row:number, item:Object, todo:string}>} entries row is 0 for a new row
   * @param {function(number):number} offsetFn
   */
  function writeDrives(entries, offsetFn) {
    var sh = sheet(TAB.drives);
    if (!sh || !entries.length) return;
    var last = Math.max(sh.getLastRow(), 1);
    var next = last + 1;
    entries.forEach(function (e) { if (!e.row) e.row = next++; });
    var count = next - 2;
    if (count < 1) return;
    if (next - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), next - 1 - sh.getMaxRows());

    var textRange = sh.getRange(2, COL.text, count, COL.textCount);
    var linkRange = sh.getRange(2, COL.form, count, 2);
    var updatedRange = sh.getRange(2, COL.updated, count, 1);
    var hiddenRange = sh.getRange(2, COL.key, count, 2);
    var text = textRange.getValues();
    var links = linkRange.getRichTextValues();
    var updated = updatedRange.getValues();
    var hidden = hiddenRange.getValues();

    entries.forEach(function (e) {
      var i = e.row - 2;
      var d = PdPlan.display(e.item, e.todo, offsetFn);
      text[i] = [d.todo, d.company, d.type, d.forMe, d.eligible, d.deadline, d.event, d.where, d.pay, d.role, d.list, d.latest].map(PdText.safeCell);
      links[i] = [
        linkCell('Open form', PdText.safeUrl(e.item.prefillUrl || e.item.formUrl)),
        linkCell('Open email', PdText.safeUrl(e.item.mailUrl))
      ];
      updated[i] = [PdText.safeCell(d.updated)];
      hidden[i] = [PdText.safeCell(e.item.key), PdText.safeCell(JSON.stringify(e.item))];
    });

    plainText(textRange).setValues(text);
    linkRange.setRichTextValues(links);
    plainText(updatedRange).setValues(updated);
    plainText(hiddenRange).setValues(hidden);
  }

  /** Delete the given rows of the Drives tab (whole rows, bottom first). */
  function deleteDriveRows(rowNumbers) {
    var sh = sheet(TAB.drives);
    if (!sh) return;
    rowNumbers.slice().sort(function (a, b) { return b - a; }).forEach(function (row) { sh.deleteRow(row); });
  }

  function appendRows(name, head, rows) {
    if (!rows.length) return;
    var sh = sheet(name) || ensure(name, head);
    var start = Math.max(sh.getLastRow(), 1) + 1;
    var safe = rows.map(function (r) { return r.map(PdText.safeCell); });
    plainText(sh.getRange(start, 1, safe.length, head.length)).setValues(safe);
  }

  function appendListChecks(rows) {
    appendRows(TAB.lists, LIST_HEAD, rows);
  }

  function appendLog(row) {
    appendRows(TAB.log, LOG_HEAD, [row]);
    var sh = sheet(TAB.log);
    if (sh && sh.getLastRow() > 600) sh.deleteRows(2, 200);
  }

  /** Message ids already handled: {id: time handled in ms}. */
  function readSeen() {
    var seen = Object.create(null);
    tableRows(TAB.seen, 2).forEach(function (r) {
      var id = String(r[0] || '');
      if (id) seen[id] = Number(r[1]) || 0;
    });
    return seen;
  }

  function writeSeen(seen) {
    var sh = sheet(TAB.seen) || ensure(TAB.seen, ['id', 'ms']);
    var rows = Object.keys(seen).map(function (id) { return [id, String(seen[id])]; });
    rows.sort(function (a, b) { return Number(b[1]) - Number(a[1]); });
    rows = rows.slice(0, MAX_SEEN);
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, 2).clearContent();
    if (rows.length) plainText(sh.getRange(2, 1, rows.length, 2)).setValues(rows);
  }

  function readPractice() {
    return tableRows(TAB.practice, PRACTICE_HEAD.length).map(function (r) {
      return { name: r[0], everyDays: r[1], last: r[2], task: String(r[5] || '') };
    });
  }

  /** Write only the two tool columns (Days since, Status) on the Practice tab. */
  function writePractice(rows) {
    var sh = sheet(TAB.practice);
    if (!sh || !rows.length) return;
    var values = rows.map(function (r) { return [PdText.safeCell(r.days === '' ? '' : String(r.days)), PdText.safeCell(r.status)]; });
    plainText(sh.getRange(2, 4, values.length, 2)).setValues(values);
  }

  /** Redraw the Dashboard tab. It is tool-owned: nothing typed there is kept. */
  function writeDashboard(model) {
    var sh = sheet(TAB.dashboard) || ensure(TAB.dashboard, null, 0);
    var width = 5;
    var text = [];
    var rich = [];
    var bold = [];
    function push(cells, isBold) {
      var row = [];
      var links = [];
      for (var c = 0; c < width; c++) {
        var cell = c < cells.length ? cells[c] : '';
        if (cell && typeof cell === 'object') { row.push(''); links.push(cell); } else { row.push(PdText.safeCell(cell)); links.push(null); }
      }
      text.push(row);
      rich.push(links);
      bold.push(!!isBold);
    }

    push([model.title], true);
    push([model.checked]);
    model.problems.forEach(function (p) { push(['Fix: ' + p]); });
    model.sections.forEach(function (section) {
      push(['']);
      push([section.title], true);
      if (!section.rows.length) { push([section.empty]); return; }
      push(section.header, true);
      section.rows.forEach(function (r) { push(r); });
    });
    push(['']);
    push(['This tab is redrawn on every check. Keep your own notes in Drives > My notes.']);

    sh.clear();
    var range = plainText(sh.getRange(1, 1, text.length, width));
    range.setValues(text);
    for (var r = 0; r < text.length; r++) {
      if (bold[r]) sh.getRange(r + 1, 1, 1, width).setFontWeight('bold');
      for (var c = 0; c < width; c++) {
        var link = rich[r][c];
        if (link && PdText.safeUrl(link.url)) sh.getRange(r + 1, c + 1).setRichTextValue(linkCell(link.text, PdText.safeUrl(link.url)));
      }
    }
    sh.getRange(1, 1).setFontSize(14);
  }

  return {
    TAB: TAB,
    COL: COL,
    DRIVE_HEAD: DRIVE_HEAD,
    book: book,
    sheet: sheet,
    ensureTabs: ensureTabs,
    readSettingsRows: readSettingsRows,
    readProfileRows: readProfileRows,
    readDrives: readDrives,
    writeDrives: writeDrives,
    deleteDriveRows: deleteDriveRows,
    appendListChecks: appendListChecks,
    appendLog: appendLog,
    readSeen: readSeen,
    writeSeen: writeSeen,
    readPractice: readPractice,
    writePractice: writePractice,
    writeDashboard: writeDashboard
  };
})();
