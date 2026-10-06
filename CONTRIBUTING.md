# Contributing

Thank you for helping. The most useful contribution is making Placement Desk
understand **your** college's emails.

## The one rule: no real data

Never put a real email, name, roll number, phone number, college name or
link in an issue, a pull request or a commit. Rewrite it first:

- people become made-up people (`Asha Rao`, roll number `122B1F045`);
- companies become made-up companies (`Acme Robotics`);
- your college becomes `Northfield Institute`;
- addresses use `example.com` / `yourcollege.example`.

Keep the *shape* exactly as it was: the punctuation, the separators, the
word order, the date style. The shape is what the parser needs.

## "It does not understand my college's emails"

Open an issue with the **Email format** template and paste a rewritten
subject line. If you can program, add it yourself:

1. Add a case to `test/fixtures/subjects.js` with the subject and what
   should be read from it.
2. Run `npm test`. It will fail.
3. Fix `src/core/Subject.js` (or `Body.js`, `Dates.js`) until it passes
   without breaking the other cases.

## Setting up

You need [Node.js](https://nodejs.org) 22 or newer. Nothing else.

```bash
npm ci
```

```bash
npm run check
```

`npm run check` runs the linter, the tests, the build and the personal-data
check. All four must pass.

Turn on the pre-commit hook once:

```bash
npm run hooks
```

It blocks personal data, hidden characters and (if you have
[gitleaks](https://github.com/gitleaks/gitleaks) installed) secrets.

To keep your own details out for certain, create `personal.local.txt` in
the project folder with one word per line (your name, roll number, college).
It is gitignored, and the check fails if any of those words appear in a
tracked file.

## How the code is laid out

```
src/core/   Pure logic. No Google services. Everything here is unit-tested.
src/gas/    The thin layer that talks to Gmail and the Sheet.
test/       Tests, made-up fixtures, and fakes of the Google services.
scripts/    Build and checks.
```

Apps Script has no modules: every file shares one global scope. So each
file defines one object (`PdDates`, `PdMatch`, ...) and the tests load the
files the same way Apps Script does. Please keep that pattern:

- no `import`, `require` or `export` in `src/`;
- no code that runs when a file loads, other than defining its object;
- `var` and `function` in `src/` (it keeps the files loadable in any order);
- non-ASCII characters as `\uXXXX` escapes.

Read [DECISIONS.md](DECISIONS.md) before changing how something works; the
reasons are written down there.

## What a good pull request has

- A test that fails before the change and passes after it.
- No new permission in `src/appsscript.json`. If a feature truly needs one,
  open an issue first; the short permission list is a feature.
- No new dependency in `src/`. There are none, on purpose.
- Plain words in anything the student sees.

## Trying your change in a real Sheet

1. `npm run build` writes `install/Code.gs` and `install/appsscript.json`. Commit them with your change; CI fails if they do not match the source.
2. In a test Sheet: Extensions > Apps Script. Paste `Code.gs` over the
   code. In Project Settings, tick "Show appsscript.json", then paste the
   manifest.
3. Reload the Sheet and use the Placement Desk menu.

Use a test Google account if you can.
