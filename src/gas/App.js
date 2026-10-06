/**
 * @fileoverview The menu and the functions Google calls: opening the Sheet,
 * menu clicks and the timed checks.
 *
 * These are the only global functions in the project. Everything else lives
 * in the Pd* objects.
 */

/* exported onOpen, pdSetup, pdRunNow, pdCatchUp, pdExample, pdExampleClear, pdLogPractice, pdScheduledRun, pdDailySweep, pdTurnOn, pdTurnOff, pdPrefillSelected, pdShowAnswers, pdHelp */

var PD_TIMED = ['pdScheduledRun', 'pdDailySweep'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Placement Desk')
    .addItem('1. Set up this sheet', 'pdSetup')
    .addItem('2. Check my email now', 'pdRunNow')
    .addItem('3. Turn on automatic checks', 'pdTurnOn')
    .addSeparator()
    .addItem('See an example first', 'pdExample')
    .addItem('Remove the example rows', 'pdExampleClear')
    .addSeparator()
    .addItem('Catch up on the last few weeks', 'pdCatchUp')
    .addItem('Pre-fill the form for the selected row', 'pdPrefillSelected')
    .addItem('Show my copy-ready answers', 'pdShowAnswers')
    .addItem('I practised the selected skill today', 'pdLogPractice')
    .addSeparator()
    .addItem('Turn off automatic checks', 'pdTurnOff')
    .addItem('Help and privacy', 'pdHelp')
    .addToUi();
}

function pdToast_(message) {
  SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Placement Desk', 10);
}

function pdSetup() {
  var created = PdStore.ensureTabs();
  PdStore.removeSpareSheet();
  PdStore.tidy();
  var settingsTab = PdStore.sheet(PdStore.TAB.settings);
  if (settingsTab) SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(settingsTab);
  pdToast_(created.length
    ? 'Tabs created. Fill in Settings and Profile, then choose "Check my email now".'
    : 'Everything is already set up. Nothing was changed.');
}

function pdReport_(stats) {
  if (stats.note && !stats.found && !stats.fresh) return stats.note;
  var parts = [stats.added + ' new', stats.updated + ' updated'];
  if (stats.onList) parts.push('you are on ' + stats.onList + ' list' + (stats.onList > 1 ? 's' : ''));
  if (stats.problems) parts.push(stats.problems + ' could not be read (will retry)');
  return 'Checked ' + stats.fresh + ' new emails: ' + parts.join(', ') + '.' + (stats.note ? ' ' + stats.note : '');
}

function pdRunNow() {
  pdToast_('Checking your placement email\u2026');
  pdToast_(pdReport_(PdRunner.run('manual')));
}

function pdCatchUp() {
  pdToast_('Looking back over the last few weeks. This can take a few minutes\u2026');
  pdToast_(pdReport_(PdRunner.run('catchup')));
}

/** Redraw the Dashboard from whatever is on the Drives tab right now. */
function pdRedraw_() {
  var config = PdConfig.readSettings(PdStore.readSettingsRows());
  var offsetFn = PdRunner.offsetFor(config.settings.timezone);
  var nowMs = Date.now();
  var planned = PdStore.readDrives().filter(function (e) { return e.item; }).map(function (e) {
    return { item: e.item, mark: e.mark, todo: PdPlan.todo(e.item, e.mark, nowMs, offsetFn), row: e.row };
  });
  var coach = PdCoach.review(PdStore.readPractice(), PdDates.toParts(nowMs, offsetFn), config.settings.order);
  PdStore.writePractice(coach.rows);
  PdStore.writeDashboard(PdPlan.dashboard(planned, { problems: [], practice: coach.rows, checkedMs: nowMs }, nowMs, offsetFn));
}

/** Made-up rows so a new user can see how the dashboard reads. No Gmail involved. */
function pdExample() {
  PdStore.ensureTabs();
  var offsetFn = PdRunner.offsetFor(PdConfig.readSettings(PdStore.readSettingsRows()).settings.timezone);
  var nowMs = Date.now();
  var existing = {};
  PdStore.readDrives().forEach(function (e) { if (e.key) existing[e.key] = e; });
  var entries = PdDemo.items(nowMs, offsetFn).map(function (item) {
    var current = existing[item.key];
    return { row: current ? current.row : 0, item: item, todo: PdPlan.todo(item, current ? current.mark : '', nowMs, offsetFn) };
  });
  PdStore.writeDrives(entries, offsetFn);
  pdRedraw_();
  pdToast_('Example rows added. They are made up. Remove them any time from the Placement Desk menu.');
}

function pdExampleClear() {
  var rows = PdStore.readDrives().filter(function (e) { return PdDemo.isDemoKey(e.key); }).map(function (e) { return e.row; });
  PdStore.deleteDriveRows(rows);
  pdRedraw_();
  pdToast_(rows.length ? rows.length + ' example rows removed.' : 'There were no example rows.');
}

/** One click on the Practice tab: stamps today on the selected skill and adds a line to the Practice log. */
function pdLogPractice() {
  var active = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var row = active.getActiveRange().getRow();
  if (active.getName() !== PdStore.TAB.practice || row < 2) {
    pdToast_('Click a skill on the Practice tab first.');
    return;
  }
  var settings = PdConfig.readSettings(PdStore.readSettingsRows()).settings;
  var today = PdDates.toParts(Date.now(), PdRunner.offsetFor(settings.timezone));
  var skill = PdStore.logPractice(row, PdDates.toNumeric(today, settings.order));
  if (!skill) {
    pdToast_('That row has no skill name.');
    return;
  }
  pdRedraw_();
  pdToast_('Logged for today: ' + skill);
}

function pdScheduledRun() {
  PdRunner.run('scheduled');
}

function pdDailySweep() {
  PdRunner.run('sweep');
}

function pdRemoveTimers_() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (PD_TIMED.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return removed;
}

function pdTurnOn() {
  var settings = PdConfig.readSettings(PdStore.readSettingsRows()).settings;
  pdRemoveTimers_();
  settings.hours.forEach(function (hour) {
    ScriptApp.newTrigger('pdScheduledRun').timeBased().atHour(hour).everyDays(1).inTimezone(settings.timezone).create();
  });
  var sweepHour = (Math.min.apply(null, settings.hours) + 23) % 24;
  ScriptApp.newTrigger('pdDailySweep').timeBased().atHour(sweepHour).everyDays(1).inTimezone(settings.timezone).create();
  pdToast_('Automatic checks are on: daily at ' + settings.hours.map(function (h) { return h + ':00'; }).join(', ') +
    ' (' + settings.timezone + '), plus one safety sweep.');
}

function pdTurnOff() {
  var removed = pdRemoveTimers_();
  pdToast_(removed ? 'Automatic checks are off.' : 'Automatic checks were not on.');
}

/** The copy-ready answers, as a side panel. Every value is escaped. */
function pdAnswersHtml_(title, intro, answers, link) {
  var rows = answers.map(function (a) {
    return '<label>' + PdText.escapeHtml(a.label) + '</label>' +
      '<input readonly value="' + PdText.escapeHtml(a.value) + '" onclick="this.select();try{document.execCommand(\'copy\');}catch(e){}">';
  }).join('');
  var safeLink = PdText.safeUrl(link);
  return '<!DOCTYPE html><html><head><base target="_blank"><style>' +
    'body{font:13px Arial,sans-serif;margin:12px;color:#202124}h3{margin:0 0 6px}p{color:#5f6368;margin:0 0 12px}' +
    'label{display:block;font-size:11px;color:#5f6368;margin-top:8px}input{width:100%;box-sizing:border-box;padding:6px;border:1px solid #dadce0;border-radius:4px}' +
    'a.btn{display:inline-block;margin:0 0 12px;padding:8px 12px;background:#1a73e8;color:#fff;border-radius:4px;text-decoration:none}' +
    '</style></head><body><h3>' + PdText.escapeHtml(title) + '</h3><p>' + PdText.escapeHtml(intro) + '</p>' +
    (safeLink ? '<a class="btn" href="' + PdText.escapeHtml(safeLink) + '">Open the pre-filled form</a>' : '') +
    rows + '<p style="margin-top:14px">Click a box to select it, then paste it into the form. Nothing is submitted for you.</p></body></html>';
}

function pdShowPanel_(title, intro, answers, link) {
  var html = HtmlService.createHtmlOutput(pdAnswersHtml_(title, intro, answers, link)).setTitle('Placement Desk');
  SpreadsheetApp.getUi().showSidebar(html);
}

function pdProfile_() {
  var settings = PdConfig.readSettings(PdStore.readSettingsRows()).settings;
  return { settings: settings, profile: PdConfig.readProfile(PdStore.readProfileRows(), settings) };
}

function pdShowAnswers() {
  var p = pdProfile_();
  pdShowPanel_('Your answers', 'Taken from your Profile tab.', PdPrefill.answerSheet(p.profile.fields), '');
}

function pdPrefillSelected() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var active = book.getActiveSheet();
  var row = active.getActiveRange().getRow();
  if (active.getName() !== PdStore.TAB.drives || row < 2) {
    pdToast_('Click a row on the Drives tab first.');
    return;
  }
  var entry = PdStore.readDrives().filter(function (e) { return e.row === row; })[0];
  if (!entry || !entry.item || !entry.item.formUrl) {
    pdToast_('That row has no registration form link.');
    return;
  }
  var p = pdProfile_();
  var result = PdForms.prefill(entry.item.formUrl, p.profile.fields, p.settings);
  var answers = PdPrefill.answerSheet(p.profile.fields);
  if (result.state === 'ok') {
    entry.item.prefillUrl = result.url;
    var offsetFn = PdRunner.offsetFor(p.settings.timezone);
    PdStore.writeDrives([{ row: entry.row, item: entry.item, todo: PdPlan.todo(entry.item, entry.mark, Date.now(), offsetFn) }], offsetFn);
    var manual = result.manual.map(function (m) { return { label: 'Fill in yourself: ' + m.question, value: m.reason }; });
    pdShowPanel_(result.title || 'Pre-filled form', result.filled + ' answers are filled in. Check every one before you submit.', manual.concat(answers), result.url);
  } else if (result.state === 'signin') {
    pdShowPanel_('This form needs sign-in', 'It cannot be read from here, so open it yourself and copy your answers from this list.', answers, entry.item.formUrl);
  } else {
    pdShowPanel_('Not a Google Form', 'Only Google Forms can be pre-filled. Here are your answers to copy.', answers, entry.item.formUrl);
  }
}

function pdHelp() {
  var html = '<!DOCTYPE html><html><head><base target="_blank"><style>body{font:13px Arial,sans-serif;margin:12px;color:#202124;line-height:1.5}h3{margin:12px 0 4px}</style></head><body>' +
    '<h3>What this does</h3>Reads your placement emails and keeps this Sheet up to date with drives, deadlines, shortlists and to-dos.' +
    '<h3>What it can and cannot do</h3>It can only <b>read</b> Gmail. It cannot send, delete, label or mark mail as read, and it never submits a form.' +
    '<h3>What it never opens</h3>OTP and verification codes, passwords, security alerts, bank and payment mail, social mail.' +
    '<h3>Where your data lives</h3>Only in this Sheet, in your own Google account. Nothing is sent anywhere else.' +
    '<h3>Your columns</h3>"My mark" and "My notes" on the Drives tab are yours. The tool never changes them.' +
    '<h3>Stop everything</h3>Placement Desk &gt; Turn off automatic checks. To remove access completely, go to myaccount.google.com/permissions.' +
    '</body></html>';
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(html).setTitle('Placement Desk: help'));
}
