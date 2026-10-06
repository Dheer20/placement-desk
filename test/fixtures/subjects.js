'use strict';

/**
 * Made-up subject lines written in the style real placement cells use.
 * Every company, college and place here is invented.
 *
 * `base` is the day the email was sent, in the student's timezone.
 * `expect` lists only the fields a case is about.
 */
const base = { y: 2026, m: 10, d: 5 };

module.exports = {
  base,
  knownCompanies: ['Evergreen'],
  cases: [
    {
      name: 'placement drive with date, venue, pay and deadline',
      subject: 'Acme Robotics India Private Limited Recruitment drive for BE/BTech (All Branches) 2027 Batch scheduled on 7th October 2026 at 9:00 a.m. at Main Campus, Riverton || Internship Duration: 6 months || Stipend: INR 15,000 to 20,000 per month || Last date to register: 06-10-2026 till 4:00 PM ||',
      expect: {
        company: 'Acme Robotics India Private Limited', companyKey: 'acme robotics', kind: 'drive', track: 'placement',
        eventDate: '2026-10-07 09:00', deadline: '2026-10-06 16:00', venue: 'Main Campus, Riverton',
        allBranches: true, branches: [], batches: [2027], degrees: ['BE', 'BTECH']
      },
      details: { stipend: 'INR 15,000 to 20,000 per month', duration: '6 months' }
    },
    {
      name: 'internship drive with no event date yet',
      subject: 'Borealis Software Internship Drive for BE/BTech (CS/IT) 2027 Batch || Only for those students who do not have an Internship offer can apply || Stipend : 12,000 Per Month || Role : Technical Trainee || Duration : 3\u20136 Months || Location : Riverton || Last date to register : 06-10-2026 till 4:00 PM ||',
      expect: {
        company: 'Borealis Software', kind: 'internship', track: 'internship',
        eventDate: '', deadline: '2026-10-06 16:00', allBranches: false,
        branches: ['CS/IT', 'CS', 'IT'], batches: [2027]
      },
      details: { stipend: '12,000 Per Month', role: 'Technical Trainee', location: 'Riverton' },
      constraints: 1
    },
    {
      name: 'shortlist with a bracketed company name',
      subject: 'Cobalt NPN (Cloudforce) : List of NIT 2027 Batch candidates shortlisted for Hackathon',
      expect: { company: 'Cobalt NPN (Cloudforce)', companyKey: 'cobalt npn', kind: 'shortlist', hasList: true, batches: [2027], round: 'Hackathon' }
    },
    {
      name: 'shortlist for interviews, short month and weekday in brackets',
      subject: 'Dunmore : List of 2027 batch shortlisted candidates by company for face-to-face interviews on 8th Oct 2026 (Thursday) at 9:00 am at Company Office (Harbour Road)',
      expect: { company: 'Dunmore', kind: 'shortlist', hasList: true, eventDate: '2026-10-08 09:00', round: 'face-to-face interviews' }
    },
    {
      name: 'reminder: "Today" with the real date in brackets, II as separator',
      subject: 'Reminder : Important Instructions for Evergreen recruitment drive for 2027 batch scheduled Today (28-09-2026) at 7:00 pm II Only one Test for Regular candidates',
      expect: { company: 'Evergreen', kind: 'drive', eventDate: '2026-09-28 19:00', batches: [2027] },
      flags: ['reminder', 'urgent']
    },
    {
      name: 'urgent test notice with event words after the company',
      subject: 'URGENT & IMPORTANT: Falcon Technologies TechPulse MCQ-Based Online/Virtual 2nd Assessment for registered students of all tracks',
      expect: { company: 'Falcon Technologies TechPulse', kind: 'assessment' },
      flags: ['urgent']
    },
    {
      name: '"Tomorrow" followed by a numeric date and a time with no space',
      subject: 'URGENT & IMPORTANT: Garnet Technologies Pvt. internship drive for BE/B.Tech(CS/IT) 2027 batch scheduled Tomorrow, 29/09/2026 at 1:00PM at Main Campus, Riverton',
      expect: { company: 'Garnet Technologies Pvt.', companyKey: 'garnet technologies', kind: 'internship', eventDate: '2026-09-29 13:00', branches: ['CS/IT', 'CS', 'IT'] }
    },
    {
      name: 'result announcement',
      subject: 'Heartiest Congratulations to the Two NIT BE / BTech (Mech) 2027 batch students for their selection in HALCYON INDIA',
      expect: { company: 'HALCYON INDIA', companyKey: 'halcyon', kind: 'result', branches: ['Mech'], batches: [2027] }
    },
    {
      name: 'pre-placement talk with a comma-separated branch list',
      subject: 'Ionix Electric Virtual Pre Placement Talk for BE/BTech (Mechanical, E&TC) 2027 Batch scheduled on 6th October 2026 at 3:00 pm II The list of shortlisted students is attached',
      expect: { company: 'Ionix Electric', kind: 'talk', eventDate: '2026-10-06 15:00', branches: ['Mechanical', 'E&TC'], hasList: false }
    },
    {
      name: 'update notice, month-first date, "all branches" in lower case',
      subject: 'Important update regarding JKL (Earlier JK Mindworks) Online assessment for B.Tech./M.Tech. (all branches) & MCA, 2027 Batch Students scheduled on Oct 3, 2026',
      expect: { company: 'JKL (Earlier JK Mindworks)', companyKey: 'jkl', kind: 'assessment', eventDate: '2026-10-03', allBranches: true, batches: [2027] },
      flags: ['urgent', 'update']
    },
    {
      name: 'shortlist with a head count and "Today, Thursday, <date>"',
      subject: 'Kestrel Analytics : List of 18 shortlisted students (from Slot 3) for the Programming Round scheduled Today, Thursday, 1st October 2026 at 4:45 pm at Main Campus',
      expect: { company: 'Kestrel Analytics', kind: 'shortlist', listCount: 18, eventDate: '2026-10-01 16:45', round: 'Programming Round' }
    },
    {
      name: 'a list that is not a shortlist still needs a name check',
      subject: 'Lumen : List of 2027 batch students to re-attempt the Cognitive Assessment, which has been scheduled for 30 September 2026 at 8:00 PM',
      expect: { company: 'Lumen', kind: 'assessment', hasList: true, eventDate: '2026-09-30 20:00' }
    },
    {
      name: 'free-form urgent notice falls back to a company already on the dashboard',
      subject: "VERY URGENT: 2027 Batch students who have faced the issues during Today's Evergreen Test should submit their details immediately",
      expect: { company: 'Evergreen', kind: 'assessment' },
      flags: ['urgent']
    },
    {
      name: 'company at the end of a lower-case phrase',
      subject: 'Require volunteers for coordination of Evergreen drive on 6-10-2026 at 7:30 am at Main Campus, Riverton.',
      expect: { company: 'Evergreen', kind: 'drive', eventDate: '2026-10-06 07:30' }
    },
    {
      name: 'company name containing "of" and a bracketed short form',
      subject: 'Mistral Corporation of India Ltd. (MCI) recruitment drive BE/B.Tech (Mechanical) 2027 Batch students || Joining: December 2026 /January 2027 || CTC: 4 LPA',
      expect: { company: 'Mistral Corporation of India Ltd. (MCI)', companyKey: 'mistral corporation of india', kind: 'drive', branches: ['Mechanical'], eventDate: '' },
      details: { ctc: '4 LPA' }
    },
    {
      name: 'a programme, two batch years, unclosed bracket',
      subject: 'Nimbus Experiential Learning Program for NIT BE / B.Tech (CS/IT/CS-AI/CS-AIML, 2027, 2028 batch students || FREE Industry Certification',
      expect: { company: 'Nimbus Experiential Learning Program', kind: 'info', batches: [2027, 2028] }
    },
    {
      name: 'shortlist that repeats the drive headline first',
      subject: 'Orchid Design Internship Drive for BE/BTech(Mechanical) 2026 and 2027 Batch : List of shortlisted students by company for further recruitment process',
      expect: { company: 'Orchid Design', kind: 'shortlist', track: 'internship', hasList: true, batches: [2026, 2027], branches: ['Mechanical'] }
    },
    {
      name: 'several degrees and two batch years joined by &',
      subject: 'Pinecrest Housing Finance recruitment drive for BE / BTech / MTech / MBA (All Branches) & MCA 2027 & 2026 Batch scheduled on 8th October 2026 at 9:00 am at Main Campus',
      expect: { company: 'Pinecrest Housing Finance', kind: 'drive', allBranches: true, batches: [2026, 2027], degrees: ['BE', 'BTECH', 'MTECH', 'MBA', 'MCA'], eventDate: '2026-10-08 09:00' }
    },
    {
      name: 'no company can be read: none is invented',
      subject: 'One Of The Top Colleges QRS conducting a Physical/ In-person session on "AI is Changing Jobs"',
      expect: { company: '', companyKey: '', kind: 'talk' }
    },
    {
      name: 'branch list with slashes only',
      subject: 'Quartz ITS : List of NIT B.E./B.Tech (CS/IT/CS Allied Branches/Mechanical) 2027 batch shortlisted candidates for Virtual / Online Interviews on 5th October 2026',
      expect: { company: 'Quartz ITS', kind: 'shortlist', branches: ['CS/IT/CS Allied Branches/Mechanical', 'CS', 'IT', 'CS Allied Branches', 'Mechanical'], eventDate: '2026-10-05' }
    }
  ]
};
