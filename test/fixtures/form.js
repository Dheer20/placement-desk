'use strict';

/**
 * A made-up Google Form page, shaped like the real thing: the question list
 * sits in a script variable called FB_PUBLIC_LOAD_DATA_.
 *
 * Item layout used by Google Forms:
 *   [itemId, title, description, typeCode, [[entryId, [[option], ...], required]]]
 * Type codes: 0 short answer, 1 paragraph, 2 multiple choice, 3 dropdown,
 * 4 checkboxes, 9 date, 13 file upload.
 */
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfExampleExampleExampleExampleExampleExampleExample01/viewform';

const items = [
  [101, 'Full Name (as per college records)', null, 0, [[1000001, null, 1]]],
  [102, 'PRN Number', null, 0, [[1000002, null, 1]]],
  [103, 'Personal Email ID', null, 0, [[1000003, null, 1]]],
  [104, 'College Email ID', null, 0, [[1000004, null, 0]]],
  [105, 'Mobile No. (WhatsApp)', null, 0, [[1000005, null, 1]]],
  [106, 'Gender', null, 2, [[1000006, [['Male', null, null, null, 0], ['Female', null, null, null, 0], ['', null, null, null, 1]], 1]]],
  [107, 'Branch', null, 3, [[1000007, [['Computer Engineering'], ['Information Technology'], ['Mechanical Engineering']], 1]]],
  [108, 'Name of the College', null, 0, [[1000008, null, 1]]],
  [109, 'BE / B.Tech Aggregate Percentage', null, 0, [[1000009, null, 1]]],
  [110, 'CGPA (till last semester)', null, 0, [[1000010, null, 0]]],
  [111, '10th Percentage', null, 0, [[1000011, null, 1]]],
  [112, '12th / Diploma Percentage', null, 0, [[1000012, null, 1]]],
  [113, 'Date of Birth', null, 9, [[1000013, null, 1]]],
  [114, 'Active backlogs', null, 2, [[1000014, [['0'], ['1'], ['2 or more']], 1]]],
  [115, "Father's Name", null, 0, [[1000015, null, 0]]],
  [116, 'Upload your resume (PDF)', null, 13, [[1000016, null, 1]]],
  [117, 'Why do you want to join us?', null, 1, [[1000017, null, 0]]],
  [118, 'Section 2', 'Declaration', 8, null],
  [119, 'Passing Year', null, 3, [[1000019, [['2026'], ['2027'], ['2028']], 1]]],
  [120, 'Preferred location', null, 4, [[1000020, [['Riverton'], ['Lakeside'], ['Anywhere']], 0]]]
];

const loadData = [null, [null, items, null, null, null, null, null, null, 'Acme Robotics - Registration'], '/forms', 'Acme Robotics - Registration', null, null, null, '', null, 0, 0, null, '', 0];

function page(data) {
  return '<!DOCTYPE html><html><head><title>Acme Robotics - Registration</title></head><body>' +
    '<script type="text/javascript" nonce="abc">var FB_PUBLIC_LOAD_DATA_ = ' + JSON.stringify(data) + ';</script>' +
    '<script>var other = ["]]", "FB_PUBLIC_LOAD_DATA_ tricked?"];</script></body></html>';
}

const profile = {
  'Full name': 'Asha Rao',
  'Roll number / PRN': '122B1F045',
  'Personal email': 'asha.rao@example.com',
  'College email': 'asha.rao@northfield.example',
  'Mobile number': '9000000001',
  'Gender': 'Female',
  'Date of birth': '14-03-2005',
  'College': 'Northfield Institute',
  'Degree': 'B.Tech',
  'Branch': 'Computer Engineering',
  'Passing year': '2027',
  'CGPA': '8.4',
  'Degree percentage': '',
  '10th percentage': '91.2',
  '12th percentage': '88',
  'Diploma percentage': '',
  'Active backlogs': '0',
  'City': 'Riverton'
};

module.exports = { FORM_URL, items, loadData, page, profile };
