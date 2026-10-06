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
