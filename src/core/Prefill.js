/**
 * @fileoverview Pre-filled Google Form links.
 *
 * A public Google Form's page carries its list of questions in a script
 * variable called FB_PUBLIC_LOAD_DATA_. Each question has an entry id, and
 * Google Forms itself supports links of the form
 *
 *   .../viewform?usp=pp_url&entry.123=Asha&entry.456=CS
 *
 * that open the form with those answers typed in. This file matches the
 * questions to the student's saved profile and builds that link.
 *
 * It never submits anything. The student opens the link, checks every
 * answer and presses Submit themselves.
 */
var PdPrefill = (function () {
  'use strict';

  var MAX_HTML = 3 * 1024 * 1024;
  var MAX_URL = 7000;

  var TYPE = {
    0: 'short', 1: 'paragraph', 2: 'choice', 3: 'dropdown', 4: 'checkboxes',
    5: 'scale', 7: 'grid', 9: 'date', 10: 'time', 13: 'upload', 18: 'rating'
  };

  /**
   * Profile fields the tool knows how to recognise in a form.
   * `keywords` are phrases looked for in the question; `not` lists words
   * that mean the question is about someone or something else.
   */
  var FIELDS = [
    { key: 'fullName', label: 'Full name', keywords: ['full name', 'name of the student', 'name of student', 'student name', 'candidate name', 'name of the candidate', 'name of candidate', 'your name', 'name as per', 'name'], not: ['father', 'mother', 'parent', 'guardian', 'company', 'school', 'project', 'team', 'reference', 'mentor', 'first', 'last', 'middle', 'user', 'file'] },
    { key: 'firstName', label: 'First name', keywords: ['first name', 'given name'] },
    { key: 'middleName', label: 'Middle name', keywords: ['middle name'] },
    { key: 'lastName', label: 'Last name', keywords: ['last name', 'surname', 'family name'] },
    { key: 'rollNumber', label: 'Roll number / PRN', keywords: ['prn', 'prn no', 'prn number', 'roll no', 'roll number', 'enrollment', 'enrolment', 'registration number', 'registration no', 'seat number', 'seat no', 'student id', 'college id', 'usn', 'university number', 'hall ticket'] },
    { key: 'email', label: 'Personal email', keywords: ['email', 'e mail', 'mail id', 'email id', 'email address', 'personal email', 'personal mail'], not: ['college', 'official', 'institute', 'university'] },
    { key: 'collegeEmail', label: 'College email', keywords: ['college email', 'college mail', 'official email', 'official mail', 'institute email', 'university email', 'college e mail'] },
    { key: 'phone', label: 'Mobile number', keywords: ['mobile', 'phone', 'contact number', 'contact no', 'whatsapp', 'mobile number', 'mobile no'], not: ['parent', 'father', 'mother', 'guardian', 'alternate'] },
    { key: 'gender', label: 'Gender', keywords: ['gender', 'sex'] },
    { key: 'dob', label: 'Date of birth', keywords: ['date of birth', 'dob', 'birth date', 'birthdate'] },
    { key: 'college', label: 'College', keywords: ['college name', 'name of college', 'name of the college', 'institute name', 'name of the institute', 'name of institute', 'college', 'institute', 'university name'], not: ['email', 'mail', 'id'] },
    { key: 'degree', label: 'Degree', keywords: ['degree', 'course', 'qualification', 'programme', 'program'] },
    { key: 'branch', label: 'Branch', keywords: ['branch', 'department', 'stream', 'specialization', 'specialisation', 'discipline'] },
    { key: 'batch', label: 'Passing year', keywords: ['batch', 'passing year', 'year of passing', 'passout year', 'pass out year', 'graduation year', 'year of graduation', 'passing out year'], not: ['10th', '12th', 'ssc', 'hsc', 'diploma'] },
    { key: 'cgpa', label: 'CGPA', keywords: ['cgpa', 'cpi', 'gpa', 'sgpa', 'cgpa till', 'aggregate cgpa', 'current cgpa'] },
    { key: 'percent', label: 'Degree percentage', keywords: ['aggregate percentage', 'be percentage', 'btech percentage', 'b tech percentage', 'ug percentage', 'graduation percentage', 'degree percentage', 'engineering percentage', 'aggregate', 'percentage'], not: ['10th', '12th', 'ssc', 'hsc', 'diploma', 'x', 'xii', 'tenth', 'twelfth'] },
    { key: 'tenth', label: '10th percentage', keywords: ['10th', 'ssc', 'class 10', 'class x', 'tenth', 'matriculation', 'std 10', 'x th'] },
    { key: 'twelfth', label: '12th percentage', keywords: ['12th', 'hsc', 'class 12', 'class xii', 'twelfth', 'intermediate', 'std 12', 'xii th'] },
    { key: 'diploma', label: 'Diploma percentage', keywords: ['diploma'] },
    { key: 'backlogs', label: 'Active backlogs', keywords: ['backlog', 'backlogs', 'active backlog', 'live backlog', 'atkt', 'arrears', 'kt'] },
    { key: 'gapYears', label: 'Gap years', keywords: ['gap', 'year gap', 'education gap', 'gap in education'] },
    { key: 'city', label: 'City', keywords: ['city', 'current location', 'hometown', 'home town', 'native place', 'current city'] },
    { key: 'linkedin', label: 'LinkedIn', keywords: ['linkedin', 'linked in'] },
    { key: 'github', label: 'GitHub', keywords: ['github', 'git hub'] },
    { key: 'resumeLink', label: 'Resume link', keywords: ['resume link', 'cv link', 'resume drive link', 'resume url', 'link of resume', 'link to resume', 'resume'] }
  ];

  /** The canonical viewform address of a Google Form, or '' if it is not one. */
  function normaliseFormUrl(url) {
    var safe = PdText.safeUrl(url);
    if (!safe || PdText.hostOf(safe) !== 'docs.google.com') return '';
    var m = /^https:\/\/docs\.google\.com\/forms\/((?:u\/\d+\/)?d\/(?:e\/)?[A-Za-z0-9_-]{10,120})(?:\/|$|\?|#)/.exec(safe);
    if (!m) return '';
    return 'https://docs.google.com/forms/' + m[1].replace(/^u\/\d+\//, '') + '/viewform';
  }

  /**
   * Pull the question list out of a form page.
   * The value is read as JSON only: nothing from the page is executed.
   * @return {Array|null}
   */
  function extractLoadData(html) {
    var s = String(html || '');
    if (s.length > MAX_HTML) return null;
    var assign = /FB_PUBLIC_LOAD_DATA_\s*=\s*\[/.exec(s);
    if (!assign) return null;
    var start = assign.index + assign[0].length - 1;
    var depth = 0;
    var inString = false;
    for (var i = start; i < s.length; i++) {
      var ch = s.charAt(i);
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          try {
            var data = JSON.parse(s.slice(start, i + 1));
            return Array.isArray(data) ? data : null;
          } catch (e) {
            return null;
          }
        }
      }
    }
    return null;
  }

  /**
   * @param {Array} data the FB_PUBLIC_LOAD_DATA_ value
   * @return {{title:string, questions:Array<Object>}|null}
   */
  function parseForm(data) {
    if (!Array.isArray(data) || !Array.isArray(data[1]) || !Array.isArray(data[1][1])) return null;
    var questions = [];
    data[1][1].forEach(function (item) {
      if (!Array.isArray(item)) return;
      var typeCode = item[3];
      var type = Object.prototype.hasOwnProperty.call(TYPE, typeCode) ? TYPE[typeCode] : '';
      if (!type) return;
      var entry = Array.isArray(item[4]) && Array.isArray(item[4][0]) ? item[4][0] : null;
      var entryId = entry && (typeof entry[0] === 'number' || /^\d+$/.test(String(entry[0]))) ? String(entry[0]) : '';
      var options = [];
      var hasOther = false;
      if (entry && Array.isArray(entry[1])) {
        entry[1].forEach(function (opt) {
          if (!Array.isArray(opt)) return;
          if (opt[4] === 1 || opt[4] === true) { hasOther = true; return; }
          if (typeof opt[0] === 'string' && opt[0] !== '') options.push(opt[0]);
        });
      }
      questions.push({
        title: PdText.truncate(PdText.normalise(item[1]), 200),
        type: type,
        entryId: entryId,
        required: !!(entry && entry[2]),
        options: options,
        hasOther: hasOther
      });
    });
    var title = typeof data[3] === 'string' ? data[3] : (typeof data[1][8] === 'string' ? data[1][8] : '');
    return { title: PdText.truncate(PdText.normalise(title), 150), questions: questions };
  }

  function containsPhrase(foldedText, foldedPhrase) {
    return (' ' + foldedText + ' ').indexOf(' ' + foldedPhrase + ' ') !== -1;
  }

  function isFilled(field) {
    return field.value !== undefined && field.value !== null && String(field.value) !== '';
  }

  /** Fields whose phrases appear in `text`, each with its longest phrase and where it sits. */
  function candidates(text, fullText, fields) {
    var out = [];
    var padded = ' ' + text + ' ';
    fields.forEach(function (field) {
      var blocked = (field.not || []).some(function (word) { return containsPhrase(fullText, PdText.fold(word)); });
      if (blocked) return;
      var score = 0;
      var at = -1;
      (field.keywords || []).forEach(function (keyword) {
        var k = PdText.fold(keyword);
        var index = k ? padded.indexOf(' ' + k + ' ') : -1;
        if (index !== -1 && k.length > score) { score = k.length; at = index; }
      });
      if (score) out.push({ field: field, score: score, start: at, end: at + score });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  /**
   * The profile field a question is asking for.
   *
   * - The longest matching phrase wins: "college email" beats "email", and
   *   "name of the college" beats "name".
   * - Words in brackets are qualifiers ("Full Name (as per college records)"),
   *   so the text outside brackets is tried first.
   * - "12th / Diploma percentage" names two things; the one the student has
   *   filled in is used.
   * - A tie is left for the student to answer.
   * @return {{field:Object, score:number}|null}
   */
  function pickField(questionTitle, fields) {
    var full = PdText.fold(questionTitle);
    if (!full) return null;
    var outer = PdText.fold(String(questionTitle).replace(/\([^)]*\)/g, ' '));
    var found = outer ? candidates(outer, full, fields) : [];
    if (!found.length) found = candidates(full, full, fields);
    if (!found.length) return null;

    var best = found[0];
    if (!isFilled(best.field)) {
      for (var i = 1; i < found.length; i++) {
        var other = found[i];
        var apart = other.end <= best.start || other.start >= best.end;
        if (apart && isFilled(other.field)) { best = other; break; }
      }
    }
    var tie = found.some(function (c) {
      return c !== best && c.score === best.score && c.field.key !== best.field.key && isFilled(c.field) === isFilled(best.field);
    });
    return tie ? null : { field: best.field, score: best.score };
  }

  /** The option that means the same as the student's answer, or ''. */
  function pickOption(options, value, aliases) {
    var wanted = [value].concat(aliases || []).map(PdText.fold).filter(Boolean);
    var i;
    for (i = 0; i < options.length; i++) {
      if (wanted.indexOf(PdText.fold(options[i])) !== -1) return options[i];
    }
    var partial = options.filter(function (option) {
      var o = PdText.fold(option);
      return wanted.some(function (w) { return containsPhrase(o, w) || containsPhrase(w, o); });
    });
    return partial.length === 1 ? partial[0] : '';
  }

  function toIsoDate(value, order) {
    var found = PdDates.firstDate(String(value), { base: { y: 2000, m: 1, d: 1 }, order: order });
    return found ? PdDates.toIso({ y: found.y, m: found.m, d: found.d, hasTime: false }) : '';
  }

  /**
   * Match a form's questions to the profile.
   * @param {Array<Object>} questions from parseForm
   * @param {Array<Object>} fields profile fields: {key, label, value, keywords, not, aliases}
   * @param {{order:(string|undefined)}=} opts
   * @return {{answers:Array<Object>, manual:Array<Object>}}
   */
  function mapQuestions(questions, fields, opts) {
    var answers = [];
    var manual = [];
    var order = opts && opts.order;
    questions.forEach(function (q) {
      var reason = '';
      var hit = pickField(q.title, fields);
      var value = hit ? String(hit.field.value === undefined || hit.field.value === null ? '' : hit.field.value) : '';
      if (q.type === 'upload') reason = 'Upload the file yourself';
      else if (q.type === 'grid' || q.type === 'scale' || q.type === 'rating' || q.type === 'time') reason = 'Answer this one yourself';
      else if (!q.entryId) reason = 'Answer this one yourself';
      else if (!hit) reason = 'Not in your profile';
      else if (value === '') reason = 'Add "' + hit.field.label + '" to your profile';

      if (!reason && (q.type === 'choice' || q.type === 'dropdown' || q.type === 'checkboxes')) {
        var option = pickOption(q.options, value, hit.field.aliases);
        if (option) value = option;
        else reason = 'Pick from the options (your answer: ' + PdText.truncate(value, 40) + ')';
      }
      if (!reason && q.type === 'date') {
        value = toIsoDate(value, order);
        if (!value) reason = 'Enter the date yourself';
      }

      if (reason) {
        manual.push({ question: q.title, reason: reason, required: q.required });
      } else {
        answers.push({ entryId: q.entryId, value: value, question: q.title, field: hit.field.label });
      }
    });
    return { answers: answers, manual: manual };
  }

  /** Build the viewform link that opens with the answers typed in. */
  function buildUrl(formUrl, answers) {
    var base = normaliseFormUrl(formUrl);
    if (!base) return '';
    var url = base + '?usp=pp_url';
    for (var i = 0; i < answers.length; i++) {
      var a = answers[i];
      if (!/^\d+$/.test(String(a.entryId))) continue;
      var part = '&entry.' + a.entryId + '=' + encodeURIComponent(String(a.value));
      if (url.length + part.length > MAX_URL) break;
      url += part;
    }
    return url;
  }

  /**
   * Turn a CGPA into a percentage using the rule from Settings.
   * Universities differ, so there is no built-in default: the student copies
   * the rule from their own university's circular.
   *   "x9.5"      multiply by 9.5
   *   "x10-7.5"   multiply by 10, then subtract 7.5
   *   "x8.8+0"    same shape with any numbers
   * @return {string} percentage with up to two decimals, or '' if unknown
   */
  function cgpaToPercent(cgpa, formula) {
    var value = parseFloat(String(cgpa).replace(',', '.'));
    var m = /^\s*[x*\u00D7]\s*(\d+(?:\.\d+)?)\s*(?:([+\-\u2212])\s*(\d+(?:\.\d+)?))?\s*$/i.exec(String(formula || ''));
    if (!isFinite(value) || !m) return '';
    var result = value * parseFloat(m[1]);
    if (m[2]) result += (m[2] === '+' ? 1 : -1) * parseFloat(m[3]);
    if (!isFinite(result) || result < 0 || result > 100) return '';
    return String(Math.round(result * 100) / 100);
  }

  /** Label and answer pairs for the copy-ready list, skipping blanks. */
  function answerSheet(fields) {
    return fields
      .filter(function (f) { return f.value !== undefined && f.value !== null && String(f.value) !== ''; })
      .map(function (f) { return { label: f.label, value: String(f.value) }; });
  }

  return {
    FIELDS: FIELDS,
    normaliseFormUrl: normaliseFormUrl,
    extractLoadData: extractLoadData,
    parseForm: parseForm,
    pickField: pickField,
    pickOption: pickOption,
    mapQuestions: mapQuestions,
    buildUrl: buildUrl,
    cgpaToPercent: cgpaToPercent,
    answerSheet: answerSheet
  };
})();
