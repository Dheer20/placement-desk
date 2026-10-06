'use strict';

/**
 * Stand-ins for the Google services the script uses, so the whole run can be
 * tested on a laptop: a fake Sheet, a fake Gmail mailbox, fake timers, fake
 * web fetches and a fake outbox.
 *
 * The fakes also keep records that tests assert on: which message bodies
 * were fetched, which cells were written, what was emailed, which web
 * addresses were requested.
 */
const { readZip } = require('../helpers/zip.js');

/** Any method the code calls that a fake does not define becomes a chainable no-op. */
function lenient(target) {
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined;
      return () => proxy;
    }
  });
  return proxy;
}

class FakeRich {
  constructor(text, url) { this.text = text || ''; this.url = url || null; }
  getText() { return this.text; }
  getLinkUrl() { return this.url; }
}

class FakeSheet {
  constructor(name, book) {
    this.name = name;
    this.book = book;
    this.cells = [];
    this.rich = new Map();
    this.hidden = false;
    this.maxRows = 1000;
    /** Every [row, column] written, for "the student's columns were never written" checks. */
    this.writes = [];
    this.formulas = [];
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return 26; }
  getLastRow() {
    for (let r = this.cells.length - 1; r >= 0; r--) {
      if ((this.cells[r] || []).some((v) => v !== '' && v !== undefined && v !== null)) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    return this.cells.reduce((max, row) => Math.max(max, (row || []).length), 0);
  }
  insertRowsAfter(after, count) { this.maxRows += count; return lenient(this); }
  deleteRows(start, count) { this.cells.splice(start - 1, count); return lenient(this); }
  hideSheet() { this.hidden = true; return lenient(this); }
  isSheetHidden() { return this.hidden; }
  clear() { this.cells = []; this.rich = new Map(); return lenient(this); }
  getRange(row, col, numRows, numCols) { return lenient(new FakeRange(this, row, col, numRows || 1, numCols || 1)); }
  read(row, col) {
    const v = (this.cells[row - 1] || [])[col - 1];
    return v === undefined || v === null ? '' : v;
  }
  write(row, col, value) {
    if (row > this.maxRows) throw new Error('write outside the sheet');
    while (this.cells.length < row) this.cells.push([]);
    const line = this.cells[row - 1];
    while (line.length < col) line.push('');
    let stored = value;
    if (typeof value === 'string') {
      // Google Sheets runs text that starts with = as a formula, and treats a
      // leading apostrophe as "this is text" (the apostrophe is not shown).
      if (/^[=+]/.test(value)) this.formulas.push({ row, col, value });
      if (value.charAt(0) === "'") stored = value.slice(1);
    }
    line[col - 1] = stored;
    this.writes.push([row, col]);
  }
  /** All rows as plain arrays, for assertions. */
  table() { return this.cells.map((row) => row.slice()); }
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) { Object.assign(this, { sheet, row, col, numRows, numCols }); }
  getRow() { return this.row; }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.read(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  getValue() { return this.sheet.read(this.row, this.col); }
  setValues(values) {
    if (values.length !== this.numRows || values.some((line) => line.length !== this.numCols)) {
      throw new Error('setValues: the data does not match the range size');
    }
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.write(this.row + r, this.col + c, v)));
    return lenient(this);
  }
  setValue(value) { this.sheet.write(this.row, this.col, value); return lenient(this); }
  clearContent() {
    for (let r = 0; r < this.numRows; r++) for (let c = 0; c < this.numCols; c++) this.sheet.write(this.row + r, this.col + c, '');
    return lenient(this);
  }
  getRichTextValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        line.push(this.sheet.rich.get((this.row + r) + ',' + (this.col + c)) || new FakeRich(String(this.sheet.read(this.row + r, this.col + c)), null));
      }
      out.push(line);
    }
    return out;
  }
  setRichTextValues(values) {
    values.forEach((line, r) => line.forEach((rich, c) => {
      this.sheet.rich.set((this.row + r) + ',' + (this.col + c), rich);
      this.sheet.write(this.row + r, this.col + c, rich.getText());
    }));
    return lenient(this);
  }
  setRichTextValue(rich) { return this.setRichTextValues([[rich]]); }
}

/**
 * A fake Gmail mailbox. Searches are a simplified version of Gmail's:
 * the sender/list group, the keyword group, newer_than and the -subject
 * exclusions are honoured. `leaky: true` returns every message whatever the
 * query says, to prove the second line of defence on its own.
 */
function fakeGmail(mailbox, state) {
  function matches(message, query) {
    if (message.dateMs > state.nowMs) return false;
    if (state.leaky) return true;
    const subject = message.subject.toLowerCase();
    const days = /newer_than:(\d+)d/.exec(query);
    if (days && state.nowMs - message.dateMs > Number(days[1]) * 86400000) return false;
    const excluded = /-subject:\(([^)]*)\)/.exec(query);
    if (excluded) {
      const terms = excluded[1].split(' OR ').map((t) => t.replace(/"/g, '').toLowerCase());
      if (terms.some((t) => subject.includes(t))) return false;
    }
    const group = /^\{([^}]*)\}/.exec(query);
    if (group) {
      return group[1].split(' ').some((term) => {
        const [field, address] = term.split(':');
        if (field === 'from') return message.from.toLowerCase().includes(address);
        return (message[field] || []).includes(address);
      });
    }
    const words = /^\(([^)]*)\)/.exec(query);
    if (words) {
      const hay = subject + ' ' + message.body.toLowerCase();
      return words[1].split(' OR ').map((t) => t.replace(/"/g, '').toLowerCase()).some((t) => hay.includes(t));
    }
    return false;
  }
  const byId = (id) => {
    const found = mailbox.find((m) => m.id === id);
    if (!found) throw new Error('Requested entity was not found.');
    return found;
  };
  const encode = (text) => (state.bytesMode
    ? Array.from(Buffer.from(text, 'utf8')).map((b) => (b > 127 ? b - 256 : b))
    : Buffer.from(text, 'utf8').toString('base64url'));

  return {
    Users: {
      getProfile: () => ({ emailAddress: state.myAddress }),
      Messages: {
        list(userId, options) {
          state.queries.push(options.q);
          const messages = mailbox.filter((m) => matches(m, options.q))
            .sort((a, b) => b.dateMs - a.dateMs)
            .map((m) => ({ id: m.id, threadId: m.threadId }));
          return { messages };
        },
        get(userId, id, options) {
          const m = byId(id);
          if (state.failIds.has(id)) throw new Error('Service unavailable');
          const headers = [
            { name: 'Subject', value: m.subject }, { name: 'From', value: m.from },
            { name: 'To', value: m.to.join(', ') }, { name: 'Cc', value: m.cc.join(', ') }
          ];
          if (options.format === 'metadata') {
            state.metadataFetched.push(id);
            return { id: m.id, threadId: m.threadId, internalDate: String(m.dateMs), payload: { headers } };
          }
          state.bodiesFetched.push(id);
          const parts = [{ mimeType: 'text/plain', body: { data: encode(m.body), size: m.body.length } }];
          if (m.html) parts.push({ mimeType: 'text/html', body: { data: encode(m.html), size: m.html.length } });
          m.attachments.forEach((a) => parts.push({ mimeType: a.mimeType, filename: a.filename, body: { attachmentId: a.attachmentId, size: a.size } }));
          return { id: m.id, threadId: m.threadId, internalDate: String(m.dateMs), payload: { mimeType: 'multipart/mixed', headers, parts } };
        },
        Attachments: {
          get(userId, messageId, attachmentId) {
            state.attachmentsFetched.push(attachmentId);
            const bytes = state.attachmentData[attachmentId];
            if (!bytes) throw new Error('Attachment not found');
            return { size: bytes.length, data: bytes.map((b) => (b > 127 ? b - 256 : b)) };
          }
        }
      }
    }
  };
}

/**
 * Install the fakes on globalThis and return handles for assertions.
 * @param {{mailbox:Array, nowMs:number, attachmentData:Object, web:Object}} setup
 */
function install(setup) {
  const state = {
    nowMs: setup.nowMs,
    myAddress: setup.myAddress || 'asha.rao@example.com',
    leaky: false,
    bytesMode: false,
    failIds: new Set(),
    queries: [],
    metadataFetched: [],
    bodiesFetched: [],
    attachmentsFetched: [],
    attachmentData: setup.attachmentData || {},
    web: setup.web || {},
    fetched: [],
    sent: [],
    toasts: [],
    triggers: [],
    properties: {},
    sidebars: []
  };

  const sheets = [];
  const book = lenient({
    getSheetByName: (name) => { const s = sheets.find((x) => x.name === name); return s ? lenient(s) : null; },
    insertSheet(name) { const s = new FakeSheet(name, book); sheets.push(s); return lenient(s); },
    getSheets: () => sheets.map(lenient),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/FAKE_SHEET_ID/edit',
    toast: (message) => { state.toasts.push(message); },
    getActiveSheet: () => lenient(state.activeSheet || sheets[0]),
    setActiveSheet: (s) => { state.activeSheet = sheets.find((x) => x.name === s.getName()); return s; }
  });
  state.sheet = (name) => sheets.find((x) => x.name === name);

  const blob = (bytes, type, name) => ({
    getBytes: () => bytes,
    getName: () => name || '',
    getContentType: () => type || '',
    getDataAsString: () => Buffer.from(bytes.map((b) => b & 0xff)).toString('utf8')
  });

  globalThis.SpreadsheetApp = lenient({
    getActiveSpreadsheet: () => book,
    getActive: () => book,
    newRichTextValue() {
      const draft = { text: '', url: null };
      const builder = { setText(t) { draft.text = t; return builder; }, setLinkUrl(u) { draft.url = u; return builder; }, build: () => new FakeRich(draft.text, draft.url) };
      return builder;
    },
    newDataValidation: () => lenient({ build: () => ({}) }),
    newConditionalFormatRule: () => lenient({ build: () => ({}) }),
    getUi: () => lenient({
      createMenu: () => lenient({}),
      showSidebar: (html) => { state.sidebars.push(html.content); }
    })
  });
  globalThis.Gmail = fakeGmail(setup.mailbox, state);
  globalThis.Utilities = {
    base64DecodeWebSafe: (text) => Array.from(Buffer.from(text, 'base64url')).map((b) => (b > 127 ? b - 256 : b)),
    newBlob: (data, type, name) => blob(typeof data === 'string' ? Array.from(Buffer.from(data, 'utf8')) : data, type, name),
    unzip: (zipBlob) => readZip(zipBlob.getBytes()).map((entry) => blob(Array.from(Buffer.from(entry.text, 'utf8')), 'text/xml', entry.name)),
    formatDate: () => '+0530'
  };
  globalThis.UrlFetchApp = {
    fetch(url, options) {
      state.fetched.push({ url, options });
      const page = state.web[url] || { code: 404, body: 'Not found', headers: {} };
      return { getResponseCode: () => page.code, getContentText: () => page.body, getHeaders: () => page.headers || {} };
    }
  };
  globalThis.MailApp = { sendEmail: (message) => { state.sent.push(message); } };
  globalThis.LockService = { getDocumentLock: () => ({ tryLock: () => !state.locked, releaseLock() {} }) };
  globalThis.PropertiesService = {
    getDocumentProperties: () => ({
      getProperty: (key) => (key in state.properties ? state.properties[key] : null),
      setProperty: (key, value) => { state.properties[key] = String(value); }
    })
  };
  globalThis.HtmlService = {
    createHtmlOutput: (content) => { const out = { content, setTitle: () => out, setWidth: () => out, setHeight: () => out }; return out; }
  };
  globalThis.ScriptApp = {
    AuthMode: { FULL: 'FULL' },
    requireScopes: (mode, scopes) => { state.requiredScopes = scopes; },
    getProjectTriggers: () => state.triggers.slice(),
    deleteTrigger: (trigger) => { state.triggers = state.triggers.filter((t) => t !== trigger); },
    newTrigger(handler) {
      const trigger = { handler, hour: null, timeZone: null, getHandlerFunction: () => handler };
      const builder = {
        timeBased: () => builder, everyDays: () => builder,
        atHour(h) { trigger.hour = h; return builder; },
        inTimezone(tz) { trigger.timeZone = tz; return builder; },
        create() { state.triggers.push(trigger); return trigger; }
      };
      return builder;
    }
  };
  return state;
}

module.exports = { install, FakeSheet };
