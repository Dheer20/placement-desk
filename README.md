# Placement Desk

[![CI](https://github.com/Dheer20/placement-desk/actions/workflows/ci.yml/badge.svg)](https://github.com/Dheer20/placement-desk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Never miss a placement deadline or a shortlist with your name on it.**

Placement season means forty emails a week: drives, reminders, shortlists,
test links, interview slots. Placement Desk reads them for you and keeps one
Google Sheet up to date with what is open, what is due and whether you are
on the list.

It is free, it runs in your own Google account, and it can only *read* your
mail.

## What it does

- **Finds the emails that are for you.** Your batch and your branch, "all
  branches", or sent to you by name. Everything else is left out.
- **Keeps one row per company.** The drive notice, its reminder, the
  shortlist and the interview schedule all update the same row.
- **Tracks deadlines and to-dos.** "Register by Tue 6 Oct, 4:00 PM" sits at
  the top of your dashboard until you do it or it passes.
- **Checks shortlists for your name.** In the email text and inside attached
  spreadsheets, Word files and CSVs. Exact matches only.
- **Helps with forms.** Builds a pre-filled link for public Google Forms from
  your saved profile, or gives you a copy-ready list of your answers. You
  always press Submit yourself.
- **Nudges your practice.** A small list of skills, and which ones have gone
  cold.
- **Sends a short summary** to your own address, six lines at most, only
  when something is new.

## What it will never do

- **Send, delete, label or mark any email as read.** It asks Google for
  read-only access, so it is not able to.
- **Open private mail.** OTPs, passwords, security alerts, bank and payment
  mail and social mail are excluded twice over.
- **Submit a form, sign in for you or solve a CAPTCHA.**
- **Send your data anywhere.** There is no server. Everything stays in your
  Sheet. Nobody else, including the authors, can see it.
- **Store anyone else's details.** It looks for *your* name on a list and
  records only the answer.

Details: [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Set it up (about 15 minutes)

You need a Google account that receives your placement emails. You do not
need to know how to program.

### 1. Make your Sheet

1. Open [sheets.new](https://sheets.new) to create a blank Google Sheet.
   Name it "Placement Desk".
2. In the menu, choose **Extensions > Apps Script**. A new tab opens with a
   code editor.
3. Delete the few lines of code that are there.
4. Open [`Code.gs` on the latest release](https://github.com/Dheer20/placement-desk/releases/latest),
   copy all of it, and paste it into the editor.
5. On the left, click the gear icon (**Project Settings**) and tick
   **Show "appsscript.json" manifest file in editor**.
6. Go back to the editor (the `< >` icon). Click `appsscript.json`, delete
   what is there, and paste in
   [`appsscript.json` from the same release](https://github.com/Dheer20/placement-desk/releases/latest).
7. Press **Ctrl + S** to save, close the tab, and **reload your Sheet**.

A new menu called **Placement Desk** appears next to Help. (It can take a
few seconds after the reload.)

### 2. Give it permission

1. Choose **Placement Desk > 1. Set up this sheet**.
2. Google says "Authorisation required". Click **OK** and pick your account.
3. Google shows **"Google hasn't verified this app"**. This is expected:
   the "app" is the script you just pasted into your own Sheet, and Google
   only verifies apps published to the public. Click **Advanced**, then
   **Go to Placement Desk (unsafe)**.
4. Review the list of permissions and click **Allow**. What each one means
   is explained in [PRIVACY.md](PRIVACY.md#the-permissions-google-will-ask-you-for).
5. Choose **Placement Desk > 1. Set up this sheet** once more. Your tabs are
   created.

### 3. Tell it who you are

On the **Settings** tab, fill in the *Value* column for the first four rows:

| Setting | Example |
|---|---|
| Placement cell email addresses | `placements@yourcollege.example` |
| Mailing list addresses (optional) | `batch2027@lists.yourcollege.example` |
| Your passing year | `2027` |
| Your branch, every way it is written | `Computer, Comp, CS, CSE, CS/IT` |

For the branch, look at a few old placement emails and list every spelling
your college uses for your branch.

On the **Profile** tab, fill in at least **Full name**, **Roll number / PRN**
and your **email**. These are what shortlists are checked for. Write your
name exactly as it appears on college lists.

### 4. Run it

1. Choose **Placement Desk > 2. Check my email now**.
2. Open the **Dashboard** tab.
3. Happy with it? Choose **Placement Desk > 3. Turn on automatic checks**.
   It will now check three times a day on its own.

To load older emails as well, choose **Catch up on the last few weeks**.

Want to see what it looks like before connecting your mail? Choose
**See an example first**. It adds made-up rows that you can remove from the
same menu.

## Using it

| Tab | What it is |
|---|---|
| **Dashboard** | Start here. Your to-dos, soonest first; what is coming up; practice that is due. Redrawn on every check. |
| **Drives** | One row per company with everything read from the emails. |
| **List checks** | Every shortlist that was checked, and whether you were on it. |
| **Practice** | Your skills and when you last practised each. |
| **Profile** | Your details, for list checks and forms. |
| **Settings** | Your college's addresses, your batch and branch, and options. |
| **Log** | When each check ran and how many emails it handled. |

### Your columns

On **Drives**, two columns are yours: **My mark** and **My notes**. The tool
never changes them.

| My mark | Effect |
|---|---|
| *Applied* | No more "Register" reminders. You still hear about shortlists, tests and the drive itself. |
| *Skip* | No to-dos for this company. |
| *Not applicable* | Same, for drives you are not eligible for. |
| *Hidden* | Same, and it stays off your Dashboard. |

You can also add your own rows (an off-campus application, say). Rows you
add are left alone.

### "On the list?"

| It says | It means |
|---|---|
| **YES - you are on the list** | Your exact roll number, email or full name is there. |
| **Check - possible match** | Your name is there with an extra word, or with a different roll number next to it. Open the email. |
| **Not on the list** | The list was read and you are not on it. |
| **Could not read the file** | The list is a PDF, a picture or an old-format file. Open the email and look yourself. |

Always open the email before acting on something important. The tool reads
what the email says; it cannot know if the email is wrong.

### Forms

Click a row on **Drives** and choose **Placement Desk > Pre-fill the form
for the selected row**.

- If the form is public, you get a link that opens it with your answers
  typed in. Check every answer, fill in what is left, and submit yourself.
- If the form needs you to be signed in (many college forms do), it cannot
  be read from outside. You get a side panel with your answers ready to
  copy instead.

## Questions

**Is it safe to click through "Google hasn't verified this app"?**
For a script you pasted into your own Sheet from a source you trust, yes.
The warning means Google has not reviewed it, which is true of every
personal script. The code is open: you can read all of it, and
`appsscript.json` lists exactly what it is allowed to do.

**It found nothing.**
Check the placement cell address in Settings: open a placement email and
copy the sender's address exactly. Then run **Catch up on the last few
weeks**.

**It shows drives for other branches.**
Add more spellings of your branch in Settings. An email that does not say
who it is for is always shown.

**It missed a drive that was for me.**
Your branch is probably written in a way that is not in your Settings.
Otherwise the email format is new to the tool: please
[tell us](https://github.com/Dheer20/placement-desk/issues/new/choose),
with the names changed.

**My placement mail goes to my college account and it will not authorise.**
Some colleges block scripts on their accounts. Set your college mail to
forward to a personal Gmail account (Gmail Settings > Forwarding) and
install Placement Desk there.

**Google says my storage is full.**
A Google account with no storage left cannot create a new Sheet (and will
soon stop receiving email too). Free some space at
[one.google.com/storage](https://one.google.com/storage), then try again.

**Dates are a day or a month out.**
Check **Timezone** and **How dates are written in your emails** in Settings.

**How do I stop it or remove it?**
**Placement Desk > Turn off automatic checks** stops it. To remove access,
go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
To delete everything, delete the Sheet.

**Does it cost anything? Are there limits?**
No cost. Google gives personal accounts a daily allowance for scripts, and
three checks a day use a small fraction of it.

## For developers

Placement Desk is a Google Apps Script project with no runtime dependencies.

```bash
npm ci
```

```bash
npm run check
```

- `src/core/`: pure logic (parsing, dates, matching, dedupe, pre-fill).
- `src/gas/`: the thin layer that talks to Gmail and the Sheet.
- `test/`: tests that load the same files Apps Script runs, against fakes
  of the Google services. Every fixture is made up.

How and why it is built this way: [DECISIONS.md](DECISIONS.md). How to help,
especially with your own college's email format:
[CONTRIBUTING.md](CONTRIBUTING.md).

## Disclaimer

Placement Desk is an independent, community project. It is not affiliated
with, endorsed by or connected to Google, any college or university, any
assessment platform (such as CoCubes, AMCAT, eLitmus or SHL) or any
employer. All product names belong to their owners. It is provided as is,
without warranty: always confirm deadlines and shortlists in the original
email.

## Licence

[MIT](LICENSE)
