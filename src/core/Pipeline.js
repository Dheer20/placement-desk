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
