# Privacy

Placement Desk runs entirely inside your own Google account. There is no
Placement Desk server, no account to create and no analytics. The people who
wrote it cannot see your mail, your Sheet or anything else.

## What it reads

| What | When | Why |
|---|---|---|
| **Subject, sender, recipients and date** of emails that match the searches | Every check | To decide whether an email is placement mail for you |
| **The body** of emails that pass that check | Only after the subject and sender have been checked | To read the details: deadline, venue, pay, form link |
| **Attachments** that are spreadsheets, Word files or CSV, on emails that carry a list | Only on shortlist-type emails | To look for your own name, roll number or email address |
| **Your Settings and Profile tabs** | Every check | They are the configuration |

The searches are limited to your placement cell's address, the mailing lists
you name, and a short list of placement words (shortlist, assessment,
interview, hackathon and similar).

## What it never opens

- OTPs and verification codes
- Password and sign-in emails, security alerts
- Bank, card, UPI and payment emails
- Social network email
- Anything in Spam, Trash, Drafts or Chats

These are excluded in the search itself, and again by a check on each
email's subject and sender before its body is requested. You can add your
own words to the exclusion list in Settings.

## What it stores, and where

Everything is stored in **your copy of the Sheet**, in your Google account:

- One row per company: the details read from the email, and a link back to
  the email in your own Gmail.
- A log of list checks: the company, the round and the result for **you**.
  Nobody else's name or number from a list is stored.
- The ids of emails already handled (so nothing is processed twice), in a
  hidden tab. An id is a short code, not content.
- A log of each check: counts only.

Email bodies and attachments are not stored. They are read in memory during
a check and discarded.

## What leaves your account

- **A summary email to yourself**, if you leave that setting on. It is sent
  from your account to your own address.
- **Requests to Google Forms**, only if you turn on automatic pre-fill or
  ask for a pre-filled link on a row. The request is anonymous (it carries
  no sign-in and none of your answers); your answers are put into a link
  that opens in your own browser.

Nothing else. No data is sent to the authors, to an AI service or to any
third party.

## The permissions Google will ask you for

| Google's wording | What it means here |
|---|---|
| View your email messages and settings | Read-only Gmail. The script cannot send, delete, label, archive or mark mail as read. |
| View and manage spreadsheets that this application has been installed in | This one Sheet only, not your other files. |
| Display and run third-party web content in prompts and sidebars | The menu and the side panel. |
| Allow this application to run when you are not present | The timed checks. |
| Connect to an external service | Reading public Google Forms for pre-filled links. |
| Send email as you | The summary email to yourself. |

You can untick the last two when Google asks; the tool works without them.

## Stopping and deleting

- **Pause:** Placement Desk > Turn off automatic checks.
- **Remove access:** open
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions),
  find the script and choose Remove access.
- **Delete everything:** delete your copy of the Sheet. There is no other
  copy of your data anywhere.

## If you share your Sheet

Your Sheet contains your profile and your placement history. Sharing it
shares all of that. Anyone you give edit access to can also read the script
and, in principle, change it. Keep it private.

## Not affiliated

Placement Desk is an independent open-source project. It is not affiliated
with, endorsed by or connected to Google, any college or university, any
assessment platform or any employer.
