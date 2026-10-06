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
