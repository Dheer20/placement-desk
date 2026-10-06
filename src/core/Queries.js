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
