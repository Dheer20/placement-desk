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
