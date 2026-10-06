'use strict';

/**
 * Builds dist/ for people who install by copy and paste instead of using the
 * template Sheet:
 *
 *   dist/Code.gs          every source file joined into one, in a fixed order
 *   dist/appsscript.json  the manifest (permissions) unchanged
 *
 * The bundle is the source files, byte for byte, with a banner between them.
 * Nothing is minified or rewritten, so it can be read and reviewed.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

function scripts(dir) {
  return fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort().map((name) => path.join(dir, name));
}

function build() {
  const version = require(path.join(ROOT, 'package.json')).version;
  const files = scripts(path.join(SRC, 'core')).concat(scripts(path.join(SRC, 'gas')));
  let out = '/**\n * Placement Desk ' + version + ' - single-file build.\n' +
    ' * Source, licence (MIT) and documentation: see the project repository.\n' +
    ' * Not affiliated with Google, any college or any company.\n */\n';
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    out += '\n// ===== ' + rel + ' =====\n' + fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  }
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'Code.gs'), out);
  fs.copyFileSync(path.join(SRC, 'appsscript.json'), path.join(DIST, 'appsscript.json'));
  return { files: files.length, bytes: Buffer.byteLength(out) };
}

if (require.main === module) {
  const result = build();
  console.log('Built dist/Code.gs from ' + result.files + ' files (' + Math.round(result.bytes / 1024) + ' KB).');
}

module.exports = { build };
