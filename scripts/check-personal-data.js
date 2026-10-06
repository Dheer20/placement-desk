'use strict';

/**
 * Stops personal data and hidden characters from reaching the repository.
 *
 * Checks every tracked file (or, with --history, every version of every file
 * ever committed) for:
 *   - email addresses outside the reserved example domains;
 *   - long digit runs that look like phone numbers;
 *   - Google file, form and account ids copied from real mail;
 *   - words listed in a local, untracked deny list (your own name, roll
 *     number, college: see below);
 *   - invisible or direction-changing Unicode characters in code.
 *
 * Your own deny list: create `personal.local.txt` in the project root with
 * one word or phrase per line (your name, roll number, college, the
 * placement officer's name...). The file is gitignored. Each line is
 * searched for, ignoring case.
 *
 * Usage:  node scripts/check-personal-data.js [--history]
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|xlsx|docx)$/i;
const SKIP = /^(package-lock\.json|LICENSE)$/;

// Domains reserved for documentation (RFC 2606 / RFC 6761), GitHub's
// no-reply addresses, and addresses that are part of how the tool works.
const SAFE_EMAIL = /@(?:[a-z0-9-]+\.)*(?:example|example\.com|example\.org|example\.net|test|invalid|localhost)$|@users\.noreply\.github\.com$|^(?:git|actions)@github\.com$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\dA-Za-z_.\-/=])(?:\+?91[\s-]?)?[6-9]\d{9}(?![\dA-Za-z_])/g;
// Real Google ids are long random strings; the fixtures use obviously fake ones.
const GOOGLE_ID = /(?:docs\.google\.com\/(?:forms|document|spreadsheets)\/d\/(?:e\/)?|drive\.google\.com\/file\/d\/|ouid=)([A-Za-z0-9_-]{15,})/g;
const FAKE_ID = /Example|FAKE|^1AbCdEfGhIjKlMnOpQrStUvWxYz012345$|^10{10,}\d$|^abc/;
// Zero-width and bidirectional control characters ("Trojan Source").
const HIDDEN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/;

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/**
 * Lines of personal.local.txt. A line starting with "allow:" names something
 * that may appear even though it contains a denied word (for example your
 * public GitHub username).
 */
function denyList() {
  const file = path.join(ROOT, 'personal.local.txt');
  const list = [];
  list.allow = [];
  if (!fs.existsSync(file)) return list;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^allow:/i.test(line)) list.allow.push(line.slice(6).trim().toLowerCase());
    else list.push(line);
  }
  return list;
}

function scan(name, text, deny) {
  const problems = [];
  const allowed = (deny.allow || []).filter(Boolean);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const where = name + ':' + (i + 1);
    for (const email of line.match(EMAIL) || []) {
      if (!SAFE_EMAIL.test(email)) problems.push(where + '  email address: ' + email);
    }
    if (/\.(js|json|md|yml|yaml|gs|html)$/.test(name)) {
      // 9000000001-style numbers are the documented fake phone numbers.
      for (const phone of line.match(PHONE) || []) {
        if (!/^9000000\d{3}$/.test(phone)) problems.push(where + '  looks like a phone number: ' + phone);
      }
    }
    let m;
    GOOGLE_ID.lastIndex = 0;
    while ((m = GOOGLE_ID.exec(line))) {
      if (!FAKE_ID.test(m[1])) problems.push(where + '  real-looking Google id: ' + m[1].slice(0, 12) + '...');
    }
    if (HIDDEN.test(line) && /\.(js|json|gs|yml|yaml)$/.test(name)) problems.push(where + '  invisible or direction-changing character');
    let lower = line.toLowerCase();
    for (const ok of allowed) lower = lower.split(ok).join(' ');
    for (const word of deny) {
      if (lower.includes(word.toLowerCase())) problems.push(where + '  word from your personal deny list');
    }
  });
  return problems;
}

function trackedFiles() {
  return git(['ls-files', '-z']).split('\0').filter(Boolean);
}

function check(options) {
  const deny = denyList();
  let problems = [];
  let scanned = 0;
  if (options.history) {
    const seen = new Set();
    const objects = git(['rev-list', '--all', '--objects']).split('\n').filter(Boolean);
    for (const entry of objects) {
      const space = entry.indexOf(' ');
      if (space === -1) continue;
      const hash = entry.slice(0, space);
      const name = entry.slice(space + 1);
      if (!name || seen.has(hash) || BINARY.test(name) || SKIP.test(path.basename(name))) continue;
      seen.add(hash);
      if (git(['cat-file', '-t', hash]).trim() !== 'blob') continue;
      problems = problems.concat(scan(name + '@' + hash.slice(0, 7), git(['cat-file', '-p', hash]), deny));
      scanned++;
    }
    // Commit messages and author details are part of the public history too.
    const log = git(['log', '--all', '--format=%H%n%an <%ae>%n%cn <%ce>%n%B%n']);
    problems = problems.concat(scan('commit log', log, deny));
  } else {
    for (const name of trackedFiles()) {
      if (BINARY.test(name) || SKIP.test(path.basename(name))) continue;
      problems = problems.concat(scan(name, fs.readFileSync(path.join(ROOT, name), 'utf8'), deny));
      scanned++;
    }
  }
  return { problems, scanned, denyWords: deny.length };
}

if (require.main === module) {
  const history = process.argv.includes('--history');
  const result = check({ history });
  const scope = history ? 'file versions in history' : 'tracked files';
  if (result.problems.length) {
    console.error('Personal-data check FAILED (' + result.problems.length + ' findings):\n');
    console.error(Array.from(new Set(result.problems)).join('\n'));
    process.exit(1);
  }
  console.log('Personal-data check passed: ' + result.scanned + ' ' + scope + ', ' +
    (result.denyWords ? result.denyWords + ' deny-list words' : 'no personal deny list (see the top of this script)') + '.');
}

module.exports = { scan, check };
