/**
 * @fileoverview Settings and profile: the names shown in the Sheet, their
 * defaults, and turning what the student typed into checked values.
 *
 * Nothing college-specific is built into the code. The college's sender
 * addresses, branch names, batch year, timezone and CGPA rule all come from
 * the Settings tab.
 */
var PdConfig = (function () {
  'use strict';

  var SETTINGS = [
    { key: 'senders', label: 'Placement cell email addresses', value: '', help: 'The address(es) your placement emails come from. Separate several with commas. Example: placements@yourcollege.example' },
    { key: 'lists', label: 'Mailing list addresses (optional)', value: '', help: 'If placement mail is sent to a group address (like batch2027@lists.yourcollege.example), put it here.' },
    { key: 'batch', label: 'Your passing year', value: '', help: 'Example: 2027. Emails for other batches are left out.' },
    { key: 'branchAliases', label: 'Your branch, every way it is written', value: '', help: 'Example: Computer, Comp, CS, CSE, CS/IT. Emails for other branches are left out.' },
    { key: 'degreeAliases', label: 'Your degree, every way it is written', value: 'BE, B.E., BTech, B.Tech', help: 'Emails only for other degrees (for example MBA) are left out.' },
    { key: 'timezone', label: 'Timezone', value: 'Asia/Kolkata', help: 'Used for every date and deadline. Example: Asia/Kolkata' },
    { key: 'order', label: 'How dates are written in your emails', value: 'Day first (06-10-2026)', help: 'Choose "Month first (10-06-2026)" only if your college writes dates the US way.' },
    { key: 'keywords', label: 'Extra search words (optional)', value: '', help: 'Added to the built-in ones (shortlist, assessment, interview, hackathon, ...). Separate with commas.' },
    { key: 'excludeTerms', label: 'Never open emails whose subject has (optional)', value: '', help: 'Added to the built-in list (OTP, password, bank alerts, ...). Separate with commas.' },
    { key: 'hours', label: 'Check at these hours', value: '8, 13, 19', help: 'Hours of the day in 24-hour time, in your timezone.' },
    { key: 'notify', label: 'Email me a short summary', value: 'Yes', help: 'Sent only to your own address, and only when there is something new.' },
    { key: 'autoPrefill', label: 'Build pre-filled form links automatically', value: 'No', help: 'Yes: the tool reads each public Google Form linked in a drive email to prepare a pre-filled link. It never submits a form.' },
    { key: 'formula', label: 'CGPA to percentage rule (optional)', value: '', help: 'Copy the rule from your university. Examples: x9.5   or   x10-7.5' },
    { key: 'lookbackDays', label: 'Days to look back on each check', value: '2', help: 'Overlapping checks are fine: nothing is added twice.' },
    { key: 'sweepDays', label: 'Days covered by the daily safety sweep', value: '21', help: 'Once a day the tool rechecks subject lines this far back, to catch anything missed.' }
  ];

  var PROFILE_EXTRA = [
    { key: 'otherNames', label: 'Other spellings of your name on lists', help: 'Optional. Example: Asha Vijay Rao, Rao Asha V. Separate with commas.' },
    { key: 'otherIds', label: 'Other roll numbers or IDs', help: 'Optional. Example: an exam seat number. Separate with commas.' }
  ];

  function yes(value) {
    return /^\s*(?:y|yes|true|on|1)\s*$/i.test(String(value));
  }

  function clampInt(value, min, max, fallback) {
    var n = parseInt(String(value), 10);
    if (!isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  /**
   * @param {Array<Array>} rows the Settings tab as [label, value] rows
   * @return {{settings:Object, problems:Array<string>}}
   */
  function readSettings(rows) {
    var byLabel = {};
    (rows || []).forEach(function (row) {
      var label = PdText.fold(row[0]);
      if (label) byLabel[label] = row[1] === null || row[1] === undefined ? '' : String(row[1]);
    });
    var raw = {};
    SETTINGS.forEach(function (def) {
      var typed = byLabel[PdText.fold(def.label)];
      raw[def.key] = typed === undefined ? def.value : typed;
    });

    var problems = [];
    var senders = PdText.splitList(raw.senders).map(PdQueries.cleanAddress).filter(Boolean);
    var lists = PdText.splitList(raw.lists).map(PdQueries.cleanAddress).filter(Boolean);
    if (PdText.splitList(raw.senders).length !== senders.length) problems.push('One of the placement cell addresses is not a valid email address.');
    if (!senders.length && !lists.length) problems.push('Add your placement cell email address in Settings. Until then only keyword searches are used.');

    var batch = clampInt(raw.batch, 2000, 2100, 0);
    if (!batch) problems.push('Add your passing year in Settings.');
    var branchAliases = PdText.splitList(raw.branchAliases);
    if (!branchAliases.length) problems.push('Add your branch in Settings, or emails for every branch will be shown.');

    var timezone = PdText.normalise(raw.timezone) || 'Asia/Kolkata';
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(timezone)) { problems.push('Timezone is not valid, so Asia/Kolkata is used.'); timezone = 'Asia/Kolkata'; }

    var hours = PdText.splitList(raw.hours).map(function (h) { return parseInt(h, 10); })
      .filter(function (h, i, all) { return isFinite(h) && h >= 0 && h <= 23 && all.indexOf(h) === i; })
      .slice(0, 6);
    if (!hours.length) hours = [8, 13, 19];

    return {
      settings: {
        senders: senders,
        lists: lists,
        batch: batch,
        branchAliases: branchAliases,
        degreeAliases: PdText.splitList(raw.degreeAliases),
        timezone: timezone,
        order: /month\s*first|^mdy$/i.test(raw.order) ? 'MDY' : 'DMY',
        keywords: PdQueries.DEFAULT_KEYWORDS.concat(PdText.splitList(raw.keywords)),
        excludeTerms: PdText.splitList(raw.excludeTerms),
        hours: hours,
        notify: yes(raw.notify),
        autoPrefill: yes(raw.autoPrefill),
        formula: PdText.normalise(raw.formula),
        lookbackDays: clampInt(raw.lookbackDays, 1, 14, 2),
        sweepDays: clampInt(raw.sweepDays, 2, 60, 21)
      },
      problems: problems
    };
  }

  /**
   * @param {Array<Array>} rows the Profile tab as [label, answer, also asked as] rows
   * @param {Object} settings from readSettings
   * @return {{fields:Array<Object>, identity:Object, emails:Array<string>}}
   */
  function readProfile(rows, settings) {
    var known = {};
    PdPrefill.FIELDS.forEach(function (f) { known[PdText.fold(f.label)] = f; });
    var extra = {};
    PROFILE_EXTRA.forEach(function (f) { extra[PdText.fold(f.label)] = f.key; });

    var fields = [];
    var values = {};
    var loose = {};
    (rows || []).forEach(function (row) {
      var label = PdText.normalise(row[0]);
      var folded = PdText.fold(label);
      var value = row[1] === null || row[1] === undefined ? '' : PdText.normalise(row[1]);
      if (!folded) return;
      if (extra[folded]) { loose[extra[folded]] = value; return; }
      var more = PdText.splitList(row[2]);
      var def = known[folded];
      if (def) {
        fields.push({ key: def.key, label: def.label, value: value, keywords: def.keywords.concat(more), not: def.not || [], aliases: [] });
        values[def.key] = value;
      } else {
        fields.push({ key: 'custom:' + folded, label: label, value: value, keywords: [label].concat(more), not: [], aliases: [] });
      }
    });

    fields.forEach(function (f) {
      if (f.key === 'branch') f.aliases = settings.branchAliases || [];
      if (f.key === 'degree') f.aliases = settings.degreeAliases || [];
      if (f.key === 'gender' && f.value) f.aliases = /^m/i.test(f.value) ? ['Male', 'M'] : (/^f/i.test(f.value) ? ['Female', 'F'] : []);
      if (f.key === 'percent' && !f.value && values.cgpa) f.value = PdPrefill.cgpaToPercent(values.cgpa, settings.formula);
      if (f.key === 'batch' && !f.value && settings.batch) f.value = String(settings.batch);
    });

    var names = [values.fullName || ''].concat(PdText.splitList(loose.otherNames));
    if (!values.fullName && values.firstName && values.lastName) names.push(values.firstName + ' ' + values.lastName);
    var emails = [values.email, values.collegeEmail].filter(Boolean);
    var identity = PdMatch.buildIdentity({
      names: names,
      ids: [values.rollNumber || ''].concat(PdText.splitList(loose.otherIds)),
      emails: emails
    });
    return { fields: fields, identity: identity, emails: identity.emailList };
  }

  return { SETTINGS: SETTINGS, PROFILE_EXTRA: PROFILE_EXTRA, readSettings: readSettings, readProfile: readProfile };
})();
