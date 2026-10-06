/**
 * Placement Desk 0.1.0 - single-file build.
 * Source, licence (MIT) and documentation: see the project repository.
 * Not affiliated with Google, any college or any company.
 */

// ===== src/core/Body.js =====
/**
 * @fileoverview Reading the body of a placement email.
 *
 * Bodies usually repeat the subject as a bulleted list:
 *
 *   ● Name of the Company: Acme Robotics
 *   ● Eligible Branch : All Branches
 *   ● Last Date to Register: - 06-10-2026 till 4:00 p.m.
 *   Registration Link : https://docs.google.com/forms/d/e/.../viewform
 *
 * This file turns that into fields, links and dates.
 */
var PdBody = (function () {
  'use strict';

  var MAX_BODY = 60000;

  var FIELD_MAP = [
    [/^(?:name of (?:the )?(?:company|organi[sz]ation)|company(?: name)?|organi[sz]ation)$/i, 'company'],
    [/^(?:eligible |eligibility )?(?:branch(?:es)?|streams?|departments?|disciplines?)$/i, 'branches'],
    [/^(?:eligible |eligibility )?(?:batch(?:es)?|passing year|year of passing|pass ?out year)$/i, 'batches'],
    [/^(?:eligible |eligibility )?(?:degree|course|courses|qualification)s?$/i, 'degrees'],
    [/^(?:last date|deadline|last date (?:to|for|of) [a-z ]+|registration deadline|apply (?:by|before)|register (?:by|before))$/i, 'deadline'],
    [/^(?:registration|apply|application|register)(?: form)? link$|^link (?:to|for) (?:register|registration|apply|application)$|^(?:google )?form link$/i, 'formLink'],
    [/^(?:test|assessment|exam|meeting|joining|session) link$/i, 'eventLink'],
    [/^(?:date|drive date|date of (?:the )?(?:drive|test|interview|assessment|session)|scheduled on|date ?(?:&|and) ?time)$/i, 'date'],
    [/^(?:time|reporting time)$/i, 'time'],
    [/^(?:venue|location of (?:the )?drive|reporting venue)$/i, 'venue'],
    [/^(?:stipend|compensation)$/i, 'stipend'],
    [/^(?:ctc|package|salary|annual ctc)$/i, 'ctc'],
    [/^(?:role|position|profile|designation|job role|job title|job profile)$/i, 'role'],
    [/^(?:job |work )?location$/i, 'location'],
    [/^(?:overall )?(?:academic )?(?:score|criteria|eligibility criteria|eligibility|academic criteria)$/i, 'criteria']
  ];

  /** Remove quoted mailing-list footers and anything past the size limit. */
  function clean(body) {
    var s = String(body || '').slice(0, MAX_BODY).replace(/\r\n?/g, '\n');
    var footer = s.search(/\n-- ?\nYou received this message because you are subscribed/);
    if (footer !== -1) s = s.slice(0, footer);
    return s;
  }

  function classifyLink(url) {
    var host = PdText.hostOf(url);
    if (!host) return '';
    if (host === 'forms.gle' || (host === 'docs.google.com' && /^https?:\/\/[^/]+\/forms\//i.test(url))) return 'form';
    if (host === 'forms.office.com' || host === 'forms.cloud.microsoft') return 'form';
    if (/(^|\.)(?:teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|zoom\.us|webex\.com)$/.test(host)) return 'meeting';
    if (host === 'drive.google.com' || host === 'docs.google.com') return 'document';
    if (/(^|\.)google\.com$/.test(host) && /^https?:\/\/groups\./i.test(url)) return '';
    return 'other';
  }

  /** Every safe link in the text, once each, in order. */
  function extractLinks(text) {
    var out = [];
    var seen = {};
    var re = /https?:\/\/[^\s<>"'\])]+/g;
    var m;
    while ((m = re.exec(text))) {
      var url = PdText.safeUrl(m[0].replace(/[.,;:*!?]+$/, ''));
      if (!url || seen[url]) continue;
      seen[url] = true;
      var kind = classifyLink(url);
      if (kind) out.push({ url: url, kind: kind });
    }
    return out;
  }

  /** "● Name of the Company:* Acme" -> ["Name of the Company", "Acme"]. */
  function keyValue(line) {
    var s = line.replace(/\*/g, '').replace(/^[\s\u25CF\u2022\u00B7\u25E6\u2023>\-\u2013\d.)]+/, '');
    var m = /^([A-Za-z][A-Za-z &/()'.]{1,48}?)\s*(?::\s*-?|\s-\s|\u2013)\s*(.*)$/.exec(s);
    if (!m) return null;
    var key = PdText.normalise(m[1]);
    if (/https?$/i.test(key)) return null;
    return [key, PdText.normalise(m[2])];
  }

  /**
   * @param {string} body plain-text body
   * @param {{base:Object, order:(string|undefined)}} ctx
   * @return {{fields:Object, links:Array, formUrl:string, deadline:Object, eventDate:Object, eligibility:Object, text:string}}
   */
  function parse(body, ctx) {
    var text = clean(body);
    var dateCtx = { base: ctx.base, order: ctx.order };
    var fields = {};
    var lines = text.split('\n');

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // "Registration link\n: https://..." puts the value on the next line.
      if (i + 1 < lines.length && /^\s*:/.test(lines[i + 1])) { line = line + ' ' + lines[i + 1]; i++; }
      var kv = keyValue(line);
      if (!kv || !kv[1]) continue;
      for (var f = 0; f < FIELD_MAP.length; f++) {
        if (FIELD_MAP[f][0].test(kv[0]) && !fields[FIELD_MAP[f][1]]) {
          fields[FIELD_MAP[f][1]] = PdText.truncate(kv[1], 300);
          break;
        }
      }
    }

    var links = extractLinks(text);
    var formUrl = '';
    if (fields.formLink) {
      var named = extractLinks(fields.formLink);
      if (named.length && named[0].kind === 'form') formUrl = named[0].url;
    }
    if (!formUrl) {
      for (var k = 0; k < links.length; k++) if (links[k].kind === 'form') { formUrl = links[k].url; break; }
    }

    var deadline = fields.deadline ? PdDates.firstDate(fields.deadline, dateCtx) : null;
    if (!deadline) deadline = PdSubject.findDeadline(text.replace(/\*/g, ''), dateCtx);

    var eventDate = null;
    if (fields.date) eventDate = PdDates.firstDate(fields.date + (fields.time ? ' at ' + fields.time : ''), dateCtx);
    if (!eventDate) {
      var scheduled = /\b(?:is|are|been|be)?\s*scheduled\s+(?:for|on)\s+([^\n]{0,80})/i.exec(text);
      if (scheduled) eventDate = PdDates.firstDate(scheduled[1], dateCtx);
    }

    var eligibility = PdSubject.parseEligibility(
      'BE (' + (fields.branches || '') + ') ' + (fields.batches ? fields.batches + ' batch' : '')
    );
    eligibility.degrees = fields.degrees ? PdSubject.parseEligibility(fields.degrees).degrees : [];
    if (fields.branches && /\ball\b|\bany\b/i.test(fields.branches)) { eligibility.allBranches = true; eligibility.branches = []; }

    return {
      fields: fields,
      links: links,
      formUrl: formUrl,
      deadline: deadline,
      eventDate: eventDate,
      eligibility: eligibility,
      text: text
    };
  }

  return { parse: parse, clean: clean, extractLinks: extractLinks, classifyLink: classifyLink };
})();

// ===== src/core/Coach.js =====
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

// ===== src/core/Config.js =====
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

// ===== src/core/Dates.js =====
/**
 * @fileoverview Finding dates and times in email text, and converting them to
 * real instants in the user's timezone.
 *
 * Dates are kept as wall-clock parts ({y, m, d, h, mi}) until the very end,
 * because "7th October at 9:00 a.m." means 9 a.m. where the student lives,
 * not 9 a.m. on the server that happens to run the script.
 */
var PdDates = (function () {
  'use strict';

  var MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12
  };
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var DAY_MS = 86400000;

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function isValidYmd(y, m, d) {
    return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
  }

  function expandYear(text) {
    var n = parseInt(text, 10);
    return text.length <= 2 ? 2000 + n : n;
  }

  /** Whole days from a to b (b later gives a positive number). */
  function daysBetween(a, b) {
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
  }

  function addDays(ymd, n) {
    var t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d) + n * DAY_MS);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  /**
   * A day and month with no year: pick the year that puts it closest to the
   * email's own date, leaning forward (a December mail saying "5th January"
   * means next January).
   */
  function inferYear(m, d, base) {
    var y = base.y;
    var gap = daysBetween(base, { y: y, m: m, d: Math.min(d, daysInMonth(y, m)) });
    if (gap < -60) return y + 1;
    if (gap > 300) return y - 1;
    return y;
  }

  /**
   * Read a clock time from the start of `text`.
   * Understands 9:00 a.m., 7.30 pm, 1:00PM, 10 AM, 16:00, 1300 hrs, 12 noon.
   * @return {{h:number, mi:number, length:number}|null}
   */
  function parseTime(text) {
    var s = String(text || '');
    var m = /^\s*(\d{1,2})\s*(noon|midnight)\b/i.exec(s);
    if (m) {
      var twelve = parseInt(m[1], 10);
      if (twelve !== 12) return null;
      return { h: /noon/i.test(m[2]) ? 12 : 0, mi: 0, length: m[0].length };
    }
    m = /^\s*([01]\d|2[0-3])([0-5]\d)\s*(?:hrs|hours)\b/i.exec(s);
    if (m) return { h: parseInt(m[1], 10), mi: parseInt(m[2], 10), length: m[0].length };

    m = /^\s*(\d{1,2})(?:\s*[:.]\s*([0-5]\d))?\s*(a\.?\s?m\b\.?|p\.?\s?m\b\.?|hrs\b|hours\b)?/i.exec(s);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var mi = m[2] ? parseInt(m[2], 10) : 0;
    var marker = (m[3] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!m[2] && !marker) return null;
    if (marker === 'am' || marker === 'pm') {
      if (h < 1 || h > 12) return null;
      if (marker === 'pm' && h !== 12) h += 12;
      if (marker === 'am' && h === 12) h = 0;
    } else if (h > 23) {
      return null;
    }
    return { h: h, mi: mi, length: m[0].length };
  }

  /** Look just after (or just before) a date for the time that goes with it. */
  function attachTime(text, start, end, found) {
    var after = text.slice(end, end + 48);
    var lead = /^\s*\)?\s*,?\s*(?:\(?(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\)?)?\s*,?\s*(?:(?:at|till|until|upto|up to|by|before|from|@)\s+|[-\u2013]\s*)?/i.exec(after);
    var skip = lead ? lead[0].length : 0;
    var time = parseTime(after.slice(skip));
    if (time) {
      found.h = time.h; found.mi = time.mi; found.hasTime = true;
      found.length += skip + time.length;
      return;
    }
    var before = text.slice(Math.max(0, start - 28), start);
    var behind = /(\d{1,2}(?:\s*[:.]\s*[0-5]\d)?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?|hrs|hours|noon)?)\s*,?\s*(?:on|of)?\s*$/i.exec(before);
    if (behind) {
      time = parseTime(behind[1]);
      if (time) { found.h = time.h; found.mi = time.mi; found.hasTime = true; }
    }
  }

  /**
   * Find every date in a piece of text.
   * @param {string} text
   * @param {{base:{y:number,m:number,d:number}, order:(string|undefined)}} ctx
   *     base: the email's own date in the user's timezone (for "tomorrow" and
   *     for dates with no year). order: 'DMY' (default) or 'MDY' for 06-10-2026.
   * @return {!Array<{y:number,m:number,d:number,h:number,mi:number,hasTime:boolean,index:number,length:number,relative:boolean}>}
   */
  function findDates(text, ctx) {
    var s = String(text || '');
    var base = ctx.base;
    var order = ctx.order === 'MDY' ? 'MDY' : 'DMY';
    var out = [];
    var taken = [];
    var m;

    function overlaps(index, length) {
      for (var i = 0; i < taken.length; i++) {
        if (index < taken[i][1] && index + length > taken[i][0]) return true;
      }
      return false;
    }
    function push(y, mo, d, index, length, relative) {
      if (!isValidYmd(y, mo, d) || overlaps(index, length)) return;
      var found = { y: y, m: mo, d: d, h: 0, mi: 0, hasTime: false, index: index, length: length, relative: !!relative };
      attachTime(s, index, index + length, found);
      taken.push([index, index + length]);
      out.push(found);
    }

    // 7th October 2026, 30 September 2026, 8th Oct, 1st of March 26
    var dayMonth = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?' + MONTH_RE + '\\b\\.?,?(?:\\s*(\\d{4}|\'?\\d{2})(?![\\d:.]))?', 'gi');
    while ((m = dayMonth.exec(s))) {
      var d1 = parseInt(m[1], 10);
      var mo1 = MONTHS[m[2].toLowerCase()];
      var y1 = m[3] ? expandYear(m[3].replace("'", '')) : inferYear(mo1, d1, base);
      push(y1, mo1, d1, m.index, m[0].length, false);
    }

    // October 7th, 2026 / Oct 7
    var monthDay = new RegExp('\\b' + MONTH_RE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:.]\\d)(?:,?\\s*(\\d{4}))?', 'gi');
    while ((m = monthDay.exec(s))) {
      var mo2 = MONTHS[m[1].toLowerCase()];
      var d2 = parseInt(m[2], 10);
      var y2 = m[3] ? parseInt(m[3], 10) : inferYear(mo2, d2, base);
      push(y2, mo2, d2, m.index, m[0].length, false);
    }

    // 2026-10-07
    var iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(s))) {
      push(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m.index, m[0].length, false);
    }

    // 06-10-2026, 29/09/2026, 6.10.26
    var numeric = /(^|[^\d\-/.])(\d{1,2})([-/.])(\d{1,2})\3(\d{4}|\d{2})(?![\d\-/])/g;
    while ((m = numeric.exec(s))) {
      var a = parseInt(m[2], 10);
      var b = parseInt(m[4], 10);
      var index = m.index + m[1].length;
      var length = m[0].length - m[1].length;
      var day = order === 'MDY' ? b : a;
      var month = order === 'MDY' ? a : b;
      push(expandYear(m[5]), month, day, index, length, false);
    }

    // today / tomorrow / tonight, measured from the email's own date
    var relative = /\b(today|tonight|tomorrow|day after tomorrow)\b/gi;
    while ((m = relative.exec(s))) {
      var word = m[1].toLowerCase();
      var shift = word === 'tomorrow' ? 1 : (word === 'day after tomorrow' ? 2 : 0);
      var when = addDays(base, shift);
      push(when.y, when.m, when.d, m.index, m[0].length, true);
    }

    out.sort(function (p, q) { return p.index - q.index; });
    return out;
  }

  /**
   * The most useful date in a piece of text: an explicit date beats a
   * relative word ("Tomorrow, 29/09/2026" means the 29th).
   */
  function firstDate(text, ctx) {
    var all = findDates(text, ctx);
    for (var i = 0; i < all.length; i++) if (!all[i].relative) return all[i];
    return all.length ? all[0] : null;
  }

  /**
   * Offset function for a named timezone using the JavaScript engine's own
   * timezone database. Returns minutes east of UTC for a given instant.
   */
  function intlOffset(timeZone) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    });
    return function (epochMs) {
      var parts = {};
      fmt.formatToParts(new Date(epochMs)).forEach(function (p) { parts[p.type] = parseInt(p.value, 10); });
      var asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
      return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / 60000);
    };
  }

  function fixedOffset(minutes) {
    return function () { return minutes; };
  }

  /** Wall-clock parts in the user's zone -> a real instant (ms since 1970). */
  function toEpoch(parts, offsetFn) {
    var wall = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h || 0, parts.mi || 0);
    var guess = wall - offsetFn(wall) * 60000;
    return wall - offsetFn(guess) * 60000;
  }

  /** A real instant -> wall-clock parts in the user's zone. */
  function toParts(epochMs, offsetFn) {
    var t = new Date(epochMs + offsetFn(epochMs) * 60000);
    return {
      y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
      h: t.getUTCHours(), mi: t.getUTCMinutes(), hasTime: true
    };
  }

  /**
   * The instant a date stops being "upcoming". A date with no time counts
   * until the end of that day.
   */
  function endEpoch(parts, offsetFn) {
    if (parts.hasTime) return toEpoch(parts, offsetFn);
    return toEpoch({ y: parts.y, m: parts.m, d: parts.d, h: 23, mi: 59 }, offsetFn);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /** "2026-10-07" or "2026-10-07 09:00": sorts correctly as plain text. */
  function toIso(parts) {
    if (!parts) return '';
    var s = parts.y + '-' + pad(parts.m) + '-' + pad(parts.d);
    return parts.hasTime ? s + ' ' + pad(parts.h) + ':' + pad(parts.mi) : s;
  }

  /** "06-10-2026" (or "10-06-2026" for month-first), the way students type dates. */
  function toNumeric(parts, order) {
    var day = pad(parts.d);
    var month = pad(parts.m);
    return (order === 'MDY' ? month + '-' + day : day + '-' + month) + '-' + parts.y;
  }

  function fromIso(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(text || ''));
    if (!m) return null;
    return {
      y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10),
      h: m[4] ? parseInt(m[4], 10) : 0, mi: m[5] ? parseInt(m[5], 10) : 0, hasTime: !!m[4]
    };
  }

  /** "Wed 7 Oct, 9:00 AM" for people to read. */
  function toHuman(parts) {
    if (!parts) return '';
    var dow = new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
    var s = DAY_SHORT[dow] + ' ' + parts.d + ' ' + MONTH_SHORT[parts.m - 1];
    if (!parts.hasTime) return s;
    var h12 = parts.h % 12 === 0 ? 12 : parts.h % 12;
    return s + ', ' + h12 + ':' + pad(parts.mi) + (parts.h < 12 ? ' AM' : ' PM');
  }

  return {
    parseTime: parseTime,
    findDates: findDates,
    firstDate: firstDate,
    intlOffset: intlOffset,
    fixedOffset: fixedOffset,
    toEpoch: toEpoch,
    toParts: toParts,
    endEpoch: endEpoch,
    toIso: toIso,
    toNumeric: toNumeric,
    fromIso: fromIso,
    toHuman: toHuman,
    daysBetween: daysBetween,
    addDays: addDays
  };
})();

// ===== src/core/Dedupe.js =====
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

// ===== src/core/Demo.js =====
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

// ===== src/core/Eligibility.js =====
/**
 * @fileoverview Is this email meant for this student?
 *
 * It counts when it is for the student's batch and branch, or says "all
 * branches", or is addressed to the student. When an email says nothing
 * about who it is for, it is kept: hiding a real drive is the worse mistake.
 */
var PdEligibility = (function () {
  'use strict';

  function foldSet(values) {
    var set = {};
    (values || []).forEach(function (v) {
      var f = PdText.fold(v);
      if (f) set[f] = true;
    });
    return set;
  }

  /**
   * @param {{degrees:Array<string>, branches:Array<string>, allBranches:boolean, batches:Array<number>}} target
   *     who the email says it is for
   * @param {{batch:number, branchAliases:Array<string>, degreeAliases:Array<string>}} me
   * @param {boolean} direct true when the email names or is sent only to the student
   * @return {{forMe:string, reason:string}} forMe is 'yes', 'no' or 'maybe'
   */
  function evaluate(target, me, direct) {
    if (direct) return { forMe: 'yes', reason: 'Addressed to you' };

    if (target.batches.length && me.batch && target.batches.indexOf(me.batch) === -1) {
      return { forMe: 'no', reason: 'For batch ' + target.batches.join(', ') };
    }

    // "B.Tech", "BTech" and "B Tech" are one degree: compare letters only.
    var myDegrees = {};
    (me.degreeAliases || []).forEach(function (d) {
      var letters = String(d).toUpperCase().replace(/[^A-Z]/g, '');
      if (letters) myDegrees[letters] = true;
    });
    if (target.degrees.length && Object.keys(myDegrees).length) {
      var degreeHit = target.degrees.some(function (d) { return myDegrees[String(d).toUpperCase().replace(/[^A-Z]/g, '')]; });
      if (!degreeHit) return { forMe: 'no', reason: 'For ' + target.degrees.join(', ') };
    }

    if (target.allBranches) return { forMe: 'yes', reason: 'All branches' };

    if (target.branches.length) {
      var mine = foldSet(me.branchAliases);
      if (!Object.keys(mine).length) return { forMe: 'maybe', reason: 'Add your branch in Settings' };
      var hit = target.branches.some(function (b) { return mine[PdText.fold(b)]; });
      return hit
        ? { forMe: 'yes', reason: 'Your branch' }
        : { forMe: 'no', reason: 'For ' + target.branches[0] };
    }

    if (target.batches.length) return { forMe: 'yes', reason: 'Your batch' };
    return { forMe: 'maybe', reason: 'Does not say who it is for' };
  }

  /** Merge what the subject and the body each say; the subject wins on conflicts. */
  function combine(a, b) {
    function union(x, y) {
      var out = (x || []).slice();
      (y || []).forEach(function (v) { if (out.indexOf(v) === -1) out.push(v); });
      return out;
    }
    return {
      degrees: a.degrees.length ? a.degrees : b.degrees,
      branches: a.branches.length || a.allBranches ? a.branches : b.branches,
      allBranches: a.allBranches || (!a.branches.length && b.allBranches),
      batches: a.batches.length ? a.batches : union([], b.batches)
    };
  }

  /** Short text for the dashboard: "CS/IT, 2027" or "All branches, 2027". */
  function describe(target) {
    var parts = [];
    if (target.allBranches) parts.push('All branches');
    else if (target.branches.length) parts.push(target.branches[0]);
    if (target.batches.length) parts.push(target.batches.join('/'));
    return parts.join(', ');
  }

  return { evaluate: evaluate, combine: combine, describe: describe };
})();

// ===== src/core/Files.js =====
/**
 * @fileoverview Reading shortlist attachments safely.
 *
 * Attachments are untrusted. The rules here:
 *   - size limits are checked before anything is unpacked (a small zip can
 *     claim to unpack to gigabytes);
 *   - .xlsx and .docx files are read as plain XML text. Formulas and macros
 *     are never run: only the values already stored in the file are read;
 *   - the text is used for one thing, checking for the student's own name,
 *     and is never stored.
 */
var PdFiles = (function () {
  'use strict';

  var LIMITS = {
    maxBytes: 8 * 1024 * 1024,
    maxEntries: 2000,
    maxUnzippedBytes: 40 * 1024 * 1024,
    maxEntryBytes: 25 * 1024 * 1024,
    maxRows: 20000,
    maxCells: 200000
  };

  /** What kind of attachment this is, from its name and type. */
  function kindOf(filename, mimeType) {
    var name = String(filename || '').toLowerCase();
    var mime = String(mimeType || '').toLowerCase();
    if (/\.xlsm$|\.xlsb$|\.docm$/.test(name) || /macroenabled/.test(mime)) return 'macro';
    if (/\.xlsx$/.test(name) || mime.indexOf('spreadsheetml.sheet') !== -1) return 'xlsx';
    if (/\.docx$/.test(name) || mime.indexOf('wordprocessingml.document') !== -1) return 'docx';
    if (/\.csv$/.test(name) || mime === 'text/csv') return 'csv';
    if (/\.txt$/.test(name) || mime === 'text/plain') return 'txt';
    if (/\.pdf$/.test(name) || mime === 'application/pdf') return 'pdf';
    if (/\.xls$|\.doc$/.test(name)) return 'legacy';
    if (/^image\//.test(mime) || /\.(?:png|jpe?g|gif|webp|heic)$/.test(name)) return 'image';
    return 'other';
  }

  function u16(bytes, at) {
    return (bytes[at] & 0xff) | ((bytes[at + 1] & 0xff) << 8);
  }

  function u32(bytes, at) {
    return ((bytes[at] & 0xff) | ((bytes[at + 1] & 0xff) << 8) | ((bytes[at + 2] & 0xff) << 16)) + (bytes[at + 3] & 0xff) * 16777216;
  }

  /**
   * Read a zip file's table of contents without unpacking it, and refuse
   * anything too large, encrypted or malformed.
   * @param {Array<number>} bytes file bytes (signed or unsigned)
   * @return {{ok:boolean, reason:string, entries:Array<{name:string,size:number}>, total:number}}
   */
  function zipInspect(bytes, limits) {
    var lim = limits || LIMITS;
    var fail = function (reason) { return { ok: false, reason: reason, entries: [], total: 0 }; };
    var n = bytes ? bytes.length : 0;
    if (n < 22) return fail('not a zip file');
    if (n > lim.maxBytes) return fail('file too large');

    var eocd = -1;
    for (var i = n - 22; i >= Math.max(0, n - 65557); i--) {
      if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) return fail('not a zip file');

    var count = u16(bytes, eocd + 10);
    var dirSize = u32(bytes, eocd + 12);
    var dirStart = u32(bytes, eocd + 16);
    if (count === 0xffff || dirStart === 0xffffffff) return fail('zip64 not supported');
    if (count > lim.maxEntries) return fail('too many files inside');
    if (dirStart + dirSize > eocd) return fail('damaged zip file');

    var entries = [];
    var total = 0;
    var at = dirStart;
    for (var e = 0; e < count; e++) {
      if (at + 46 > n || u32(bytes, at) !== 0x02014b50) return fail('damaged zip file');
      var flags = u16(bytes, at + 8);
      var size = u32(bytes, at + 24);
      var nameLen = u16(bytes, at + 28);
      var extraLen = u16(bytes, at + 30);
      var commentLen = u16(bytes, at + 32);
      if (flags & 1) return fail('password-protected file');
      if (size === 0xffffffff) return fail('zip64 not supported');
      if (size > lim.maxEntryBytes) return fail('a file inside is too large');
      if (at + 46 + nameLen > n) return fail('damaged zip file');
      var name = '';
      for (var c = 0; c < nameLen; c++) name += String.fromCharCode(bytes[at + 46 + c] & 0xff);
      total += size;
      if (total > lim.maxUnzippedBytes) return fail('unpacks to too much data');
      entries.push({ name: name, size: size });
      at += 46 + nameLen + extraLen + commentLen;
    }
    return { ok: true, reason: '', entries: entries, total: total };
  }

  function xmlDecode(text) {
    return String(text).replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, function (all, code) {
      if (code === 'lt') return '<';
      if (code === 'gt') return '>';
      if (code === 'amp') return '&';
      if (code === 'quot') return '"';
      if (code === 'apos') return "'";
      var n = code.charAt(1) === 'x' || code.charAt(1) === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!isFinite(n) || n <= 0 || n > 0x10ffff) return '';
      return String.fromCodePoint ? String.fromCodePoint(n) : String.fromCharCode(n);
    });
  }

  /** The visible text inside an OOXML fragment: the contents of its <t> tags. */
  function textRuns(fragment, tag) {
    var re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g');
    var out = '';
    var m;
    while ((m = re.exec(fragment))) out += xmlDecode(m[1]);
    return out;
  }

  function columnIndex(ref) {
    var letters = /^([A-Z]+)/i.exec(ref || '');
    if (!letters) return -1;
    var n = 0;
    var s = letters[1].toUpperCase();
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  /**
   * Rows of text from a workbook.
   * @param {string} sharedStringsXml contents of xl/sharedStrings.xml ('' if absent)
   * @param {Array<string>} sheetXmls contents of each xl/worksheets/sheetN.xml
   * @return {{rows:Array<Array<string>>, truncated:boolean}}
   */
  function xlsxRows(sharedStringsXml, sheetXmls, limits) {
    var lim = limits || LIMITS;
    var shared = [];
    var m;
    var si = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    var source = String(sharedStringsXml || '');
    while ((m = si.exec(source))) {
      shared.push(textRuns(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, ''), 't'));
    }

    var rows = [];
    var cells = 0;
    var truncated = false;
    for (var s = 0; s < sheetXmls.length && !truncated; s++) {
      var rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
      var sheet = String(sheetXmls[s] || '');
      while ((m = rowRe.exec(sheet))) {
        if (rows.length >= lim.maxRows || cells >= lim.maxCells) { truncated = true; break; }
        var row = [];
        var cellRe = /<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g;
        var c;
        while ((c = cellRe.exec(m[1]))) {
          var attrs = c[1] || '';
          var inner = c[2] || '';
          var type = (/\st="([^"]*)"/.exec(attrs) || [])[1] || 'n';
          var ref = (/\sr="([^"]*)"/.exec(attrs) || [])[1] || '';
          var value;
          if (type === 'inlineStr') {
            value = textRuns(inner, 't');
          } else {
            var v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
            var raw = v ? xmlDecode(v[1]) : '';
            if (type === 's') {
              var index = parseInt(raw, 10);
              value = index >= 0 && index < shared.length ? shared[index] : '';
            } else {
              value = raw;
            }
          }
          var col = columnIndex(ref);
          if (col < 0 || col > 500) col = row.length;
          while (row.length < col) row.push('');
          row[col] = value;
          cells++;
        }
        if (row.length) rows.push(row);
      }
    }
    return { rows: rows, truncated: truncated };
  }

  /** Rows of text from a Word document: table rows, then loose paragraphs. */
  function docxRows(documentXml, limits) {
    var lim = limits || LIMITS;
    var xml = String(documentXml || '');
    var rows = [];
    var m;
    var tr = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
    while ((m = tr.exec(xml)) && rows.length < lim.maxRows) {
      var row = [];
      var tc = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;
      var c;
      while ((c = tc.exec(m[1]))) row.push(textRuns(c[1], 'w:t'));
      if (row.length) rows.push(row);
    }
    var loose = xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g, '');
    var p = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
    while ((m = p.exec(loose)) && rows.length < lim.maxRows) {
      var text = textRuns(m[1], 'w:t');
      if (text) rows.push([text]);
    }
    return { rows: rows, truncated: rows.length >= lim.maxRows };
  }

  /** Rows from CSV text. Understands quoted cells and , ; or tab separators. */
  function csvRows(text, limits) {
    var lim = limits || LIMITS;
    var s = String(text || '').replace(/^\uFEFF/, '');
    var firstLine = s.split(/\r?\n/, 1)[0] || '';
    var delimiter = ',';
    if (firstLine.split('\t').length > firstLine.split(',').length) delimiter = '\t';
    else if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';

    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    var truncated = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (quoted) {
        if (ch === '"') {
          if (s.charAt(i + 1) === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += ch;
      } else if (ch === '"' && cell === '') {
        quoted = true;
      } else if (ch === delimiter) {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s.charAt(i + 1) === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        if (rows.length >= lim.maxRows) { truncated = true; break; }
      } else cell += ch;
    }
    if (!truncated && (cell !== '' || row.length)) { row.push(cell); rows.push(row); }
    return { rows: rows, truncated: truncated };
  }

  return {
    LIMITS: LIMITS,
    kindOf: kindOf,
    zipInspect: zipInspect,
    xmlDecode: xmlDecode,
    xlsxRows: xlsxRows,
    docxRows: docxRows,
    csvRows: csvRows
  };
})();

// ===== src/core/Match.js =====
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

// ===== src/core/Mime.js =====
/**
 * @fileoverview Walking a Gmail message: headers, the readable text and the
 * list of attachments. Works on the plain object the Gmail API returns, so it
 * can be tested without Gmail.
 */
var PdMime = (function () {
  'use strict';

  var MAX_PARTS = 200;

  function header(payload, name) {
    var headers = (payload && payload.headers) || [];
    var wanted = name.toLowerCase();
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i].name).toLowerCase() === wanted) return String(headers[i].value || '');
    }
    return '';
  }

  /** Every email address in a To/Cc/From header, lower-cased. */
  function addresses(value) {
    var out = [];
    var re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    var m;
    while ((m = re.exec(String(value || '')))) {
      var a = m[0].toLowerCase();
      if (out.indexOf(a) === -1) out.push(a);
    }
    return out;
  }

  /**
   * Collect the text parts and attachments of a message.
   * Part bodies are left exactly as the API gave them (the caller decodes).
   * @return {{plain:Array, html:Array, attachments:Array<Object>}}
   */
  function collect(payload) {
    var result = { plain: [], html: [], attachments: [] };
    var seen = 0;
    function walk(part) {
      if (!part || seen++ > MAX_PARTS) return;
      var mime = String(part.mimeType || '').toLowerCase();
      var body = part.body || {};
      if (part.filename) {
        result.attachments.push({
          filename: String(part.filename),
          mimeType: mime,
          size: Number(body.size) || 0,
          attachmentId: body.attachmentId ? String(body.attachmentId) : ''
        });
      } else if (mime === 'text/plain' && body.data) {
        result.plain.push(body.data);
      } else if (mime === 'text/html' && body.data) {
        result.html.push(body.data);
      }
      (part.parts || []).forEach(walk);
    }
    walk(payload);
    return result;
  }

  /** Readable text from an HTML body. Tags are dropped, never rendered. */
  function htmlToText(html) {
    return PdFiles.xmlDecode(
      String(html || '')
        .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>(?!\n)/gi, '\n')
        .replace(/<\/(?:p|div|tr|li|h[1-6]|table)>/gi, '\n')
        .replace(/<\/t[dh]>/gi, '\t')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
    ).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  }

  /** Turn tab-separated lines (from an HTML table) into rows of cells. */
  function tableRows(text) {
    return String(text || '').split('\n')
      .filter(function (line) { return line.indexOf('\t') !== -1; })
      .map(function (line) { return line.split('\t').map(PdText.normalise); });
  }

  return { header: header, addresses: addresses, collect: collect, htmlToText: htmlToText, tableRows: tableRows };
})();

// ===== src/core/Pipeline.js =====
/**
 * @fileoverview From one email to one dashboard item.
 *
 * This is the whole decision path for a message, with no Google services
 * involved: read the subject and body, decide whether it is for this
 * student, and describe it as a row.
 */
var PdPipeline = (function () {
  'use strict';

  var REGISTRATION_KINDS = { drive: 1, internship: 1, hackathon: 1, talk: 1, info: 1 };

  function isTrusted(meta, settings) {
    var from = String(meta.from || '').toLowerCase();
    var fromTrusted = (settings.senders || []).some(function (a) { return from.indexOf(a) !== -1; });
    if (fromTrusted) return true;
    var recipients = (meta.to || []).concat(meta.cc || []);
    return (settings.lists || []).some(function (a) { return recipients.indexOf(a) !== -1; });
  }

  /** True when the message was sent to the student personally, not to a list. */
  function isDirect(meta, myEmails) {
    var to = meta.to || [];
    if (!to.length || to.length > 3) return false;
    return to.some(function (a) { return myEmails.indexOf(a) !== -1; });
  }

  function mailUrl(threadId) {
    return /^[0-9a-f]{8,32}$/i.test(String(threadId || '')) ? 'https://mail.google.com/mail/u/0/#all/' + threadId : '';
  }

  /**
   * @param {{id:string, threadId:string, subject:string, from:string, to:Array<string>, cc:Array<string>, dateMs:number}} meta
   * @param {string} bodyText plain-text body ('' when only the subject is known)
   * @param {{settings:Object, identity:Object, myEmails:Array<string>, offsetFn:function(number):number, knownCompanies:Array<string>}} env
   * @return {{skip:string, item:(Object|undefined), checkList:(boolean|undefined), body:(Object|undefined)}}
   */
  function toItem(meta, bodyText, env) {
    var settings = env.settings;
    var base = PdDates.toParts(meta.dateMs, env.offsetFn);
    var ctx = { base: base, order: settings.order, knownCompanies: env.knownCompanies };
    var subj = PdSubject.parse(meta.subject, ctx);
    var body = PdBody.parse(bodyText, ctx);
    var trusted = isTrusted(meta, settings);

    // A keyword search can return newsletters; without a placement sender we
    // need the subject itself to look like placement mail.
    if (!trusted && subj.kind === 'info') return { skip: 'not placement mail' };

    var company = subj.company;
    var companyKey = subj.companyKey;
    if (!company && body.fields.company) {
      company = PdSubject.cleanCompany(body.fields.company);
      companyKey = PdDedupe.companyKey(company);
    }

    var target = PdEligibility.combine(subj, body.eligibility);
    var named = PdMatch.matchText(body.text, env.identity).status === 'found';
    var verdict = PdEligibility.evaluate(target, {
      batch: settings.batch, branchAliases: settings.branchAliases, degreeAliases: settings.degreeAliases
    }, isDirect(meta, env.myEmails || []) || named);
    if (verdict.forMe === 'no') return { skip: 'for another branch or batch' };

    var deadline = REGISTRATION_KINDS[subj.kind] ? (subj.deadline || body.deadline) : null;
    var eventDate = subj.eventDate || body.eventDate;
    var details = subj.details;
    var title = company ? company + ' \u2013 ' + PdSubject.KIND_LABEL[subj.kind] : subj.title;

    var item = {
      key: '',
      track: subj.track,
      company: company,
      kind: subj.kind,
      title: title,
      eligible: PdEligibility.describe(target),
      forMe: verdict.forMe,
      deadline: PdDates.toIso(deadline),
      eventDate: PdDates.toIso(eventDate),
      venue: subj.venue || body.fields.venue || subj.mode || '',
      pay: details.ctc || details.stipend || body.fields.ctc || body.fields.stipend || '',
      role: details.role || body.fields.role || '',
      round: subj.round,
      formUrl: PdText.safeUrl(body.formUrl),
      prefillUrl: '',
      mailUrl: mailUrl(meta.threadId),
      latest: PdText.truncate(subj.subject, 160),
      firstSeenMs: meta.dateMs,
      updatedMs: meta.dateMs,
      shortlisted: '',
      shortlistDay: ''
    };
    item.key = PdDedupe.itemKey({ companyKey: companyKey, track: subj.track, title: subj.title, subject: subj.subject });

    // "Borealis : List of shortlisted students" does not say whether it is
    // about the internship or the placement drive. A follow-up joins the row
    // the company already has rather than starting a second one.
    if (companyKey && subj.kind !== 'drive' && subj.kind !== 'internship' && env.findRow) {
      var existing = env.findRow(companyKey, item.key);
      if (existing) { item.key = existing.key; item.track = existing.track; }
    }

    return {
      skip: '',
      item: item,
      checkList: subj.hasList || subj.kind === 'result',
      body: body
    };
  }

  /**
   * Is the student on this list? Looks at the email text and at every table
   * that could be read from the attachments.
   * @param {string} bodyText
   * @param {Array<Array<Array<string>>>} tables rows from each readable attachment
   * @param {number} unreadable how many attachments could not be read
   * @return {{status:string, via:string}} status: found, possible, none or unread
   */
  function checkList(bodyText, tables, unreadable, identity) {
    var best = PdMatch.matchText(bodyText, identity);
    best = PdMatch.better(best, PdMatch.matchRows(PdMime.tableRows(bodyText), identity));
    (tables || []).forEach(function (rows) { best = PdMatch.better(best, PdMatch.matchRows(rows, identity)); });
    if (best.status === 'none' && unreadable > 0) return { status: 'unread', via: '' };
    return best;
  }

  return { toItem: toItem, checkList: checkList, isTrusted: isTrusted, isDirect: isDirect };
})();

// ===== src/core/Plan.js =====
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
    // Names come from email subjects. In the summary email they are shown
    // without any web address, so a crafted subject cannot plant a link.
    function label(item) {
      return PdText.truncate(String(item.company || item.title || '').replace(/(?:https?:\/\/|www\.)\S+/gi, '[link]'), 40);
    }
    function names(list, max) {
      var shown = list.slice(0, max).map(function (r) { return label(r.item); });
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
      lines.push('On a list: ' + label(first) + (first.eventDate ? ' (' + human(first.eventDate) + ')' : '') +
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

    function hoursLeft(iso) {
      var parts = PdDates.fromIso(iso);
      return parts ? (PdDates.endEpoch(parts, offsetFn) - nowMs) / 3600000 : Infinity;
    }

    var live = rows.filter(function (r) { return r.todo; }).sort(byUrgency);
    var todos = live.slice(0, 40).map(function (r) {
      return [when(r.item), r.todo, name(r.item), link('Open form', r.item.prefillUrl || r.item.formUrl), link('Open email', r.item.mailUrl)];
    });
    // Colour carries meaning, nothing else: green for "you are on a list",
    // amber for "look at this soon".
    var tones = live.slice(0, 40).map(function (r) {
      if (/^You are on the list/.test(r.todo)) return 'good';
      if (/^(?:Check the list|Open the email)/.test(r.todo)) return 'warn';
      var soonest = urgency(r.item, nowMs, offsetFn);
      return soonest !== '9999' && hoursLeft(soonest) <= 36 ? 'warn' : '';
    });
    var onList = live.filter(function (r) { return r.item.shortlisted === 'found'; }).length;
    var closing = live.filter(function (r) { return /^Register by/.test(r.todo) && hoursLeft(r.item.deadline) <= 36; }).length;

    var horizon = nowMs + 14 * DAY_MS;
    var comingAll = rows.filter(function (r) {
      var m = mark(r.mark);
      if (m === 'skip' || m === 'not applicable' || m === 'hidden') return false;
      var parts = PdDates.fromIso(r.item.eventDate);
      if (!parts) return false;
      var end = PdDates.endEpoch(parts, offsetFn);
      return end >= nowMs && end <= horizon;
    }).sort(function (a, b) { return a.item.eventDate < b.item.eventDate ? -1 : 1; });
    var coming = comingAll.slice(0, 25).map(function (r) {
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
      // The one thing to look at first: the most urgent to-do, in words.
      next: live.length
        ? { text: name(live[0].item) + ': ' + live[0].todo, tone: tones[0] || 'accent' }
        : { text: 'You are all caught up.', tone: 'quiet' },
      // Each number is counted the same way as the list below it.
      tiles: [
        { value: String(live.length), label: 'To do', tone: 'accent' },
        { value: String(onList), label: 'On a list', tone: onList ? 'good' : 'quiet' },
        { value: String(closing), label: 'Closing within 36 hours', tone: closing ? 'warn' : 'quiet' },
        { value: String(comingAll.length), label: 'Coming up in 14 days', tone: 'quiet' }
      ],
      sections: [
        { id: 'todo', title: 'To do', header: ['When', 'What', 'Company', 'Form', 'Email'], rows: todos, tones: tones, empty: 'Nothing to do right now. To look for new email, choose Placement Desk > Check my email now.' },
        { id: 'coming', title: 'Coming up (next 14 days)', header: ['When', 'What', 'Company', 'Where', 'Your mark'], rows: coming, tones: [], empty: 'Nothing scheduled in the next 14 days.' },
        { id: 'practice', title: 'Practice that has gone cold', header: ['Skill', 'Status', 'Next task'], rows: practice, tones: [], empty: 'Nothing has gone cold. To track a skill, put a date under Practice > Last practised.' }
      ]
    };
  }

  return {
    MARKS: MARKS, LIST_TEXT: LIST_TEXT, mark: mark, todo: todo, urgency: urgency,
    summary: summary, upcoming: upcoming, display: display, dashboard: dashboard
  };
})();

// ===== src/core/Prefill.js =====
/**
 * @fileoverview Pre-filled Google Form links.
 *
 * A public Google Form's page carries its list of questions in a script
 * variable called FB_PUBLIC_LOAD_DATA_. Each question has an entry id, and
 * Google Forms itself supports links of the form
 *
 *   .../viewform?usp=pp_url&entry.123=Asha&entry.456=CS
 *
 * that open the form with those answers typed in. This file matches the
 * questions to the student's saved profile and builds that link.
 *
 * It never submits anything. The student opens the link, checks every
 * answer and presses Submit themselves.
 */
var PdPrefill = (function () {
  'use strict';

  var MAX_HTML = 3 * 1024 * 1024;
  var MAX_URL = 7000;

  var TYPE = {
    0: 'short', 1: 'paragraph', 2: 'choice', 3: 'dropdown', 4: 'checkboxes',
    5: 'scale', 7: 'grid', 9: 'date', 10: 'time', 13: 'upload', 18: 'rating'
  };

  /**
   * Profile fields the tool knows how to recognise in a form.
   * `keywords` are phrases looked for in the question; `not` lists words
   * that mean the question is about someone or something else.
   */
  var FIELDS = [
    { key: 'fullName', label: 'Full name', keywords: ['full name', 'name of the student', 'name of student', 'student name', 'candidate name', 'name of the candidate', 'name of candidate', 'your name', 'name as per', 'name'], not: ['father', 'mother', 'parent', 'guardian', 'company', 'school', 'project', 'team', 'reference', 'mentor', 'first', 'last', 'middle', 'user', 'file'] },
    { key: 'firstName', label: 'First name', keywords: ['first name', 'given name'] },
    { key: 'middleName', label: 'Middle name', keywords: ['middle name'] },
    { key: 'lastName', label: 'Last name', keywords: ['last name', 'surname', 'family name'] },
    { key: 'rollNumber', label: 'Roll number / PRN', keywords: ['prn', 'prn no', 'prn number', 'roll no', 'roll number', 'enrollment', 'enrolment', 'registration number', 'registration no', 'seat number', 'seat no', 'student id', 'college id', 'usn', 'university number', 'hall ticket'] },
    { key: 'email', label: 'Personal email', keywords: ['email', 'e mail', 'mail id', 'email id', 'email address', 'personal email', 'personal mail'], not: ['college', 'official', 'institute', 'university'] },
    { key: 'collegeEmail', label: 'College email', keywords: ['college email', 'college mail', 'official email', 'official mail', 'institute email', 'university email', 'college e mail'] },
    { key: 'phone', label: 'Mobile number', keywords: ['mobile', 'phone', 'contact number', 'contact no', 'whatsapp', 'mobile number', 'mobile no'], not: ['parent', 'father', 'mother', 'guardian', 'alternate'] },
    { key: 'gender', label: 'Gender', keywords: ['gender', 'sex'] },
    { key: 'dob', label: 'Date of birth', keywords: ['date of birth', 'dob', 'birth date', 'birthdate'] },
    { key: 'college', label: 'College', keywords: ['college name', 'name of college', 'name of the college', 'institute name', 'name of the institute', 'name of institute', 'college', 'institute', 'university name'], not: ['email', 'mail', 'id'] },
    { key: 'degree', label: 'Degree', keywords: ['degree', 'course', 'qualification', 'programme', 'program'] },
    { key: 'branch', label: 'Branch', keywords: ['branch', 'department', 'stream', 'specialization', 'specialisation', 'discipline'] },
    { key: 'batch', label: 'Passing year', keywords: ['batch', 'passing year', 'year of passing', 'passout year', 'pass out year', 'graduation year', 'year of graduation', 'passing out year'], not: ['10th', '12th', 'ssc', 'hsc', 'diploma'] },
    { key: 'cgpa', label: 'CGPA', keywords: ['cgpa', 'cpi', 'gpa', 'sgpa', 'cgpa till', 'aggregate cgpa', 'current cgpa'] },
    { key: 'percent', label: 'Degree percentage', keywords: ['aggregate percentage', 'be percentage', 'btech percentage', 'b tech percentage', 'ug percentage', 'graduation percentage', 'degree percentage', 'engineering percentage', 'aggregate', 'percentage'], not: ['10th', '12th', 'ssc', 'hsc', 'diploma', 'x', 'xii', 'tenth', 'twelfth'] },
    { key: 'tenth', label: '10th percentage', keywords: ['10th', 'ssc', 'class 10', 'class x', 'tenth', 'matriculation', 'std 10', 'x th'] },
    { key: 'twelfth', label: '12th percentage', keywords: ['12th', 'hsc', 'class 12', 'class xii', 'twelfth', 'intermediate', 'std 12', 'xii th'] },
    { key: 'diploma', label: 'Diploma percentage', keywords: ['diploma'] },
    { key: 'backlogs', label: 'Active backlogs', keywords: ['backlog', 'backlogs', 'active backlog', 'live backlog', 'atkt', 'arrears', 'kt'] },
    { key: 'gapYears', label: 'Gap years', keywords: ['gap', 'year gap', 'education gap', 'gap in education'] },
    { key: 'city', label: 'City', keywords: ['city', 'current location', 'hometown', 'home town', 'native place', 'current city'] },
    { key: 'linkedin', label: 'LinkedIn', keywords: ['linkedin', 'linked in'] },
    { key: 'github', label: 'GitHub', keywords: ['github', 'git hub'] },
    { key: 'resumeLink', label: 'Resume link', keywords: ['resume link', 'cv link', 'resume drive link', 'resume url', 'link of resume', 'link to resume', 'resume'] }
  ];

  /** The canonical viewform address of a Google Form, or '' if it is not one. */
  function normaliseFormUrl(url) {
    var safe = PdText.safeUrl(url);
    if (!safe || PdText.hostOf(safe) !== 'docs.google.com') return '';
    var m = /^https:\/\/docs\.google\.com\/forms\/((?:u\/\d+\/)?d\/(?:e\/)?[A-Za-z0-9_-]{10,120})(?:\/|$|\?|#)/.exec(safe);
    if (!m) return '';
    return 'https://docs.google.com/forms/' + m[1].replace(/^u\/\d+\//, '') + '/viewform';
  }

  /**
   * Pull the question list out of a form page.
   * The value is read as JSON only: nothing from the page is executed.
   * @return {Array|null}
   */
  function extractLoadData(html) {
    var s = String(html || '');
    if (s.length > MAX_HTML) return null;
    var assign = /FB_PUBLIC_LOAD_DATA_\s*=\s*\[/.exec(s);
    if (!assign) return null;
    var start = assign.index + assign[0].length - 1;
    var depth = 0;
    var inString = false;
    for (var i = start; i < s.length; i++) {
      var ch = s.charAt(i);
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          try {
            var data = JSON.parse(s.slice(start, i + 1));
            return Array.isArray(data) ? data : null;
          } catch (e) {
            return null;
          }
        }
      }
    }
    return null;
  }

  /**
   * @param {Array} data the FB_PUBLIC_LOAD_DATA_ value
   * @return {{title:string, questions:Array<Object>}|null}
   */
  function parseForm(data) {
    if (!Array.isArray(data) || !Array.isArray(data[1]) || !Array.isArray(data[1][1])) return null;
    var questions = [];
    data[1][1].forEach(function (item) {
      if (!Array.isArray(item)) return;
      var typeCode = item[3];
      var type = Object.prototype.hasOwnProperty.call(TYPE, typeCode) ? TYPE[typeCode] : '';
      if (!type) return;
      var entry = Array.isArray(item[4]) && Array.isArray(item[4][0]) ? item[4][0] : null;
      var entryId = entry && (typeof entry[0] === 'number' || /^\d+$/.test(String(entry[0]))) ? String(entry[0]) : '';
      var options = [];
      var hasOther = false;
      if (entry && Array.isArray(entry[1])) {
        entry[1].forEach(function (opt) {
          if (!Array.isArray(opt)) return;
          if (opt[4] === 1 || opt[4] === true) { hasOther = true; return; }
          if (typeof opt[0] === 'string' && opt[0] !== '') options.push(opt[0]);
        });
      }
      questions.push({
        title: PdText.truncate(PdText.normalise(item[1]), 200),
        type: type,
        entryId: entryId,
        required: !!(entry && entry[2]),
        options: options,
        hasOther: hasOther
      });
    });
    var title = typeof data[3] === 'string' ? data[3] : (typeof data[1][8] === 'string' ? data[1][8] : '');
    return { title: PdText.truncate(PdText.normalise(title), 150), questions: questions };
  }

  function containsPhrase(foldedText, foldedPhrase) {
    return (' ' + foldedText + ' ').indexOf(' ' + foldedPhrase + ' ') !== -1;
  }

  function isFilled(field) {
    return field.value !== undefined && field.value !== null && String(field.value) !== '';
  }

  /** Fields whose phrases appear in `text`, each with its longest phrase and where it sits. */
  function candidates(text, fullText, fields) {
    var out = [];
    var padded = ' ' + text + ' ';
    fields.forEach(function (field) {
      var blocked = (field.not || []).some(function (word) { return containsPhrase(fullText, PdText.fold(word)); });
      if (blocked) return;
      var score = 0;
      var at = -1;
      (field.keywords || []).forEach(function (keyword) {
        var k = PdText.fold(keyword);
        var index = k ? padded.indexOf(' ' + k + ' ') : -1;
        if (index !== -1 && k.length > score) { score = k.length; at = index; }
      });
      if (score) out.push({ field: field, score: score, start: at, end: at + score });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  /**
   * The profile field a question is asking for.
   *
   * - The longest matching phrase wins: "college email" beats "email", and
   *   "name of the college" beats "name".
   * - Words in brackets are qualifiers ("Full Name (as per college records)"),
   *   so the text outside brackets is tried first.
   * - "12th / Diploma percentage" names two things; the one the student has
   *   filled in is used.
   * - A tie is left for the student to answer.
   * @return {{field:Object, score:number}|null}
   */
  function pickField(questionTitle, fields) {
    var full = PdText.fold(questionTitle);
    if (!full) return null;
    var outer = PdText.fold(String(questionTitle).replace(/\([^)]*\)/g, ' '));
    var found = outer ? candidates(outer, full, fields) : [];
    if (!found.length) found = candidates(full, full, fields);
    if (!found.length) return null;

    var best = found[0];
    if (!isFilled(best.field)) {
      for (var i = 1; i < found.length; i++) {
        var other = found[i];
        var apart = other.end <= best.start || other.start >= best.end;
        if (apart && isFilled(other.field)) { best = other; break; }
      }
    }
    var tie = found.some(function (c) {
      return c !== best && c.score === best.score && c.field.key !== best.field.key && isFilled(c.field) === isFilled(best.field);
    });
    return tie ? null : { field: best.field, score: best.score };
  }

  /** The option that means the same as the student's answer, or ''. */
  function pickOption(options, value, aliases) {
    var wanted = [value].concat(aliases || []).map(PdText.fold).filter(Boolean);
    var i;
    for (i = 0; i < options.length; i++) {
      if (wanted.indexOf(PdText.fold(options[i])) !== -1) return options[i];
    }
    var partial = options.filter(function (option) {
      var o = PdText.fold(option);
      return wanted.some(function (w) { return containsPhrase(o, w) || containsPhrase(w, o); });
    });
    return partial.length === 1 ? partial[0] : '';
  }

  function toIsoDate(value, order) {
    var found = PdDates.firstDate(String(value), { base: { y: 2000, m: 1, d: 1 }, order: order });
    return found ? PdDates.toIso({ y: found.y, m: found.m, d: found.d, hasTime: false }) : '';
  }

  /**
   * Match a form's questions to the profile.
   * @param {Array<Object>} questions from parseForm
   * @param {Array<Object>} fields profile fields: {key, label, value, keywords, not, aliases}
   * @param {{order:(string|undefined)}=} opts
   * @return {{answers:Array<Object>, manual:Array<Object>}}
   */
  function mapQuestions(questions, fields, opts) {
    var answers = [];
    var manual = [];
    var order = opts && opts.order;
    questions.forEach(function (q) {
      var reason = '';
      var hit = pickField(q.title, fields);
      var value = hit ? String(hit.field.value === undefined || hit.field.value === null ? '' : hit.field.value) : '';
      if (q.type === 'upload') reason = 'Upload the file yourself';
      else if (q.type === 'grid' || q.type === 'scale' || q.type === 'rating' || q.type === 'time') reason = 'Answer this one yourself';
      else if (!q.entryId) reason = 'Answer this one yourself';
      else if (!hit) reason = 'Not in your profile';
      else if (value === '') reason = 'Add "' + hit.field.label + '" to your profile';

      if (!reason && (q.type === 'choice' || q.type === 'dropdown' || q.type === 'checkboxes')) {
        var option = pickOption(q.options, value, hit.field.aliases);
        if (option) value = option;
        else reason = 'Pick from the options (your answer: ' + PdText.truncate(value, 40) + ')';
      }
      if (!reason && q.type === 'date') {
        value = toIsoDate(value, order);
        if (!value) reason = 'Enter the date yourself';
      }

      if (reason) {
        manual.push({ question: q.title, reason: reason, required: q.required });
      } else {
        answers.push({ entryId: q.entryId, value: value, question: q.title, field: hit.field.label });
      }
    });
    return { answers: answers, manual: manual };
  }

  /** Build the viewform link that opens with the answers typed in. */
  function buildUrl(formUrl, answers) {
    var base = normaliseFormUrl(formUrl);
    if (!base) return '';
    var url = base + '?usp=pp_url';
    for (var i = 0; i < answers.length; i++) {
      var a = answers[i];
      if (!/^\d+$/.test(String(a.entryId))) continue;
      var part = '&entry.' + a.entryId + '=' + encodeURIComponent(String(a.value));
      if (url.length + part.length > MAX_URL) break;
      url += part;
    }
    return url;
  }

  /**
   * Turn a CGPA into a percentage using the rule from Settings.
   * Universities differ, so there is no built-in default: the student copies
   * the rule from their own university's circular.
   *   "x9.5"      multiply by 9.5
   *   "x10-7.5"   multiply by 10, then subtract 7.5
   *   "x8.8+0"    same shape with any numbers
   * @return {string} percentage with up to two decimals, or '' if unknown
   */
  function cgpaToPercent(cgpa, formula) {
    var value = parseFloat(String(cgpa).replace(',', '.'));
    var m = /^\s*[x*\u00D7]\s*(\d+(?:\.\d+)?)\s*(?:([+\-\u2212])\s*(\d+(?:\.\d+)?))?\s*$/i.exec(String(formula || ''));
    if (!isFinite(value) || !m) return '';
    var result = value * parseFloat(m[1]);
    if (m[2]) result += (m[2] === '+' ? 1 : -1) * parseFloat(m[3]);
    if (!isFinite(result) || result < 0 || result > 100) return '';
    return String(Math.round(result * 100) / 100);
  }

  /** Label and answer pairs for the copy-ready list, skipping blanks. */
  function answerSheet(fields) {
    return fields
      .filter(function (f) { return f.value !== undefined && f.value !== null && String(f.value) !== ''; })
      .map(function (f) { return { label: f.label, value: String(f.value) }; });
  }

  return {
    FIELDS: FIELDS,
    normaliseFormUrl: normaliseFormUrl,
    extractLoadData: extractLoadData,
    parseForm: parseForm,
    pickField: pickField,
    pickOption: pickOption,
    mapQuestions: mapQuestions,
    buildUrl: buildUrl,
    cgpaToPercent: cgpaToPercent,
    answerSheet: answerSheet
  };
})();

// ===== src/core/Queries.js =====
/**
 * @fileoverview The Gmail searches, and the safety net behind them.
 *
 * Privacy is enforced twice:
 *   1. The searches themselves exclude OTP, password, bank and social mail,
 *      so those messages are never returned.
 *   2. isSensitive() looks at the subject and sender of every result before
 *      its body is fetched, and drops anything that slipped through.
 */
var PdQueries = (function () {
  'use strict';

  var DEFAULT_KEYWORDS = [
    'shortlist', 'shortlisted', 'assessment', 'interview', 'CoCubes', 'AMCAT',
    'eLitmus', 'SHL', 'test link', 'hackathon', 'pre-placement talk',
    'pre placement talk', 'campus drive', 'recruitment drive', 'internship drive'
  ];

  var EXCLUDED_SUBJECT_TERMS = [
    'OTP', 'one time password', 'verification code', 'security code', 'password',
    'passcode', 'security alert', 'sign-in', 'new login', 'login alert',
    '2-step', 'two-factor', 'account statement', 'transaction alert', 'debited', 'credited'
  ];

  // Codes, passwords and account security: never opened, whoever sent them.
  var SECRET_SUBJECT = [
    /\botp\b/i, /\bone[- ]?time[- ]?(?:password|passcode|pin)\b/i,
    /\bverification\s+(?:code|link)\b/i, /\b(?:security|login|sign[- ]?in|authentication)\s+code\b/i,
    /\bpass(?:word|code)\b/i, /\bsecurity\s+alert\b/i, /\bnew\s+(?:sign[- ]?in|login|device)\b/i,
    /\bsign[- ]?in\s+attempt\b/i, /\b(?:2|two)[- ]?(?:step|factor)\b/i, /\bverify\s+your\s+(?:email|account|identity)\b/i,
    /\breset\s+your\b/i
  ];

  // Money mail. Skipped unless it comes from a placement sender, whose
  // subjects can legitimately name a bank as an employer.
  var MONEY_SUBJECT = [
    /\baccount\s+statement\b/i, /\be[- ]?statement\b/i,
    /\b(?:debited|credited)\b/i, /\btransaction\s+(?:alert|successful|failed|declined)\b/i,
    /\bupi\b/i, /\bnet\s?banking\b/i, /\bcredit\s+card\b/i, /\bdebit\s+card\b/i, /\bkyc\b/i,
    /\bpayment\s+(?:received|successful|failed|due)\b/i, /\ba\/c\b/i
  ];

  var SENSITIVE_SENDER = [
    /bank/i, /\bupi\b/i, /paytm/i, /phonepe/i, /gpay/i, /razorpay/i, /\balerts?@/i,
    /no-?reply@accounts\./i, /security@/i, /facebookmail/i, /instagram/i, /whatsapp/i,
    /twitter\.com/i, /@x\.com/i, /snapchat/i, /tinder/i, /discord/i
  ];

  function cleanAddress(value) {
    var s = PdText.normalise(value).toLowerCase();
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : '';
  }

  /** Keep only what is safe inside a quoted Gmail search term. */
  function cleanTerm(value) {
    return PdText.normalise(value).replace(/["(){}\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function quote(term) {
    return /[\s-]/.test(term) ? '"' + term + '"' : term;
  }

  function exclusions(extraTerms) {
    var terms = EXCLUDED_SUBJECT_TERMS.concat((extraTerms || []).map(cleanTerm).filter(Boolean));
    return '-subject:(' + terms.map(quote).join(' OR ') + ') -in:chats -in:drafts -in:spam -in:trash';
  }

  /**
   * @param {{senders:Array<string>, lists:Array<string>, keywords:Array<string>, excludeTerms:Array<string>}} settings
   * @param {number} days how far back to look
   * @return {Array<{name:string, query:string}>}
   */
  function build(settings, days) {
    var window = 'newer_than:' + Math.max(1, Math.min(60, Math.round(days))) + 'd';
    var exclude = exclusions(settings.excludeTerms);
    var out = [];

    var senders = (settings.senders || []).map(cleanAddress).filter(Boolean);
    var lists = (settings.lists || []).map(cleanAddress).filter(Boolean);
    var sources = senders.map(function (a) { return 'from:' + a; })
      .concat(lists.map(function (a) { return 'to:' + a; }))
      .concat(lists.map(function (a) { return 'cc:' + a; }));
    if (sources.length) out.push({ name: 'placement cell', query: '{' + sources.join(' ') + '} ' + window + ' ' + exclude });

    var keywords = (settings.keywords && settings.keywords.length ? settings.keywords : DEFAULT_KEYWORDS)
      .map(cleanTerm).filter(Boolean);
    if (keywords.length) {
      out.push({
        name: 'keywords',
        query: '(' + keywords.map(quote).join(' OR ') + ') ' + window + ' ' + exclude + ' -category:social -category:promotions'
      });
    }
    return out;
  }

  /**
   * Second line of defence: true when a message must not be opened.
   * A configured placement sender is trusted for bank-like company names
   * ("Harbour Bank recruitment drive"), but never for codes and passwords.
   */
  function isSensitive(subject, from, trustedSenders) {
    var s = PdText.normalise(subject);
    var sender = PdText.normalise(from).toLowerCase();
    var trusted = (trustedSenders || []).some(function (a) {
      var clean = cleanAddress(a);
      return clean && sender.indexOf(clean) !== -1;
    });
    function any(patterns, text) {
      return patterns.some(function (re) { return re.test(text); });
    }
    if (any(SECRET_SUBJECT, s)) return true;
    if (trusted) return false;
    return any(MONEY_SUBJECT, s) || any(SENSITIVE_SENDER, sender);
  }

  return {
    DEFAULT_KEYWORDS: DEFAULT_KEYWORDS,
    build: build,
    isSensitive: isSensitive,
    cleanAddress: cleanAddress
  };
})();

// ===== src/core/Subject.js =====
/**
 * @fileoverview Reading a placement-cell subject line.
 *
 * Placement cells write long, structured subjects, for example:
 *
 *   Acme Robotics Recruitment drive for BE/BTech (CS/IT) 2027 Batch scheduled
 *   on 7th October 2026 at 9:00 a.m. at Main Campus || CTC : 6 LPA ||
 *   Last date to register : 06-10-2026 till 4:00 PM ||
 *
 * Most of what the dashboard needs is in that one line, so rules come first
 * and an AI model is only ever an optional fallback.
 */
var PdSubject = (function () {
  'use strict';

  var KIND_LABEL = {
    drive: 'Placement drive', internship: 'Internship drive', shortlist: 'Shortlist',
    interview: 'Interview', assessment: 'Test', talk: 'Talk', hackathon: 'Hackathon',
    result: 'Result', info: 'Notice'
  };

  var REPLY_PREFIX = /^\s*(?:(?:re|fwd?|fw)\s*:\s*)+/i;
  var FLAGS = [
    { flag: 'reminder', re: /^\s*(?:(?:gentle|final|last|kind|friendly)\s+)?reminder\b\s*(?:[-:\u2013]+|for\b|regarding\b)?\s*/i },
    { flag: 'urgent', re: /^\s*(?:(?:very|most)\s+)?(?:urgent|important)\b(?:\s*(?:&|and|\/)\s*(?:urgent|important)\b)?\s*[-:\u2013!]*\s*/i },
    { flag: 'update', re: /^\s*update\b\s*(?:regarding|on|for|about)?\s*[-:\u2013]*\s*/i }
  ];
  var LEAD_IN = /^(?:(?:instructions?|guidelines|details|information|notice|schedule|regarding|about)\s+(?:for|of|regarding|about|on)\s+(?:the\s+)?)/i;

  // Words that mark where the company name ends and the description begins.
  var CUE = /\s(?:recruitment|placement|campus|hiring|internship|interns?|drive|pre[- ]?placement|ppt|webinar|session|seminar|workshop|assessment|aptitude|test|exam|hackathon|interviews?|competition|contest|quiz|challenge)\b|\s*:\s+|\sfor\s+(?:the\s+)?(?:[A-Z]{2,8}\s+)?(?:B\.?\s?E\b|B\.?\s?Tech|M\.?\s?Tech|MBA|MCA|all\b|20\d{2}|students)/i;

  // Trailing words that describe the event, not the company.
  var TAIL_NOISE = {
    virtual: 1, online: 1, offline: 1, physical: 1, 'in-person': 1, inperson: 1, hybrid: 1,
    communication: 1, technical: 1, coding: 1, programming: 1, cognitive: 1, written: 1,
    'mcq-based': 1, mcq: 1, based: 1, mega: 1, pool: 1, 'off-campus': 1, 'on-campus': 1,
    'walk-in': 1, first: 1, second: 1, final: 1, upcoming: 1
  };
  var HEAD_NOISE = {
    "today's": 1, "tomorrow's": 1, today: 1, tomorrow: 1, the: 1, a: 1, an: 1, upcoming: 1,
    regarding: 1, important: 1, urgent: 1, dear: 1, all: 1, batch: 1, students: 1
  };
  var CONNECTOR = { of: 1, and: 1, '&': 1, de: 1 };

  var DEGREE = /\b(B\.?\s?E\.?|B\.?\s?Tech\.?|M\.?\s?Tech\.?|M\.?\s?E\.?|MBA|MCA|BCA|BBA|B\.?\s?Sc\.?|M\.?\s?Sc\.?|PGDM|Diploma)(?![A-Za-z])/g;
  var ALL_BRANCHES = /\b(?:all|any)\s+(?:the\s+)?(?:branch(?:es)?|streams?|specialisations?|specializations?|departments?|disciplines?)\b/i;

  function splitSegments(subject) {
    return subject.split(/\s*\|\|+\s*|\s+II\s+|\s+\|\s+/).map(PdText.normalise).filter(function (s) { return s !== ''; });
  }

  function stripFlags(text) {
    var flags = { reminder: false, urgent: false, update: false };
    var s = text.replace(REPLY_PREFIX, '');
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < FLAGS.length; i++) {
        var m = FLAGS[i].re.exec(s);
        if (m && m[0].length > 0 && m[0].length < s.length) {
          flags[FLAGS[i].flag] = true;
          s = s.slice(m[0].length);
          changed = true;
        }
      }
    }
    return { text: s, flags: flags };
  }

  function detectKind(head) {
    var s = head.toLowerCase();
    if (/\bcongratulations\b|\bfor (?:his|her|their) selection\b|\bfinal(?:ly)? selected\b|\bselected (?:students|candidates)\b|\bgot placed\b/.test(s)) return 'result';
    if (/\bshort[- ]?list(?:ed)?\b/.test(s)) return 'shortlist';
    if (/\binterviews?\b|\b(?:hr|technical|managerial)\s+round\b/.test(s)) return 'interview';
    if (/\bassessments?\b|\baptitude\b|\btests?\b|\bexam\b|\bmcq\b|\bcoding round\b/.test(s)) return 'assessment';
    if (/\bhackathon\b|\bcompetition\b|\bcontest\b|\bquiz\b|\bchallenge\b/.test(s)) return 'hackathon';
    if (/\bpre[- ]?placement talk\b|\bppt\b|\bwebinar\b|\bsession\b|\bseminar\b|\bworkshop\b|\borientation\b/.test(s)) return 'talk';
    if (/\bintern(?:ship)?s?\b/.test(s)) return 'internship';
    if (/\bdrive\b|\bhiring\b|\brecruitment\b|\bplacement\b/.test(s)) return 'drive';
    return 'info';
  }

  /** Is `word` one of the set's own keys? (Words come from emails; "constructor" must not count.) */
  function inSet(set, word) {
    return Object.prototype.hasOwnProperty.call(set, word);
  }

  function isCapital(token) {
    return /^[A-Z0-9(&]/.test(token);
  }

  /** Keep the run of capitalised words at the end: "… coordination of Acme Labs" -> "Acme Labs". */
  function trailingName(tokens) {
    var out = [];
    for (var i = tokens.length - 1; i >= 0; i--) {
      var t = tokens[i];
      if (isCapital(t)) { out.unshift(t); continue; }
      if (inSet(CONNECTOR, t.toLowerCase()) && out.length && i > 0 && isCapital(tokens[i - 1])) { out.unshift(t); continue; }
      break;
    }
    return out;
  }

  function cleanCompany(candidate) {
    var s = PdText.normalise(candidate).replace(LEAD_IN, '').replace(/[\s,:;\-\u2013|]+$/, '');
    var tokens = s.split(' ').filter(function (t) { return t !== ''; });
    // Drop "Online/Virtual 2nd", "Physical/In-person Communication" and the like from the end.
    while (tokens.length) {
      var last = tokens[tokens.length - 1];
      var parts = last.toLowerCase().split('/').filter(function (p) { return p !== ''; });
      var noise = parts.length > 0 && parts.every(function (p) { return inSet(TAIL_NOISE, p) || /^\d+(?:st|nd|rd|th)$/.test(p); });
      if (!noise) break;
      tokens.pop();
    }
    tokens = trailingName(tokens);
    while (tokens.length && (inSet(HEAD_NOISE, tokens[0].toLowerCase()) || /^20\d{2}$/.test(tokens[0]))) tokens.shift();
    var name = tokens.join(' ').replace(/[\s,:;\-\u2013|]+$/, '');
    if (!name || tokens.length > 8 || name.length > 70) return '';
    if (!/[A-Za-z]/.test(name)) return '';
    if (name.indexOf('(') !== -1 && name.indexOf(')') === -1) name = name.replace(/\s*\([^)]*$/, '');
    return name;
  }

  function extractCompany(head, kind) {
    var m;
    if (kind === 'result') {
      m = /\bselect(?:ion|ed)\s+(?:in|at|by|with)\s+((?:[A-Z0-9][\w&.'-]*\s*){1,6})/.exec(head);
      if (m) return cleanCompany(m[1]);
    }
    m = CUE.exec(' ' + head);
    if (!m) return '';
    var cut = m.index - 1;
    if (cut <= 0) {
      m = /\b(?:of|by|at|with)\s+((?:[A-Z][\w&.'-]*\s*){1,5})/.exec(head);
      return m ? cleanCompany(m[1]) : '';
    }
    return cleanCompany(head.slice(0, cut));
  }

  /** A known company named anywhere in the text, longest name first. */
  function findKnownCompany(text, knownCompanies) {
    var folded = ' ' + PdText.fold(text) + ' ';
    var best = '';
    var bestKey = '';
    (knownCompanies || []).forEach(function (name) {
      var key = PdDedupe.companyKey(name);
      if (key && key.length > bestKey.length && folded.indexOf(' ' + key + ' ') !== -1) { best = name; bestKey = key; }
    });
    return best;
  }

  function parseDegrees(text) {
    var out = [];
    var m;
    DEGREE.lastIndex = 0;
    while ((m = DEGREE.exec(text))) {
      var d = m[1].toUpperCase().replace(/[^A-Z]/g, '');
      if (out.indexOf(d) === -1) out.push(d);
    }
    return out;
  }

  /**
   * Branch names from "(CS/IT, AI & DS, E&TC)" style lists.
   * Each comma-separated piece is kept whole and also split on "/", so a
   * student whose branch is "IT" matches "CS/IT" and one in "AI & DS" matches
   * the whole piece.
   */
  function parseBranchList(content) {
    var pieces = /[,;]/.test(content) ? content.split(/[,;]/) : [content];
    var out = [];
    function add(value) {
      var v = PdText.normalise(value);
      if (v && out.indexOf(v) === -1) out.push(v);
    }
    pieces.forEach(function (piece) {
      add(piece);
      piece.split('/').forEach(add);
    });
    return out;
  }

  /**
   * Who an email is for: degrees, branches and batch years.
   * Works on a subject line or on an "Eligible Branch: ..." value.
   */
  function parseEligibility(text) {
    var s = String(text || '');
    var result = { degrees: parseDegrees(s), branches: [], allBranches: ALL_BRANCHES.test(s), batches: [] };
    var m;

    var firstDegree = s.search(DEGREE);
    DEGREE.lastIndex = 0;
    if (firstDegree !== -1) {
      var paren = /\(([^()]{1,80})\)/g;
      while ((m = paren.exec(s))) {
        if (m.index < firstDegree) continue;
        var content = m[1];
        if (ALL_BRANCHES.test(content) || /^\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*$/i.test(content)) continue;
        if (/\d{2}/.test(content)) continue;
        parseBranchList(content).forEach(function (b) { if (result.branches.indexOf(b) === -1) result.branches.push(b); });
      }
    }

    function addYears(group) {
      (group.match(/20\d{2}/g) || []).forEach(function (y) {
        var n = parseInt(y, 10);
        if (result.batches.indexOf(n) === -1) result.batches.push(n);
      });
    }
    var before = /((?:20\d{2})(?:\s*(?:,|&|and|\/|-)\s*20\d{2})*)\s*(?:pass(?:ing)?[\s-]*out\s*)?batch(?:es)?\b/gi;
    while ((m = before.exec(s))) addYears(m[1]);
    var after = /\bbatch(?:es)?\s*(?:of\s*)?[:\-\u2013]?\s*((?:20\d{2})(?:\s*(?:,|&|and|\/)\s*20\d{2})*)/gi;
    while ((m = after.exec(s))) addYears(m[1]);
    var passing = /\b(20\d{2})\s*(?:pass(?:ing)?[\s-]*outs?|graduates|graduating)\b/gi;
    while ((m = passing.exec(s))) addYears(m[1]);
    result.batches.sort();
    return result;
  }

  function extractDetails(segments) {
    var details = {};
    var constraints = [];
    var map = [
      [/^(?:stipend|compensation)\b/i, 'stipend'],
      [/^(?:ctc|package|salary)\b/i, 'ctc'],
      [/^(?:role|position|profile|designation|job role)\b/i, 'role'],
      [/^(?:job\s+)?location\b/i, 'location'],
      [/^(?:internship\s+)?duration\b/i, 'duration'],
      [/^joining\b/i, 'joining']
    ];
    segments.forEach(function (segment) {
      var kv = /^([A-Za-z][A-Za-z ]{1,28}?)\s*[:\-\u2013]\s*(.+)$/.exec(segment);
      if (kv) {
        for (var i = 0; i < map.length; i++) {
          if (map[i][0].test(kv[1]) && !details[map[i][1]]) { details[map[i][1]] = PdText.truncate(kv[2], 80); return; }
        }
      }
      if (/^only\b|\bshould apply\b|\bcan apply\b|\bnot eligible\b|\bunplaced\b/i.test(segment)) constraints.push(PdText.truncate(segment, 140));
    });
    return { details: details, constraints: constraints };
  }

  var DEADLINE_CUE = /\b(?:last\s+date|deadline|registration\s+closes?|register\s+(?:on\s+or\s+)?(?:before|by)|apply\s+(?:on\s+or\s+)?(?:before|by)|on\s+or\s+before)\b/i;

  /** The date after a "last date to register" style phrase, if there is one. */
  function findDeadline(text, dateCtx) {
    var m = DEADLINE_CUE.exec(text);
    if (!m) return null;
    return PdDates.firstDate(text.slice(m.index + m[0].length, m.index + m[0].length + 90), dateCtx);
  }

  function detectMode(text) {
    var s = text.toLowerCase();
    if (/\bvirtual\b|\bonline\b|\bms teams\b|\bmicrosoft teams\b|\bzoom\b|\bgoogle meet\b/.test(s)) return 'Online';
    if (/\bphysical\b|\bin[- ]person\b|\boffline\b|\bface[- ]to[- ]face\b/.test(s)) return 'In person';
    return '';
  }

  /**
   * @param {string} subject the raw subject line
   * @param {{base:Object, order:(string|undefined), knownCompanies:(Array<string>|undefined)}} ctx
   * @return {Object} structured subject
   */
  function parse(subject, ctx) {
    var clean = PdText.normalise(subject);
    var stripped = stripFlags(clean);
    var segments = splitSegments(stripped.text);
    var head = segments.length ? segments[0] : '';
    var extras = segments.slice(1);
    var dateCtx = { base: ctx.base, order: ctx.order };

    var kind = detectKind(head);
    var company = extractCompany(head, kind);
    if (!company) company = findKnownCompany(head, ctx.knownCompanies);
    var track = /\bintern(?:ship)?s?\b/i.test(head) ? 'internship' : 'placement';

    var eligibility = parseEligibility(head);
    var extra = extractDetails(extras);

    // Dates: a "last date" phrase owns the date that follows it; the first
    // other date in the headline is when the thing happens.
    var deadline = null;
    for (var i = 0; i < segments.length && !deadline; i++) deadline = findDeadline(segments[i], dateCtx);
    var headForEvent = head;
    var cue = DEADLINE_CUE.exec(head);
    if (cue) headForEvent = head.slice(0, cue.index);
    var eventDate = PdDates.firstDate(headForEvent, dateCtx);

    var venue = '';
    if (eventDate) {
      var rest = headForEvent.slice(eventDate.index + eventDate.length);
      var at = /^\s*,?\s*(?:at|@|in)\s+([A-Z][^|]{2,70})/.exec(rest);
      if (at) venue = PdText.normalise(at[1]).replace(/[\s,.;]+$/, '');
    }

    var listMatch = /\blist of\s+(?:the\s+)?(\d{1,4})?/i.exec(head);
    var round = '';
    var roundMatch = /\b(?:short[- ]?listed|students|candidates)\b[^|]{0,60}?\bfor\s+(?:the\s+)?(.+?)(?=\s+(?:scheduled|which|on|at)\b|,|$)/i.exec(head);
    if ((kind === 'shortlist' || kind === 'interview') && roundMatch) {
      round = PdText.truncate(PdText.normalise(roundMatch[1]), 60);
    }

    var companyKey = PdDedupe.companyKey(company);
    var title = company ? company + ' \u2013 ' + KIND_LABEL[kind] : PdText.truncate(head, 110);

    return {
      subject: clean,
      flags: stripped.flags,
      kind: kind,
      track: track,
      company: company,
      companyKey: companyKey,
      title: title,
      hasList: !!listMatch || kind === 'shortlist',
      listCount: listMatch && listMatch[1] ? parseInt(listMatch[1], 10) : 0,
      round: round,
      eventDate: eventDate,
      deadline: deadline,
      venue: venue,
      mode: detectMode(head),
      details: extra.details,
      constraints: extra.constraints,
      degrees: eligibility.degrees,
      branches: eligibility.branches,
      allBranches: eligibility.allBranches,
      batches: eligibility.batches
    };
  }

  return {
    KIND_LABEL: KIND_LABEL,
    parse: parse,
    parseEligibility: parseEligibility,
    findDeadline: findDeadline,
    findKnownCompany: findKnownCompany,
    cleanCompany: cleanCompany,
    detectKind: detectKind
  };
})();

// ===== src/core/Text.js =====
/**
 * @fileoverview Text helpers: normalising, escaping and making untrusted
 * email text safe to show in a Sheet or an HTML page.
 *
 * Everything that comes out of an email is untrusted input. Nothing in this
 * project writes email text anywhere without passing through one of these.
 */
var PdText = (function () {
  'use strict';

  var MAX_CELL = 1500;
  var MAX_URL = 2000;

  /** Trim, collapse whitespace and fold look-alike Unicode forms together. */
  function normalise(value) {
    if (value === null || value === undefined) return '';
    var s = String(value);
    if (s.normalize) s = s.normalize('NFKC');
    return s
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Comparison form: lower case, no accents, punctuation turned into spaces.
   * "  RAO,  Asha K. " and "rao asha k" fold to the same string.
   */
  function fold(value) {
    var s = normalise(value).toLowerCase();
    if (s.normalize) s = s.normalize('NFKD').replace(/[\u0300-\u036F]/g, '');
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** Fold and split into whole words. */
  function words(value) {
    var folded = fold(value);
    return folded ? folded.split(' ') : [];
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(value, max) {
    var s = String(value === null || value === undefined ? '' : value);
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + '\u2026';
  }

  /**
   * Make a value safe to write into a spreadsheet cell.
   *
   * A cell whose text starts with = + - or @ is run as a formula, so an email
   * subject like `=IMPORTXML(...)` could pull data out of the Sheet. A leading
   * apostrophe makes Sheets store the text as text.
   */
  function safeCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Object.prototype.toString.call(value) === '[object Date]') return value;
    var s = String(value)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\r\n?/g, '\n');
    s = truncate(s, MAX_CELL);
    // Checked on a real Sheet: formatting a cell as plain text does NOT stop
    // "=1+1" becoming a formula; only the leading apostrophe does. A value
    // that itself starts with an apostrophe gets one too, or Sheets would
    // swallow it.
    if (/^[=+\-@\t\n']/.test(s)) s = "'" + s;
    return s;
  }

  /** Only http(s) links without spaces or control characters are kept. */
  function safeUrl(value) {
    var s = String(value === null || value === undefined ? '' : value).trim();
    if (!s || s.length > MAX_URL) return '';
    // eslint-disable-next-line no-control-regex
    if (/[\s\u0000-\u001F"<>\\^`{|}]/.test(s)) return '';
    if (!/^https?:\/\/[^/?#]+/i.test(s)) return '';
    return s;
  }

  /** Host name of a URL in lower case, or '' when it is not a safe URL. */
  function hostOf(url) {
    var safe = safeUrl(url);
    if (!safe) return '';
    var m = /^https?:\/\/([^/?#]+)/i.exec(safe);
    if (!m) return '';
    var host = m[1].toLowerCase();
    if (host.indexOf('@') !== -1) return '';
    return host.replace(/:\d+$/, '');
  }

  /** Split "a, b ; c" style config values into trimmed non-empty parts. */
  function splitList(value) {
    return String(value === null || value === undefined ? '' : value)
      .split(/[,;\n]/)
      .map(normalise)
      .filter(function (part) { return part !== ''; });
  }

  return {
    MAX_CELL: MAX_CELL,
    normalise: normalise,
    fold: fold,
    words: words,
    escapeHtml: escapeHtml,
    truncate: truncate,
    safeCell: safeCell,
    safeUrl: safeUrl,
    hostOf: hostOf,
    splitList: splitList
  };
})();

// ===== src/gas/App.js =====
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

// ===== src/gas/Forms.js =====
/**
 * @fileoverview Fetching a public Google Form to build a pre-filled link.
 *
 * The only addresses ever requested are docs.google.com form pages (and
 * forms.gle short links, followed one step and only to docs.google.com).
 * The request is anonymous: no sign-in, no cookies, no token. A form that
 * needs sign-in simply cannot be read, and the student gets a copy-ready
 * list of answers instead.
 *
 * Nothing is ever submitted. The result is a link the student opens.
 */
var PdForms = (function () {
  'use strict';

  function get(url) {
    return UrlFetchApp.fetch(url, { method: 'get', followRedirects: false, muteHttpExceptions: true });
  }

  /** The docs.google.com address behind a forms.gle short link, or ''. */
  function resolve(url) {
    var direct = PdPrefill.normaliseFormUrl(url);
    if (direct) return direct;
    if (PdText.hostOf(url) !== 'forms.gle') return '';
    var response = get(PdText.safeUrl(url));
    var headers = response.getHeaders() || {};
    return PdPrefill.normaliseFormUrl(headers.Location || headers.location || '');
  }

  /**
   * @param {string} formUrl a link found in an email
   * @param {Array<Object>} fields the student's profile fields
   * @return {{state:string, url:string, title:string, filled:number, manual:Array<Object>}}
   *     state: 'ok', 'signin' (cannot be read without signing in),
   *     'notform' (not a Google Form) or 'error'
   */
  function prefill(formUrl, fields, settings) {
    var empty = { state: 'error', url: '', title: '', filled: 0, manual: [] };
    try {
      var canonical = resolve(formUrl);
      if (!canonical) { empty.state = 'notform'; return empty; }
      var response = get(canonical);
      if (response.getResponseCode() !== 200) { empty.state = 'signin'; return empty; }
      var form = PdPrefill.parseForm(PdPrefill.extractLoadData(response.getContentText()));
      if (!form) { empty.state = 'signin'; return empty; }
      var mapped = PdPrefill.mapQuestions(form.questions, fields, { order: settings.order });
      return {
        state: 'ok',
        url: PdPrefill.buildUrl(canonical, mapped.answers),
        title: form.title,
        filled: mapped.answers.length,
        manual: mapped.manual
      };
    } catch (e) {
      return empty;
    }
  }

  return { prefill: prefill, resolve: resolve };
})();

// ===== src/gas/Lists.js =====
/**
 * @fileoverview Checking a shortlist email for the student's own name.
 *
 * Attachments are opened only to look for the student's name, roll number
 * or email address. Their contents are not written anywhere.
 */
var PdLists = (function () {
  'use strict';

  var MAX_ATTACHMENTS = 6;
  var SCREENSHOT_BYTES = 60 * 1024;

  function entryText(blobs, pattern) {
    var out = [];
    blobs.forEach(function (blob) {
      if (pattern.test(blob.getName())) out.push({ name: blob.getName(), text: blob.getDataAsString('UTF-8') });
    });
    out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return out.map(function (e) { return e.text; });
  }

  /** Rows of text from one attachment, or null when it cannot be read safely. */
  function rowsFrom(messageId, attachment) {
    var kind = PdFiles.kindOf(attachment.filename, attachment.mimeType);
    if (kind !== 'xlsx' && kind !== 'docx' && kind !== 'csv' && kind !== 'txt') return null;
    if (!attachment.attachmentId || attachment.size > PdFiles.LIMITS.maxBytes) return null;

    var bytes = PdMail.attachmentBytes(messageId, attachment.attachmentId);
    if (bytes.length > PdFiles.LIMITS.maxBytes) return null;
    if (kind === 'csv' || kind === 'txt') {
      return PdFiles.csvRows(Utilities.newBlob(bytes).getDataAsString('UTF-8')).rows;
    }

    // Read the zip's own table of contents first; refuse anything oversized.
    if (!PdFiles.zipInspect(bytes).ok) return null;
    var blobs = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip'));
    if (kind === 'docx') {
      var doc = entryText(blobs, /^word\/document\.xml$/);
      return doc.length ? PdFiles.docxRows(doc[0]).rows : null;
    }
    var shared = entryText(blobs, /^xl\/sharedStrings\.xml$/);
    var sheets = entryText(blobs, /^xl\/worksheets\/sheet\d+\.xml$/);
    if (!sheets.length) return null;
    return PdFiles.xlsxRows(shared.length ? shared[0] : '', sheets).rows;
  }

  /** Would a person have to open this attachment to see the list? */
  function needsEyes(attachment) {
    var kind = PdFiles.kindOf(attachment.filename, attachment.mimeType);
    // A spreadsheet or document that reached here was refused or unreadable.
    if (kind === 'pdf' || kind === 'legacy' || kind === 'macro' || kind === 'xlsx' || kind === 'docx' || kind === 'csv') return true;
    // Small images are signature logos; a large one may be a photo of the list.
    return kind === 'image' && attachment.size > SCREENSHOT_BYTES;
  }

  /**
   * @param {string} messageId
   * @param {{text:string, tables:Array, attachments:Array<Object>}} content
   * @return {{status:string, via:string, lookedIn:string}}
   */
  function check(messageId, content, identity) {
    var tables = content.tables && content.tables.length ? [content.tables] : [];
    var unreadable = 0;
    var read = 0;
    (content.attachments || []).slice(0, MAX_ATTACHMENTS).forEach(function (attachment) {
      var rows;
      try {
        rows = rowsFrom(messageId, attachment);
      } catch (e) {
        rows = null;
      }
      if (rows) { tables.push(rows); read++; } else if (needsEyes(attachment)) unreadable++;
    });
    var result = PdPipeline.checkList(content.text, tables, unreadable, identity);
    var lookedIn = 'Email text';
    if (read) lookedIn += ' + ' + read + ' attached file' + (read > 1 ? 's' : '');
    if (unreadable) lookedIn += ' (' + unreadable + ' could not be read)';
    return { status: result.status, via: result.via, lookedIn: lookedIn };
  }

  return { check: check };
})();

// ===== src/gas/Mail.js =====
/**
 * @fileoverview Gmail access. Read-only.
 *
 * This is the only file that talks to Gmail, and it uses the Gmail API with
 * the gmail.readonly permission. There is no code here, or anywhere in the
 * project, that sends, deletes, labels, archives or marks a message as read:
 * the permission the script asks for does not allow it.
 *
 * Messages are fetched in two steps. First only the headers (subject, from,
 * to, date), so that private mail can be recognised and skipped. The body is
 * fetched only for messages that pass that check.
 */
var PdMail = (function () {
  'use strict';

  var PAGE = 100;

  /** Ids of messages matching a search, newest first, up to `max`. */
  function search(query, max) {
    var ids = [];
    var token;
    do {
      var page = Gmail.Users.Messages.list('me', { q: query, maxResults: Math.min(PAGE, max - ids.length), pageToken: token });
      (page.messages || []).forEach(function (m) { ids.push(String(m.id)); });
      token = page.nextPageToken;
    } while (token && ids.length < max);
    return ids;
  }

  function metaFrom(message) {
    var payload = message.payload || {};
    return {
      id: String(message.id),
      threadId: String(message.threadId || message.id),
      subject: PdMime.header(payload, 'Subject'),
      from: PdMime.header(payload, 'From'),
      to: PdMime.addresses(PdMime.header(payload, 'To')),
      cc: PdMime.addresses(PdMime.header(payload, 'Cc')),
      dateMs: Number(message.internalDate) || 0
    };
  }

  /** Headers only. The body is not requested. */
  function meta(id) {
    return metaFrom(Gmail.Users.Messages.get('me', id, {
      format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Cc']
    }));
  }

  /** The API gives part data as web-safe base64 text or as bytes, depending on the runtime. */
  function toBytes(data) {
    if (data === null || data === undefined) return [];
    if (typeof data === 'string') return Utilities.base64DecodeWebSafe(data);
    return data;
  }

  function toText(data) {
    return Utilities.newBlob(toBytes(data)).getDataAsString('UTF-8');
  }

  /**
   * The readable text and the attachment list of one message.
   * @return {{text:string, tables:Array<Array<string>>, attachments:Array<Object>}}
   */
  function content(id) {
    var message = Gmail.Users.Messages.get('me', id, { format: 'full' });
    var parts = PdMime.collect(message.payload || {});
    var html = parts.html.map(toText).join('\n');
    var htmlText = html ? PdMime.htmlToText(html) : '';
    var text = parts.plain.length ? parts.plain.map(toText).join('\n') : htmlText;
    return { text: text, tables: htmlText ? PdMime.tableRows(htmlText) : [], attachments: parts.attachments };
  }

  function attachmentBytes(messageId, attachmentId) {
    return toBytes(Gmail.Users.Messages.Attachments.get('me', messageId, attachmentId).data);
  }

  function myAddress() {
    return String(Gmail.Users.getProfile('me').emailAddress || '');
  }

  return { search: search, meta: meta, content: content, attachmentBytes: attachmentBytes, myAddress: myAddress };
})();

// ===== src/gas/Runner.js =====
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
      // Gmail ids grow with time, so sorting them handles the oldest email
      // first: a drive notice is seen before its own shortlist.
      var fresh = PdDedupe.unseen(ids, seen).sort(function (a, b) {
        return a.length !== b.length ? a.length - b.length : (a < b ? -1 : (a > b ? 1 : 0));
      });
      stats.found = PdDedupe.unseen(ids, {}).length;
      stats.fresh = fresh.length;

      // ---- 2 and 3. read and understand ------------------------------------
      // Example rows from "See an example first" make way for the real thing.
      PdStore.deleteDriveRows(PdStore.readDrives().filter(function (e) { return PdDemo.isDemoKey(e.key); }).map(function (e) { return e.row; }));
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

// ===== src/gas/Store.js =====
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
    practiceLog: 'Practice log', profile: 'Profile', settings: 'Settings', log: 'Log', seen: '_seen'
  };

  var DRIVE_HEAD = [
    'My mark', 'To do', 'Company', 'Type', 'For me', 'Who it is for', 'Register by', 'Happening on',
    'Where', 'Pay', 'Role', 'On the list?', 'Latest email', 'Form', 'Email', 'Updated', 'My notes', '_key', '_data'
  ];
  // 1-based column numbers on the Drives tab.
  var COL = { mark: 1, text: 2, textCount: 12, form: 14, email: 15, updated: 16, notes: 17, key: 18, data: 19 };
  var LIST_HEAD = ['Checked', 'Company', 'Round', 'Looked in', 'Result', 'Matched by'];
  var PRACTICE_LOG_HEAD = ['Date', 'Skill', 'My notes'];
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
      [TAB.practice, PRACTICE_HEAD.length, '#9ca3af'], [TAB.practiceLog, PRACTICE_LOG_HEAD.length, '#9ca3af'], [TAB.profile, 4, '#f59e0b'],
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

    make(TAB.practiceLog, PRACTICE_LOG_HEAD, 4, function (sh) { sh.setColumnWidth(1, 120).setColumnWidth(2, 260).setColumnWidth(3, 320); });

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

  /**
   * Record that the skill on `row` of the Practice tab was practised on `dateText`.
   * Done only when the student asks for it from the menu.
   * @return {string} the skill name, or '' when the row has no skill
   */
  function logPractice(row, dateText) {
    var sh = sheet(TAB.practice);
    if (!sh || row < 2) return '';
    var skill = PdText.normalise(sh.getRange(row, 1).getValue());
    if (!skill) return '';
    plainText(sh.getRange(row, 3)).setValue(PdText.safeCell(dateText));
    appendRows(TAB.practiceLog, PRACTICE_LOG_HEAD, [[dateText, skill, '']]);
    return skill;
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
    logPractice: logPractice,
    writePractice: writePractice,
    writeDashboard: writeDashboard
  };
})();
