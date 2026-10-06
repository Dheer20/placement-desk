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

  function isCapital(token) {
    return /^[A-Z0-9(&]/.test(token);
  }

  /** Keep the run of capitalised words at the end: "… coordination of Acme Labs" -> "Acme Labs". */
  function trailingName(tokens) {
    var out = [];
    for (var i = tokens.length - 1; i >= 0; i--) {
      var t = tokens[i];
      if (isCapital(t)) { out.unshift(t); continue; }
      if (CONNECTOR[t.toLowerCase()] && out.length && i > 0 && isCapital(tokens[i - 1])) { out.unshift(t); continue; }
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
      var noise = parts.length > 0 && parts.every(function (p) { return TAIL_NOISE[p] || /^\d+(?:st|nd|rd|th)$/.test(p); });
      if (!noise) break;
      tokens.pop();
    }
    tokens = trailingName(tokens);
    while (tokens.length && (HEAD_NOISE[tokens[0].toLowerCase()] || /^20\d{2}$/.test(tokens[0]))) tokens.shift();
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
