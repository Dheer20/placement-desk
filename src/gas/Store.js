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
    plainText(sh.getRange(1, 1, 1, head.length)).setValues([head]);
    styleHeader(sh, head.length);
  }

  /** The dark title row every list tab shares. Layout only. */
  function styleHeader(sh, columns) {
    sh.getRange(1, 1, 1, columns).setFontWeight('bold').setFontFamily(LOOK.font)
      .setBackground(LOOK.accent).setFontColor(LOOK.onAccent).setVerticalAlignment('middle');
    sh.setRowHeightsForced(1, 1, 30);
    sh.setFrozenRows(1);
  }

  /** Light tint on the cells the student is meant to type in. */
  function tintInputs(sh, column, columns) {
    var rows = Math.max(sh.getLastRow() - 1, 1);
    sh.getRange(2, column, rows, columns).setBackground(LOOK.input);
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

  // Widths for the Drives columns A to Q, wide enough that nothing is cut off.
  var DRIVE_WIDTHS = [120, 330, 210, 125, 65, 150, 150, 150, 170, 150, 190, 200, 380, 90, 90, 90, 240];

  /** Layout only (widths, frozen panes, colours). Never touches a value. */
  function tidyDrives(sh) {
    DRIVE_WIDTHS.forEach(function (width, i) { sh.setColumnWidth(i + 1, width); });
    sh.setFrozenRows(1);
    sh.setFrozenColumns(3);
    var rows = sh.getMaxRows() - 1;
    sh.getRange(2, COL.mark, rows, 1).clearDataValidations();
    markDropdown(sh, sh.getLastRow() - 1);
    sh.getRange(2, COL.text, rows, COL.textCount).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    // A quiet table: no gridlines, light alternate rows, one font.
    sh.setHiddenGridlines(true);
    sh.getBandings().forEach(function (banding) { banding.remove(); });
    sh.getRange(2, 1, rows, DRIVE_WIDTHS.length).setFontFamily(LOOK.font).setVerticalAlignment('middle')
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
      .setFirstRowColor(LOOK.page).setSecondRowColor(LOOK.zebra);
    sh.setRowHeightsForced(2, Math.min(rows, 200), 26);
    var listColumn = sh.getRange(2, 12, rows, 1);
    var todoColumn = sh.getRange(2, 2, rows, 1);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('YES').setBackground('#d9ead3').setBold(true).setRanges([listColumn]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('Check').setBackground('#fff2cc').setRanges([listColumn]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('Could not').setBackground('#fff2cc').setRanges([listColumn]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('You are on the list').setBackground('#d9ead3').setBold(true).setRanges([todoColumn]).build()
    ]);
  }

  /**
   * A new spreadsheet starts with one blank "Sheet1". During setup, if it is
   * still completely blank, it is removed so the Dashboard is the first tab.
   * A sheet with anything at all in it is never removed.
   */
  function removeSpareSheet() {
    var spare = sheet('Sheet1');
    if (spare && spare.getLastRow() === 0 && spare.getLastColumn() === 0 && book().getSheets().length > 1) {
      book().deleteSheet(spare);
      return true;
    }
    return false;
  }

  /** Re-apply the layout of the tool's tabs. Safe to run at any time: no value is touched. */
  function tidy() {
    var drives = sheet(TAB.drives);
    if (drives) tidyDrives(drives);
    var heads = [
      [TAB.drives, DRIVE_HEAD.length, LOOK.accent], [TAB.lists, LIST_HEAD.length, '#9ca3af'],
      [TAB.practice, PRACTICE_HEAD.length, '#9ca3af'], [TAB.profile, 4, '#f59e0b'],
      [TAB.settings, 3, '#f59e0b'], [TAB.log, LOG_HEAD.length, '#9ca3af']
    ];
    heads.forEach(function (h) {
      var sh = sheet(h[0]);
      if (!sh) return;
      styleHeader(sh, h[1]);
      sh.setTabColor(h[2]);
    });
    var profile = sheet(TAB.profile);
    if (profile) tintInputs(profile, 2, 2);
    var settings = sheet(TAB.settings);
    if (settings) tintInputs(settings, 2, 1);
    var practice = sheet(TAB.practice);
    if (practice) tintInputs(practice, 3, 1);
  }

  /** The "My mark" dropdown, on the rows that hold drives (not a thousand empty ones). */
  function markDropdown(sh, rowCount) {
    if (rowCount < 1) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(PdPlan.MARKS.filter(function (m) { return m !== ''; }), true)
      .setAllowInvalid(true).build();
    sh.getRange(2, COL.mark, rowCount, 1).setDataValidation(rule);
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

    make(TAB.dashboard, null, 0, function () {
      writeDashboard({
        title: 'Placement Desk',
        checked: 'Not checked yet',
        next: { text: 'Set up, then check your email.', tone: 'quiet' },
        problems: [],
        tiles: [
          { value: '0', label: 'To do', tone: 'accent' }, { value: '0', label: 'On a list', tone: 'quiet' },
          { value: '0', label: 'Closing within 36 hours', tone: 'quiet' }, { value: '0', label: 'Coming up in 14 days', tone: 'quiet' }
        ],
        sections: [{
          id: 'todo', title: 'Start here', header: [], rows: [], tones: [],
          empty: 'Fill in the Settings and Profile tabs, then choose Placement Desk > Check my email now. To look around first, choose See an example first.'
        }]
      });
    });

    make(TAB.drives, DRIVE_HEAD, 1, function (sh) {
      sh.hideColumns(COL.key, 2);
      tidyDrives(sh);
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
      text[i] = [d.todo, d.company, d.type, d.forMe, d.eligible, d.deadline, d.event, d.where, d.pay, d.role, d.list, d.latest];
      links[i] = [
        linkCell('Open form', PdText.safeUrl(e.item.prefillUrl || e.item.formUrl)),
        linkCell('Open email', PdText.safeUrl(e.item.mailUrl))
      ];
      updated[i] = [d.updated];
      hidden[i] = [e.item.key, JSON.stringify(e.item)];
    });

    // Everything is escaped here, once: new values, and rows that were only
    // read (a value read from a cell has lost its leading apostrophe).
    function escaped(block) {
      return block.map(function (row) { return row.map(PdText.safeCell); });
    }
    markDropdown(sh, count);
    plainText(textRange).setValues(escaped(text));
    linkRange.setRichTextValues(links);
    plainText(updatedRange).setValues(escaped(updated));
    plainText(hiddenRange).setValues(escaped(hidden));
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

  // ---- Dashboard look -------------------------------------------------------
  // One accent colour, black text, grey for secondary. Green and amber are
  // used only where they mean something (on a list / look at this soon).
  var LOOK = {
    font: 'Roboto',
    ink: '#1f2937', muted: '#6b7280', line: '#e5e7eb', page: '#ffffff', zebra: '#f8fafc',
    accent: '#1e3a5f', onAccent: '#ffffff', onAccentSoft: '#c7d5e6',
    tile: { accent: ['#e8eef5', '#1e3a5f'], good: ['#dcfce7', '#166534'], warn: ['#fef3c7', '#92400e'], quiet: ['#f3f4f6', '#374151'] },
    tone: { good: '#166534', warn: '#92400e' },
    input: '#fff8e1'
  };
  var GRID = 12;
  var GRID_WIDTH = 78;
  var MARGIN_WIDTH = 24;
  // How many grid columns each table column takes, per section.
  var SPANS = { todo: [2, 5, 3, 1, 1], coming: [2, 2, 3, 3, 2], practice: [4, 3, 5] };
  var FULL = [GRID];

  /**
   * Redraw the Dashboard tab. It is tool-owned: nothing typed there is kept.
   *
   * The tab is laid out on a 12-column grid with a margin either side, the
   * way a web page is: a title band, a row of number tiles, then the lists.
   * Text is written once as plain text; colours, sizes and merges are
   * applied afterwards and never carry email content.
   */
  function writeDashboard(model) {
    var sh = sheet(TAB.dashboard) || ensure(TAB.dashboard, null, 0);
    var width = GRID + 2;
    var lines = [];
    function add(kind, values, spans, extra) {
      var line = { kind: kind, values: values || [], spans: spans || FULL, tone: '', zebra: false };
      if (extra) { line.tone = extra.tone || ''; line.zebra = !!extra.zebra; }
      lines.push(line);
    }

    add('band-pad');
    add('title', [model.title]);
    add('subtitle', [model.checked]);
    add('band-pad');
    add('gap');
    add('next', ['Next up', model.next.text], [2, GRID - 2], { tone: model.next.tone });
    add('gap');
    var tileSpans = model.tiles.map(function () { return GRID / model.tiles.length; });
    add('tile-number', model.tiles.map(function (t) { return t.value; }), tileSpans);
    add('tile-label', model.tiles.map(function (t) { return t.label; }), tileSpans);
    model.problems.forEach(function (p, i) {
      if (i === 0) add('gap');
      add('problem', ['Fix this: ' + p]);
    });
    model.sections.forEach(function (section) {
      add('gap');
      add('section', [section.title]);
      if (!section.rows.length) { add('empty', [section.empty]); return; }
      var spans = SPANS[section.id] || FULL;
      add('head', section.header, spans);
      section.rows.forEach(function (r, i) { add('row', r, spans, { tone: section.tones[i], zebra: i % 2 === 1 }); });
    });
    add('gap');
    add('foot', ['This tab is redrawn on every check. Keep your own notes in Drives > My notes.']);

    // ---- text ---------------------------------------------------------------
    var n = lines.length;
    var text = [];
    var links = [];
    lines.forEach(function (line, r) {
      var row = [];
      for (var c = 0; c < width; c++) row.push('');
      var at = 1;
      line.spans.forEach(function (span, i) {
        var value = i < line.values.length ? line.values[i] : '';
        if (value && typeof value === 'object') {
          if (PdText.safeUrl(value.url)) links.push({ row: r + 1, col: at + 1, text: value.text, url: PdText.safeUrl(value.url) });
        } else {
          row[at] = PdText.safeCell(value);
        }
        at += span;
      });
      text.push(row);
    });

    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
    sh.clear();
    plainText(sh.getRange(1, 1, n, width)).setValues(text);
    links.forEach(function (link) { sh.getRange(link.row, link.col).setRichTextValue(linkCell(link.text, link.url)); });

    // ---- look ---------------------------------------------------------------
    var bg = [];
    var fg = [];
    var weight = [];
    var size = [];
    var align = [];
    var style = [];
    lines.forEach(function (line) {
      var rowBg = LOOK.page;
      var rowFg = LOOK.ink;
      var rowWeight = 'normal';
      var rowSize = 10;
      var rowAlign = 'left';
      var rowStyle = 'normal';
      if (line.kind === 'band-pad' || line.kind === 'title' || line.kind === 'subtitle') rowBg = LOOK.accent;
      if (line.kind === 'title') { rowFg = LOOK.onAccent; rowWeight = 'bold'; rowSize = 20; }
      if (line.kind === 'subtitle') { rowFg = LOOK.onAccentSoft; }
      if (line.kind === 'section') { rowWeight = 'bold'; rowSize = 13; rowFg = LOOK.accent; }
      if (line.kind === 'head') { rowFg = LOOK.muted; rowWeight = 'bold'; rowSize = 9; }
      if (line.kind === 'row' && line.zebra) rowBg = LOOK.zebra;
      if (line.kind === 'empty' || line.kind === 'foot') { rowFg = LOOK.muted; rowStyle = 'italic'; }
      if (line.kind === 'foot') rowSize = 9;
      if (line.kind === 'problem') { rowBg = LOOK.tile.warn[0]; rowFg = LOOK.tile.warn[1]; }
      if (line.kind === 'next') {
        var nextTone = LOOK.tile[line.tone] || LOOK.tile.quiet;
        rowBg = nextTone[0]; rowFg = nextTone[1]; rowWeight = 'bold'; rowSize = 13;
      }
      var b = []; var f = []; var w = []; var s = []; var a = []; var st = [];
      for (var c = 0; c < width; c++) { b.push(rowBg); f.push(rowFg); w.push(rowWeight); s.push(rowSize); a.push(rowAlign); st.push(rowStyle); }
      if (line.kind === 'band-pad' || line.kind === 'title' || line.kind === 'subtitle') { /* band runs edge to edge */ } else { b[0] = LOOK.page; b[width - 1] = LOOK.page; }
      if (line.kind === 'tile-number' || line.kind === 'tile-label') {
        var at = 1;
        line.spans.forEach(function (span, i) {
          var tone = LOOK.tile[model.tiles[i].tone] || LOOK.tile.quiet;
          for (var k = at; k < at + span; k++) {
            b[k] = tone[0]; f[k] = tone[1]; a[k] = 'center';
            if (line.kind === 'tile-number') { w[k] = 'bold'; s[k] = 24; } else { s[k] = 10; }
          }
          at += span;
        });
      }
      if (line.kind === 'row' && line.tone && LOOK.tone[line.tone]) {
        // The "What" cell is the second column of the list.
        var what = 1 + line.spans[0];
        for (var q = what; q < what + line.spans[1]; q++) { f[q] = LOOK.tone[line.tone]; w[q] = 'bold'; }
      }
      bg.push(b); fg.push(f); weight.push(w); size.push(s); align.push(a); style.push(st);
    });

    var all = sh.getRange(1, 1, n, width);
    all.setFontFamily(LOOK.font).setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    all.setBackgrounds(bg);
    all.setFontColors(fg);
    all.setFontWeights(weight);
    all.setFontSizes(size);
    all.setHorizontalAlignments(align);
    all.setFontStyles(style);

    sh.setHiddenGridlines(true);
    sh.setColumnWidth(1, MARGIN_WIDTH);
    sh.setColumnWidths(2, GRID, GRID_WIDTH);
    sh.setColumnWidth(width, MARGIN_WIDTH);
    sh.setRowHeightsForced(1, n, 27);

    // Merge each run of rows that share a layout in one call per column.
    var start = 0;
    while (start < n) {
      var end = start;
      var signature = lines[start].spans.join(',');
      while (end + 1 < n && lines[end + 1].spans.join(',') === signature) end++;
      var col = 2;
      lines[start].spans.forEach(function (span) {
        if (span > 1) sh.getRange(start + 1, col, end - start + 1, span).mergeAcross();
        col += span;
      });
      start = end + 1;
    }

    lines.forEach(function (line, r) {
      var row = r + 1;
      if (line.kind === 'band-pad') sh.setRowHeightsForced(row, 1, 10);
      if (line.kind === 'title') sh.setRowHeightsForced(row, 1, 40);
      if (line.kind === 'gap') sh.setRowHeightsForced(row, 1, 16);
      if (line.kind === 'tile-number') sh.setRowHeightsForced(row, 1, 48);
      if (line.kind === 'tile-label') sh.setRowHeightsForced(row, 1, 28);
      if (line.kind === 'next') {
        sh.setRowHeightsForced(row, 1, 40);
        sh.getRange(row, 2).setFontSize(9).setHorizontalAlignment('center');
      }
      if (line.kind === 'section') {
        sh.setRowHeightsForced(row, 1, 34);
        sh.getRange(row, 2, 1, GRID).setBorder(false, false, true, false, false, false, LOOK.line, SpreadsheetApp.BorderStyle.SOLID);
      }
      if (line.kind === 'tile-number') {
        // White rules between the tiles read as gaps between cards.
        var col = 2;
        line.spans.forEach(function (span) {
          sh.getRange(row, col, 2, span).setBorder(null, true, null, true, null, null, LOOK.page, SpreadsheetApp.BorderStyle.SOLID_THICK);
          col += span;
        });
      }
    });
    // Paint the band's cell edges in the band colour, so it reads as one
    // solid block in every view of the Sheet.
    var bandRows = 0;
    while (bandRows < n && /^(?:band-pad|title|subtitle)$/.test(lines[bandRows].kind)) bandRows++;
    if (bandRows) sh.getRange(1, 1, bandRows, width).setBorder(true, true, true, true, true, true, LOOK.accent, SpreadsheetApp.BorderStyle.SOLID);
    sh.setTabColor(LOOK.accent);
  }

  return {
    TAB: TAB,
    COL: COL,
    DRIVE_HEAD: DRIVE_HEAD,
    book: book,
    sheet: sheet,
    ensureTabs: ensureTabs,
    removeSpareSheet: removeSpareSheet,
    tidy: tidy,
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
