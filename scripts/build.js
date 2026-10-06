'use strict';

/**
 * Builds install/, the two files a student copies into their own Sheet:
 *
 *   install/Code.gs          every source file joined into one, in a fixed order
 *   install/appsscript.json  the manifest (permissions) unchanged
 *
 * The folder is committed, so the files can be copied straight from GitHub.
 * CI rebuilds it and fails if it does not match the source.
 *
 * The bundle is the source files, byte for byte, with a banner between them.
 * Nothing is minified or rewritten, so it can be read and reviewed.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'install');

function scripts(dir) {
  return fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort().map((name) => path.join(dir, name));
}

/** The single-file version as text. */
function bundle() {
  const version = require(path.join(ROOT, 'package.json')).version;
  const files = scripts(path.join(SRC, 'core')).concat(scripts(path.join(SRC, 'gas')));
  let out = '/**\n * Placement Desk ' + version + ' - single-file build.\n' +
    ' * Source, licence (MIT) and documentation: see the project repository.\n' +
    ' * Not affiliated with Google, any college or any company.\n */\n';
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    out += '\n// ===== ' + rel + ' =====\n' + fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  }
  return { text: out, files: files.length };
}

function build() {
  const made = bundle();
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'Code.gs'), made.text);
  fs.writeFileSync(path.join(DIST, 'appsscript.json'), fs.readFileSync(path.join(SRC, 'appsscript.json'), 'utf8').replace(/\r\n/g, '\n'));
  return { files: made.files, bytes: Buffer.byteLength(made.text) };
}

if (require.main === module) {
  const result = build();
  console.log('Built install/Code.gs from ' + result.files + ' files (' + Math.round(result.bytes / 1024) + ' KB).');
}

module.exports = { build, bundle };
