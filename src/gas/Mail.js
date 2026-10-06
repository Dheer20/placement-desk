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
