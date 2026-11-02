/* ============================================================
   Shared synthetic dataset for the Yash Honda tracker prototype.
   All names, numbers and documents are invented demo data.
   No real candidate information is used anywhere.
   ============================================================ */
(function () {
  const TODAY = new Date('2026-10-16T00:00:00+05:30');
  const FY = { short: '2627', label: 'FY 2026-27', start: '2026-04-01', end: '2027-03-31' };

  const facilities = [
    { id: 'f1', name: 'Hadapsar RedWing', kind: 'Sales', active: true },
    { id: 'f2', name: 'Service RedWing', kind: 'Service', active: true },
    { id: 'f3', name: 'Service BigWing', kind: 'Service', active: true },
    { id: 'f4', name: 'Izeil office', kind: 'Office', active: true },
    { id: 'f5', name: 'BigWing Sales', kind: 'Sales', active: true },
    { id: 'f6', name: 'Fursungi', kind: 'Sales', active: true },
    { id: 'f7', name: 'Wadki', kind: 'Service', active: true },
    { id: 'f8', name: 'ESD Godown', kind: 'Godown', active: true },
    { id: 'f9', name: 'HP Salunke Vihar', kind: 'Sales', active: true }
  ];

  const users = [
    { id: 'u-admin', name: 'Ankur Jaiswal', role: 'Admin', initials: 'AJ', email: 'mail.jaiswal@gmail.com', scope: 'all' },
    { id: 'u-owner', name: 'Deepak Sanghvi', role: 'Owner', initials: 'DS', email: 'd.sanghvi@yashhonda.in', scope: 'all' },
    { id: 'u-ceo', name: 'Ranjit Bhandari', role: 'CEO', initials: 'RB', email: 'r.bhandari@yashhonda.in', scope: 'all' },
    { id: 'u-hr1', name: 'Sneha Kale', role: 'HR Team', initials: 'SK', email: 's.kale@yashhonda.in', scope: ['f1', 'f2', 'f3', 'f4'] },
    { id: 'u-hr2', name: 'Farida Qureshi', role: 'HR Team', initials: 'FQ', email: 'f.qureshi@yashhonda.in', scope: ['f6', 'f7', 'f8', 'f9', 'f5'] },
    { id: 'u-fin', name: 'Nilesh Patil', role: 'Finance Team', initials: 'NP', email: 'n.patil@yashhonda.in', scope: 'all' },
    { id: 'u-emp1', name: 'Amit Zode', role: 'Employee', initials: 'AZ', email: 'a.zode@yashhonda.in', scope: ['f1'] },
    { id: 'u-emp2', name: 'Neha Palsokar', role: 'Employee', initials: 'NP', email: 'n.palsokar@yashhonda.in', scope: ['f6'] },
    { id: 'u-emp3', name: 'Vikram Iyer', role: 'Employee', initials: 'VI', email: 'v.iyer@yashhonda.in', scope: ['f3'] }
  ];

  // candidate: docs = resume/photo presence, decision = candidate-level outcome
  const R = 'resume', P = 'photo';
  const cand = (name, city, phone, docs, status, note, salary, extra) =>
    Object.assign({
      name, city, phone, docs, status, note, salary,
      addedBy: 'Sneha Kale', addedOn: '2026-10-02',
      notice: { given: true, method: 'Shared on phone at collection', date: '2026-10-02', version: 'v1.2' }
    }, extra || {});

  const positions = [
    // --- YH-2627-0147 : Sales Consultant, Hadapsar RedWing, qty 4 (demo scenario 1)
    { number: 'YH-2627-0147-P1', req: 'YH-2627-0147', facility: 'f1', status: 'hired', prev: null, stageOn: '2026-09-28', hr: 'u-hr1', hiredOn: '2026-10-06',
      cands: [cand('Rohit Deshpande', 'Hadapsar', '+91 98226 41730', [R, P], 'approved', '3 yrs two-wheeler counter sales, Marathi + Hindi + English. Ready to join on short notice.', 28500, { addedOn: '2026-08-21' })] },
    { number: 'YH-2627-0147-P2', req: 'YH-2627-0147', facility: 'f1', status: 'shortlisted', prev: null, stageOn: '2026-10-09', hr: 'u-hr1',
      cands: [
        cand('Kunal Bhosale', 'Chinchwad', '+91 93711 08264', [R, P], 'submitted', 'Better interview than expected on finance part-approval flow.', 26000, { addedOn: '2026-10-05' }),
        cand('Apurva Wagh', 'Kothrud', '+91 90110 55348', [R, P], 'rejected', 'Accepted another dealer offer the same evening.', 27000, { addedOn: '2026-09-30' })
      ] },
    { number: 'YH-2627-0147-P3', req: 'YH-2627-0147', facility: 'f1', status: 'hr_searching', prev: null, stageOn: '2026-10-12', hr: 'u-hr1',
      cands: [cand('Shaikh Nadeem', 'Wadki', '+91 84460 19072', [R], 'draft', 'Resume only for now, photo session scheduled Monday.', 24500, { addedOn: '2026-10-13' })] },
    { number: 'YH-2627-0147-P4', req: 'YH-2627-0147', facility: 'f1', status: 'hr_searching', prev: 'sent_for_approval', holdOn: '2026-10-08', holdReason: 'Counter headcount under review with Showroom Ops', holdReview: '2026-11-02', holdBy: 'Ranjit Bhandari', hr: 'u-hr1', cands: [] },

    // --- YH-2627-0151 : Two-wheeler Technician, Service BigWing, qty 3
    { number: 'YH-2627-0151-P1', req: 'YH-2627-0151', facility: 'f3', status: 'sent_for_approval', prev: null, stageOn: '2026-10-14', hr: 'u-hr1',
      cands: [cand('Pravin Jadhav', 'Rahatani', '+91 93227 71406', [R, P], 'submitted', 'ITI Motor Vehicle Mechanic, 4 yrs at a competing Honda service unit. Certificate verified.', 22800, { addedOn: '2026-10-14' })] },
    { number: 'YH-2627-0151-P2', req: 'YH-2627-0151', facility: 'f3', status: 'maybe_further_review', prev: null, stageOn: '2026-10-13', hr: 'u-hr1',
      cands: [cand('Ganesh Salunkhe', 'Pune', '+91 98503 26119', [R, P], 'maybe', 'Strong on gear/differential, weak on diagnostic tool. Revisit after the Nov batch.', 21500, { addedOn: '2026-10-07' })] },
    { number: 'YH-2627-0151-P3', req: 'YH-2627-0151', facility: 'f3', status: 'hr_searching', prev: null, stageOn: '2026-09-25', hr: 'u-hr1', cands: [] },

    // --- YH-2627-0153 : Godown Store Keeper, ESD Godown, qty 2
    { number: 'YH-2627-0153-P1', req: 'YH-2627-0153', facility: 'f8', status: 'sent_for_approval', prev: null, stageOn: '2026-10-15', hr: 'u-hr2',
      cands: [cand('Imran Shaikh', 'Mosad', '+91 70301 48295', [R, P], 'submitted', 'Handles SAP stock entries and two-wheeler dispatch paperwork. Physically fit for racking work.', 20400, { addedOn: '2026-10-15' })] },
    { number: 'YH-2627-0153-P2', req: 'YH-2627-0153', facility: 'f8', status: 'shortlisted', prev: null, stageOn: '2026-10-11', hr: 'u-hr2',
      cands: [cand('Sandeep Kharat', 'Bhosari', '+91 90280 63741', [R, P], 'screening', 'Experienced picker, salary expectation slightly above band.', 19800, { addedOn: '2026-10-10' })] },

    // --- YH-2627-0155 : Relationship Officer, Fursungi, qty 2
    { number: 'YH-2627-0155-P1', req: 'YH-2627-0155', facility: 'f6', status: 'offer_in_progress', prev: null, stageOn: '2026-10-09', hr: 'u-hr2', joiningOn: '2026-10-26',
      cands: [cand('Madhuri Gaikwad', 'Fursungi', '+91 99704 21586', [R, P], 'approved', 'Offer verbally accepted, joining 26 Oct. Background check clear.', 25200, { addedOn: '2026-09-28' })] },
    { number: 'YH-2627-0155-P2', req: 'YH-2627-0155', facility: 'f6', status: 'hr_searching', prev: null, stageOn: '2026-10-06', hr: 'u-hr2', cands: [] },

    // --- YH-2627-0158 : Insurance & Documentation Executive, Izeil office
    { number: 'YH-2627-0158-P1', req: 'YH-2627-0158', facility: 'f4', status: 'hr_searching', prev: null, stageOn: '2026-08-20', hr: 'u-hr1', cands: [] },

    // --- YH-2627-0149 : Delivery Rider, HP Salunke Vihar
    { number: 'YH-2627-0149-P1', req: 'YH-2627-0149', facility: 'f9', status: 'closed_unfilled', prev: null, stageOn: '2026-10-05', closedOn: '2026-10-05', closeReason: 'Role converted to outsourced agency fleet for Q3', cands: [] }
  ];

  const requests = [
    {
      number: 'YH-2627-0147', facility: 'f1', title: 'Sales Consultant — Two-wheeler Counter', raisedBy: 'u-emp1',
      reason: 'Replacement — employee left', sal: [24000, 32000], inc: [4000, 9000], qty: 4, priority: 'Urgent',
      requiredBy: '2026-10-31', submittedAt: '2026-08-18', status: 'approved', approver: 'Deepak Sanghvi', decidedAt: '2026-08-21',
      notes: 'Two of our counter team moved to the finance vertical. Festive season bookings are being lost on walk-in delays.',
      wf: 'v1'
    },
    {
      number: 'YH-2627-0151', facility: 'f3', title: 'Two-wheeler Service Technician', raisedBy: 'u-emp3',
      reason: 'New', sal: [19000, 25000], inc: [2500, 6000], qty: 3, priority: 'Normal',
      requiredBy: '2026-11-15', submittedAt: '2026-09-24', status: 'approved', approver: 'Ranjit Bhandari', decidedAt: '2026-09-26',
      notes: 'Service bay utilisation is at 91% for four straight weeks. Adding a third lift needs two technicians plus one trainee.',
      wf: 'v1'
    },
    {
      number: 'YH-2627-0153', facility: 'f8', title: 'Godown Store Keeper', raisedBy: 'u-hr2',
      reason: 'Replacement — planned exit', sal: [18000, 22000], inc: [0, 0], qty: 2, priority: 'Normal',
      requiredBy: '2026-11-01', submittedAt: '2026-10-04', status: 'approved', approver: 'Deepak Sanghvi', decidedAt: '2026-10-06',
      notes: 'Current holder retiring end of November. Need overlap of two weeks for spare-parts coding handover.',
      wf: 'v1'
    },
    {
      number: 'YH-2627-0155', facility: 'f6', title: 'Relationship Officer — Loans & Insurance', raisedBy: 'u-emp2',
      reason: 'New', sal: [22000, 28000], inc: [3000, 8000], qty: 2, priority: 'Urgent',
      requiredBy: '2026-10-25', submittedAt: '2026-09-28', status: 'approved', approver: 'Ranjit Bhandari', decidedAt: '2026-10-01',
      notes: 'Fursungi booking conversion on finance is 38% below Hadapsar. One dedicated RO should close most of that gap.',
      wf: 'v1'
    },
    {
      number: 'YH-2627-0158', facility: 'f4', title: 'Insurance & Documentation Executive', raisedBy: 'u-hr1',
      reason: 'Replacement — employee left', sal: [17000, 21000], inc: [0, 2000], qty: 1, priority: 'Normal',
      requiredBy: '2026-11-30', submittedAt: '2026-08-11', status: 'approved', approver: 'Deepak Sanghvi', decidedAt: '2026-08-14',
      notes: 'Left in July. RTO workload is being absorbed by the compliance team as a stopgap.',
      wf: 'v1'
    },
    {
      number: 'YH-2627-0160', facility: 'f5', title: 'Test Ride & Delivery Driver', raisedBy: 'u-emp3',
      reason: 'New', sal: [16000, 19000], inc: [1000, 3000], qty: 2, priority: 'Normal',
      requiredBy: '2026-12-05', submittedAt: '2026-10-13', status: 'pending', approver: null, decidedAt: null,
      notes: 'BigWing Sales test-ride queue runs 40 minutes on weekends. Two drivers would also cover customer deliveries.',
      wf: 'v1'
    },
    {
      number: 'YH-2627-0161', facility: 'f2', title: 'Service Advisor', raisedBy: 'u-emp3',
      reason: 'Replacement — employee left', sal: [21000, 26000], inc: [2000, 5500], qty: 1, priority: 'Urgent',
      requiredBy: '2026-10-30', submittedAt: '2026-10-14', status: 'pending', approver: null, decidedAt: null,
      notes: 'Customer complaint count doubled since the advisor left on 3 Oct.',
      wf: 'v1'
    },
    {
      number: 'YH-2627-0162', facility: 'f7', title: 'Body Shop Spray Painter', raisedBy: 'u-hr2',
      reason: 'New', sal: [20000, 26000], inc: [1500, 4000], qty: 1, priority: 'Normal',
      requiredBy: '2026-12-01', submittedAt: '2026-10-15', status: 'returned', approver: 'Ranjit Bhandari', decidedAt: '2026-10-15',
      notes: 'Wadki body-shop capability is being capped because we cannot do paint in-house.',
      returnReason: 'Confirm whether this is a booth operator or a full spray painter, and re-check the band against the Fursungi rate.',
      wf: 'v1'
    },
    {
      number: 'YH-2627-0149', facility: 'f9', title: 'Delivery Rider', raisedBy: 'u-emp2',
      reason: 'New', sal: [15000, 18000], inc: [0, 2500], qty: 1, priority: 'Normal',
      requiredBy: '2026-10-10', submittedAt: '2026-09-19', status: 'closed', approver: 'Deepak Sanghvi', decidedAt: '2026-09-22',
      notes: 'Local deliveries within Salunke Vihar catchment.',
      closeReason: 'Converted to an outsourced agency fleet, no in-house headcount required.',
      wf: 'v1'
    },
    {
      number: 'YH-2627-0156', facility: 'f6', title: 'Showroom Cashier', raisedBy: 'u-emp2',
      reason: 'Replacement — planned exit', sal: [18000, 21000], inc: [0, 2000], qty: 1, priority: 'Normal',
      requiredBy: '2026-11-20', submittedAt: '2026-10-08', status: 'rejected', approver: 'Ranjit Bhandari', decidedAt: '2026-10-09',
      notes: 'Existing cashier transferring to a sibling business in Nashik.',
      rejectReason: 'Headcount to be re-absorbed into the common counter pool at BigWing Sales until the Q4 review.',
      wf: 'v1'
    }
  ];

  const audit = [
    { at: '2026-10-16 09:41', who: 'Ranjit Bhandari', cat: 'security', action: 'Denied document access', target: 'doc 8842 · Pravin Jadhav · resume', outcome: 'blocked', detail: 'Finance Team lacks view_resume' },
    { at: '2026-10-16 09:12', who: 'Sneha Kale', cat: 'business', action: 'Candidate sent for approval', target: 'YH-2627-0151-P1 · Pravin Jadhav', outcome: 'ok', detail: 'resume + photo validated' },
    { at: '2026-10-16 08:55', who: 'system', cat: 'operational', action: 'Notification batch failed', target: 'in-app outbox', outcome: 'retried', detail: '2 recipients, attempt 2' },
    { at: '2026-10-15 18:20', who: 'Farida Qureshi', cat: 'business', action: 'Document uploaded', target: 'doc 8837 · Imran Shaikh · photo', outcome: 'ok', detail: '1.1 MB · image/jpeg · EXIF stripped' },
    { at: '2026-10-15 17:44', who: 'Ankur Jaiswal', cat: 'config', action: 'Workflow version published', target: 'yash_honda_default v1', outcome: 'ok', detail: 'SLA warn 2d / overdue 5d on vacancy approval' },
    { at: '2026-10-15 16:02', who: 'Ranjit Bhandari', cat: 'business', action: 'Position put on hold', target: 'YH-2627-0147-P4', outcome: 'ok', detail: 'prev stage sent_for_approval' },
    { at: '2026-10-15 11:38', who: 'Deepak Sanghvi', cat: 'export', action: 'Report exported', target: 'Wadki + Fursungi · FY 2026-27', outcome: 'ok', detail: 'CSV, 34 rows, no candidate columns' },
    { at: '2026-10-15 10:07', who: 'unknown', cat: 'security', action: 'Failed sign-in', target: 'n.palsokar@yashhonda.in', outcome: 'blocked', detail: '4 attempts, rate limited' },
    { at: '2026-10-14 16:31', who: 'Sneha Kale', cat: 'privacy', action: 'Candidate notice recorded', target: 'YH-2627-0151-P1 · Pravin Jadhav', outcome: 'ok', detail: 'notice v1.2 shared by phone' },
    { at: '2026-10-14 12:09', who: 'Ankur Jaiswal', cat: 'config', action: 'User deactivated', target: 'v.shende@yashhonda.in', outcome: 'ok', detail: 'history retained' },
    { at: '2026-10-13 15:52', who: 'Ranjit Bhandari', cat: 'business', action: 'Vacancy request returned', target: 'YH-2627-0162', outcome: 'ok', detail: 'reason recorded' },
    { at: '2026-10-13 09:18', who: 'Ankur Jaiswal', cat: 'operational', action: 'Backup restore verified', target: 'staging snapshot 2026-10-12', outcome: 'ok', detail: 'RTO 11 min, checksums match' }
  ];

  // ---------- derived helpers ----------
  const STATUS = {
    pending: { label: 'Pending vacancy approval', cls: 'warn' },
    approved: { label: 'Approved', cls: 'ok' },
    returned: { label: 'Returned for clarification', cls: 'risk' },
    rejected: { label: 'Rejected', cls: 'risk' },
    closed: { label: 'Closed', cls: '' },
    hr_searching: { label: 'HR searching', cls: 'info' },
    shortlisted: { label: 'Shortlisted', cls: 'info' },
    sent_for_approval: { label: 'Sent for candidate approval', cls: 'warn' },
    maybe_further_review: { label: 'Maybe / further review', cls: '' },
    offer_in_progress: { label: 'Offer in progress', cls: 'info' },
    hired: { label: 'Hired', cls: 'ok' },
    closed_unfilled: { label: 'Closed unfilled', cls: '' },
    on_hold: { label: 'On hold', cls: 'hold' }
  };
  const REASONS = ['New', 'Replacement — employee left', 'Replacement — planned exit'];

  const days = (iso) => Math.floor((TODAY - new Date(iso + (iso.length <= 10 ? 'T00:00:00+05:30' : ''))) / 864e5);
  const fac = (id) => (facilities.find(f => f.id === id) || { name: '—' }).name;
  const usr = (id) => users.find(u => u.id === id) || { name: '—', role: '', initials: '?' };
  const posFor = (reqNumber) => positions.filter(p => p.req === reqNumber);
  const livePos = (reqNumber) => posFor(reqNumber).filter(p => p.status !== 'closed_unfilled' && p.status !== 'cancelled');
  const isHold = (p) => !!p.holdOn;
  const candsWith = (arr) => arr;

  function ageing(p) {
    const total = days(posFor(p.req)[0] ? requests.find(r => r.number === p.req).submittedAt : p.stageOn);
    const hold = p.holdOn ? days(p.holdOn) : 0;
    const stage = days(p.stageOn);
    const active = Math.max(total - hold, 0);
    return { total, stage, active, hold };
  }

  // dashboard metric definitions: each returns position or request records (drill-down parity)
  function metrics() {
    const openPos = positions.filter(p => !['hired', 'closed_unfilled', 'cancelled'].includes(p.status) && !isHold(p));
    const out = {
      open_positions: { title: 'Open positions', unit: 'positions', rows: openPos },
      pending_vacancy: { title: 'Pending vacancy approvals', unit: 'requests', rows: requests.filter(r => r.status === 'pending') },
      pending_candidate: { title: 'Pending candidate decisions', unit: 'positions', rows: positions.filter(p => p.status === 'sent_for_approval') },
      shortlisted: { title: 'Shortlisted positions', unit: 'positions', rows: positions.filter(p => p.status === 'shortlisted' || p.status === 'maybe_further_review') },
      hired: { title: 'Hired this FY', unit: 'positions', rows: positions.filter(p => p.status === 'hired' && p.hiredOn >= FY.start) },
      on_hold: { title: 'On hold', unit: 'positions', rows: positions.filter(isHold) },
      closed: { title: 'Closed / cancelled', unit: 'positions', rows: positions.filter(p => ['closed_unfilled', 'cancelled'].includes(p.status)) },
      overdue: { title: 'Overdue decisions', unit: 'tasks', rows: [] }
    };
    const overVac = requests.filter(r => r.status === 'pending' && days(r.submittedAt) > 5)
      .map(r => ({ kind: 'Vacancy approval', ref: r.number, title: r.title, facility: fac(r.facility), age: days(r.submittedAt), why: 'Overdue 5-day approval SLA' }));
    const overCand = positions.filter(p => p.status === 'sent_for_approval' && days(p.stageOn) > 3)
      .map(p => ({ kind: 'Candidate decision', ref: p.number, title: p.cands[0] ? p.cands[0].name : '—', facility: fac(p.facility), age: days(p.stageOn), why: 'Overdue 3-day decision SLA' }));
    const overSearch = positions.filter(p => p.status === 'hr_searching' && days(p.stageOn) > 14 && !isHold(p))
      .map(p => ({ kind: 'No candidate submitted', ref: p.number, title: requests.find(r => r.number === p.req).title, facility: fac(p.facility), age: days(p.stageOn), why: 'No submission for 14+ days' }));
    out.overdue.rows = overVac.concat(overCand, overSearch);
    return out;
  }

  // task queue per viewer role (personal My Actions)
  function tasks(viewerId) {
    const v = usr(viewerId);
    const t = [];
    const canDecide = ['Owner', 'CEO', 'Admin'].includes(v.role);
    const isHR = v.role === 'HR Team';
    const isEmp = v.role === 'Employee';
    const scoped = (fid) => v.scope === 'all' || (Array.isArray(v.scope) && v.scope.includes(fid));
    if (canDecide) {
      requests.filter(r => r.status === 'pending' && r.raisedBy !== viewerId).forEach(r =>
        t.push({ type: 'Vacancy approval', ref: r.number, title: r.title, facility: fac(r.facility), age: days(r.submittedAt), sla: 5, urgent: r.priority === 'Urgent' }));
      positions.filter(p => p.status === 'sent_for_approval').forEach(p =>
        t.push({ type: 'Candidate decision', ref: p.number, title: (p.cands[0] || {}).name || '—', facility: fac(p.facility), age: days(p.stageOn), sla: 3, urgent: days(p.stageOn) > 3, docs: (p.cands[0] || {}).docs }));
      positions.filter(isHold).forEach(p =>
        t.push({ type: 'Hold review', ref: p.number, title: p.holdReason, facility: fac(p.facility), age: days(p.holdOn), sla: 21, due: p.holdReview }));
    }
    if (isHR) {
      positions.filter(p => p.hr === viewerId && p.status === 'hr_searching').forEach(p =>
        t.push({ type: 'Sourcing', ref: p.number, title: requests.find(r => r.number === p.req).title, facility: fac(p.facility), age: days(p.stageOn), sla: 14 }));
      positions.filter(p => p.cands.some(c => c.docs.length < 2)).forEach(p =>
        p.cands.filter(c => c.docs.length < 2).forEach(c =>
          t.push({ type: 'Missing documents', ref: p.number, title: c.name, facility: fac(p.facility), age: days(c.addedOn), sla: 2, missing: ['resume', 'photo'].filter(d => !c.docs.includes(d)) })));
      positions.filter(p => p.status === 'offer_in_progress').forEach(p =>
        t.push({ type: 'Joining confirmation', ref: p.number, title: (p.cands[0] || {}).name || '—', facility: fac(p.facility), age: days(p.stageOn), sla: 21, due: p.joiningOn }));
    }
    if (isEmp && scoped) {
      requests.filter(r => r.raisedBy === viewerId && ['returned', 'pending'].includes(r.status)).forEach(r =>
        t.push({ type: r.status === 'returned' ? 'Clarification needed' : 'Your request is with the approver', ref: r.number, title: r.title, facility: fac(r.facility), age: days(r.submittedAt), sla: 2 }));
    }
    if (v.role === 'Finance Team') {
      requests.filter(r => ['pending', 'approved'].includes(r.status)).slice(0, 3).forEach(r =>
        t.push({ type: 'Budget review', ref: r.number, title: r.title, facility: fac(r.facility), age: days(r.submittedAt), sla: 4 }));
    }
    return t;
  }

  window.YH = { TODAY, FY, facilities, users, requests, positions, audit, STATUS, REASONS, days, fac, usr, posFor, livePos, isHold, ageing, metrics, tasks };
})();
