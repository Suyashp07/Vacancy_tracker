/**
 * Domain vocabulary for the Yash Honda vacancy and hiring tracker.
 *
 * These constants describe the SHAPE of the process (names, ordering, grouping).
 * The RULES of the process - who may move which status by which action, and what
 * must be filled first - are read from the workflow tables at runtime. Nothing
 * here is allowed to contradict 0004_config_seed.sql; the parity test in
 * tests/workflow-rules.test.ts enforces that.
 */

export const ROLES = ['Admin', 'Owner', 'CEO', 'HR', 'HrHead', 'Finance', 'Employee'] as const;
export type Role = (typeof ROLES)[number];

/** How a role is written on screen. The stored enum key never shows to a user. */
export const ROLE_LABEL: Record<Role, string> = {
  Admin: 'System Admin',
  Owner: 'Owner',
  CEO: 'CEO',
  HR: 'HR Team',
  HrHead: 'HR Head',
  Finance: 'Finance Team',
  Employee: 'Employee',
};

export const REQUEST_STATUSES = [
  'draft',
  'submitted_for_vacancy_approval',
  'approved',
  'returned_for_information',
  'rejected',
  'closed',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const POSITION_STATUSES = [
  'draft',
  'awaiting_vacancy_approval',
  'approved',
  'sourcing',
  'candidate_available',
  'sent_for_candidate_approval',
  'hold',
  'approved_for_joining',
  'hired',
  'position_closed',
  'candidature_unsuccessful',
] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

export const CANDIDATE_STATUSES = [
  'draft',
  'submitted_for_recruitment_approval',
  'approved_for_joining',
  'hired',
  'rejected',
  'hold',
  'returned_for_modifications',
  'candidature_unsuccessful',
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'Resume',
  'Photograph',
  'Education certificate',
  'Experience letter',
  'Identity proof',
  'Relieving letter',
  'Medical fitness',
  'Offer acknowledgement',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** The DPDP hard gate. A candidate cannot enter the approval flow without both. */
export const MANDATORY_DOCUMENTS: readonly DocumentType[] = ['Resume', 'Photograph'];

export const VACANCY_REASONS = [
  'New',
  'Replacement — employee left',
  'Replacement — planned exit',
  'Business expansion',
] as const;

export const CLOSURE_REASONS = [
  'Candidature unsuccessful',
  'Withdrawn',
  'Budget withdrawn',
  'Role made redundant',
  'Duplicate position',
] as const;

export const TASK_TYPES = [
  'vacancy_approval',
  'candidate_approval',
  'hold_review',
  'joining_confirmation',
  'budget_review',
  'clarification',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

// ---------------------------------------------------------------------------
// human labels
// ---------------------------------------------------------------------------
export const REQUEST_LABEL: Record<RequestStatus, string> = {
  draft: 'Draft',
  submitted_for_vacancy_approval: 'Awaiting vacancy approval',
  approved: 'Approved',
  returned_for_information: 'Returned for information',
  rejected: 'Rejected',
  closed: 'Closed',
};

export const POSITION_LABEL: Record<PositionStatus, string> = {
  draft: 'Draft',
  awaiting_vacancy_approval: 'Awaiting vacancy approval',
  approved: 'Vacancy approved',
  sourcing: 'Sourcing',
  candidate_available: 'Candidate available',
  sent_for_candidate_approval: 'Sent for candidate approval',
  hold: 'On hold',
  approved_for_joining: 'Approved for joining',
  hired: 'Hired',
  position_closed: 'Position closed',
  candidature_unsuccessful: 'Candidature unsuccessful',
};

export const CANDIDATE_LABEL: Record<CandidateStatus, string> = {
  draft: 'Draft',
  submitted_for_recruitment_approval: 'Awaiting decision',
  approved_for_joining: 'Approved for joining',
  hired: 'Hired',
  rejected: 'Rejected',
  hold: 'On hold',
  returned_for_modifications: 'Returned for modification',
  candidature_unsuccessful: 'Candidature unsuccessful',
};

/**
 * Badge tone. Colour is always paired with a text label in the UI - never
 * colour alone - because the accessibility rule in the master document forbids
 * status-by-hue for a system where an overdue approval has real consequences.
 */
export type Tone = 'neutral' | 'info' | 'progress' | 'wait' | 'ok' | 'risk' | 'hold';

export const POSITION_TONE: Record<PositionStatus, Tone> = {
  draft: 'neutral',
  awaiting_vacancy_approval: 'wait',
  approved: 'info',
  sourcing: 'progress',
  candidate_available: 'progress',
  sent_for_candidate_approval: 'wait',
  hold: 'hold',
  approved_for_joining: 'info',
  hired: 'ok',
  position_closed: 'neutral',
  candidature_unsuccessful: 'risk',
};

export const REQUEST_TONE: Record<RequestStatus, Tone> = {
  draft: 'neutral',
  submitted_for_vacancy_approval: 'wait',
  approved: 'ok',
  returned_for_information: 'risk',
  rejected: 'risk',
  closed: 'neutral',
};

export const CANDIDATE_TONE: Record<CandidateStatus, Tone> = {
  draft: 'neutral',
  submitted_for_recruitment_approval: 'wait',
  approved_for_joining: 'info',
  hired: 'ok',
  rejected: 'risk',
  hold: 'hold',
  returned_for_modifications: 'risk',
  candidature_unsuccessful: 'risk',
};

// ---------------------------------------------------------------------------
// workflow actions, in words
// ---------------------------------------------------------------------------
/**
 * The action names the workflow tables may return, and the button a person sees
 * for them. A page never hard-codes which actions exist - that comes from
 * availableActions() against the configured transitions - so an action added by
 * an Admin appears as a working button once it has a label here. An unlabelled
 * action falls back to its own name rather than disappearing.
 */
export const ACTION_LABEL: Record<string, string> = {
  submit_for_vacancy_approval: 'Submit for approval',
  submit_for_recruitment_approval: 'Send for candidate approval',
  // the same decision named from the position's side of the workflow table
  submit_for_candidate_approval: 'Send the candidate for approval',
  approve: 'Approve the vacancy',
  approve_for_joining: 'Approve for joining',
  return_for_information: 'Return for information',
  return_for_modifications: 'Return for modification',
  reject: 'Reject',
  reject_candidature: 'Close without a hire',
  resubmit: 'Resubmit',
  cancel: 'Cancel the request',
  close: 'Close the request',
  close_position: 'Close the position',
  start_sourcing: 'Release to sourcing',
  add_candidate: 'Add a candidate',
  hold: 'Place on hold',
  resume: 'Resume',
  confirm_joining: 'Confirm they joined',
  withdraw_offer: 'Withdraw the offer',
  restart_sourcing: 'Restart sourcing',
};

/** One line under the button: what this decision does to the record. */
export const ACTION_HINT: Record<string, string> = {
  submit_for_vacancy_approval: 'Goes to the Owner and CEO queue with your name on it.',
  submit_for_recruitment_approval: 'Needs a resume and a photograph attached, or a recorded exception.',
  submit_for_candidate_approval: 'The position moves to “sent for candidate approval” with its candidate attached.',
  approve: 'Creates the positions and releases them to HR for sourcing.',
  approve_for_joining: 'The person may join. It is not the same as having joined.',
  return_for_information: 'Sends it back to the requester with your question attached.',
  return_for_modifications: 'The candidate stays with HR, and your reason travels with it.',
  reject: 'Ends the request. The reason stays readable permanently.',
  reject_candidature: 'Ends this position without a hire, on a recorded reason.',
  resubmit: 'Puts it back in front of the approver who returned it.',
  cancel: 'Withdraws it before anyone approves it.',
  close: 'Stops all open positions under this request.',
  close_position: 'Nobody more can be added to this position.',
  start_sourcing: 'Hands it to HR. The ageing clock restarts at sourcing.',
  add_candidate: 'Creates a personal record - the candidate must have been told.',
  hold: 'Stops the clock, and everyone can see why and for how long.',
  resume: 'Restores exactly the stage the position was held at.',
  confirm_joining: 'Closes every other candidate on this position and starts their deletion clock.',
  withdraw_offer: 'Used rarely. It is visible in the audit log forever.',
  restart_sourcing: 'Reopens a position whose candidacy ended unsuccessfully.',
};

export type ActionVariant = 'primary' | 'dark' | 'danger' | 'default';

/** Destructive decisions are the ones that need a reason, so they look like it. */
export const ACTION_VARIANT: Record<string, ActionVariant> = {
  approve: 'primary',
  approve_for_joining: 'primary',
  submit_for_vacancy_approval: 'primary',
  submit_for_recruitment_approval: 'primary',
  submit_for_candidate_approval: 'primary',
  resubmit: 'primary',
  start_sourcing: 'default',
  add_candidate: 'default',
  resume: 'default',
  confirm_joining: 'dark',
  restart_sourcing: 'default',
  hold: 'dark',
  return_for_information: 'default',
  return_for_modifications: 'default',
  reject: 'danger',
  reject_candidature: 'danger',
  withdraw_offer: 'danger',
  cancel: 'danger',
  close: 'danger',
  close_position: 'danger',
};

/**
 * Field labels for the required-field gate. The canonical labels live in
 * workflow_field_definitions; this map only covers the columns a request or
 * position row carries, so a message can name a field in words.
 */
export const FIELD_LABEL: Record<string, string> = {
  title: 'Position title',
  reason: 'Reason for the vacancy',
  facility_id: 'Facility',
  position_type: 'Role / position type',
  quantity: 'Number of positions',
  justification: 'Business justification',
  previous_employee_name: 'Employee being replaced',
  budget_available: 'Budget available',
  ctc_min: 'CTC from',
  ctc_max: 'CTC up to',
  min_qualification: 'Minimum qualification',
  experience_text: 'Experience',
  target_fill_date: 'Target fill date',
  joining_date: 'Expected joining date',
  closure_reason: 'Closure reason',
  full_name: 'Candidate name',
  expected_ctc: 'Expected CTC',
  actual_joining_date: 'Actual joining date',
  rejection_reason: 'Rejection reason',
};

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key.replace(/_/g, ' ');
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, ' ');
}


// ---------------------------------------------------------------------------
// permissions
// ---------------------------------------------------------------------------
/**
 * The permission catalogue. Keys are stable identifiers used by policy.ts and
 * rendered read-only in the Admin panel.
 *
 * Deliberately NOT in the database for v1: these are security invariants that
 * belong in code review and version control, not in a runtime-editable table.
 * What IS runtime-configurable is the workflow (steps, required fields,
 * required documents, who may act on each step).
 */
export const PERMISSIONS = {
  raise_vacancy_request: 'Raise vacancy request',
  edit_own_draft: 'Edit own draft',
  approve_vacancy: 'Approve or reject vacancy request',
  decide_candidate: 'Decide on a candidate',
  review_hold: 'Review positions on hold',
  add_candidate: 'Add candidate and upload documents',
  submit_candidate: 'Submit candidate for approval',
  confirm_joining: 'Confirm actual joining',
  close_position: 'Close a position',
  adjust_position_terms: 'Adjust approved position terms (audited exception)',
  review_budget: 'Review budget and CTC',
  view_candidate_documents: 'Open resume and photograph',
  view_all_facilities: 'See every facility',
  view_own_requests: 'See own requests only',
  activity_timeline: 'See the activity timeline',
  reports_export: 'Generate and export reports',
  manage_legal_documents: 'Author and publish legal documents',
  manage_users_roles: 'Manage users, facilities and roles',
  manage_workflow: 'Configure the workflow',
  view_audit_log: 'View the audit log',
  record_dsr: 'Record and fulfil data-subject requests',
  configure_retention: 'Configure retention',
  view_security_incidents: 'View security incidents',
  disable_auth: 'Disable authentication',
  disable_audit_logging: 'Disable audit logging',
  disable_privacy_controls: 'Disable privacy controls',
  grant_role_to_self: 'Grant a role to own account',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

/** Roles that hold the locked-down prohibitions. No configuration can change this. */
export const LOCKED_FOR_ALL: PermissionKey[] = [
  'disable_auth',
  'disable_audit_logging',
  'disable_privacy_controls',
];

export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  Employee: ['raise_vacancy_request', 'edit_own_draft', 'view_own_requests'],
  HR: [
    'raise_vacancy_request',
    'edit_own_draft',
    'add_candidate',
    'submit_candidate',
    'confirm_joining',
    'close_position',
    'review_hold',
    'view_candidate_documents',
    'activity_timeline',
    'reports_export',
    'view_own_requests',
  ],
  HrHead: [
    'raise_vacancy_request',
    'edit_own_draft',
    'add_candidate',
    'submit_candidate',
    'confirm_joining',
    'close_position',
    'review_hold',
    'adjust_position_terms',
    'view_candidate_documents',
    'activity_timeline',
    'reports_export',
    'view_all_facilities',
    'record_dsr',
  ],
  Owner: [
    'approve_vacancy',
    'decide_candidate',
    'review_hold',
    'close_position',
    'adjust_position_terms',
    'confirm_joining',
    'view_candidate_documents',
    'view_all_facilities',
    'activity_timeline',
    'reports_export',
    'view_security_incidents',
  ],
  CEO: [
    'approve_vacancy',
    'decide_candidate',
    'review_hold',
    'close_position',
    'adjust_position_terms',
    'view_candidate_documents',
    'view_all_facilities',
    'activity_timeline',
    'reports_export',
    // Whoever can decide about a candidate can also see that an account tried to
    // read them without authority. Incident visibility is not a hiring power, so
    // the two approver roles hold it identically.
    'view_security_incidents',
  ],
  Finance: ['review_budget', 'view_all_facilities', 'reports_export', 'activity_timeline'],
  Admin: [
    'manage_users_roles',
    'manage_workflow',
    'manage_legal_documents',
    'view_audit_log',
    'configure_retention',
    'record_dsr',
    'view_security_incidents',
    'view_all_facilities',
    'activity_timeline',
    'reports_export',
    // NOTE: Admin intentionally holds no approval, candidate or vacancy power,
    // and no document read in normal operation. Administration is not hiring.
  ],
};

export function can(role: Role | undefined | null, permission: PermissionKey): boolean {
  if (!role) return false;
  if (LOCKED_FOR_ALL.includes(permission)) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Roles allowed to act on an approval task of a given type. */
export const TASK_ACTOR_ROLES: Record<TaskType, Role[]> = {
  vacancy_approval: ['Owner', 'CEO'],
  candidate_approval: ['Owner', 'CEO'],
  hold_review: ['Owner', 'CEO', 'HR', 'HrHead'],
  joining_confirmation: ['HR', 'HrHead'],
  budget_review: ['Finance'],
  clarification: ['Employee', 'HR', 'HrHead'],
};

// ---------------------------------------------------------------------------
// navigation, per role
// ---------------------------------------------------------------------------
/** How the action queue groups each obligation, and what it obliges the holder to do. */
export const TASK_GROUP: Record<TaskType, { label: string; note: string; tone: Tone }> = {
  vacancy_approval: {
    label: 'Vacancy approval',
    note: 'Approve, reject or return the requirement. Positions do not exist until an approver acts.',
    tone: 'wait',
  },
  candidate_approval: {
    label: 'Candidate decision',
    note: 'Read the resume and the photograph, then decide. A rejection sends the position back to sourcing.',
    tone: 'wait',
  },
  hold_review: {
    label: 'Hold review',
    note: 'A paused position with a stopped clock. Resume it, or let the reason stand.',
    tone: 'hold',
  },
  joining_confirmation: {
    label: 'Joining confirmation',
    note: 'Record the date the person actually joined. Approval is not joining.',
    tone: 'info',
  },
  budget_review: {
    label: 'Budget review',
    note: 'Compensation against the approved band. Finance decides, nobody else.',
    tone: 'neutral',
  },
  clarification: {
    label: 'Clarification needed',
    note: 'Sent back to you for detail. The record cannot move until you answer it.',
    tone: 'risk',
  },
};

export type NavKey =
  | 'dashboard'
  | 'requests'
  | 'my_actions'
  | 'on_hold'
  | 'closed'
  | 'admin';

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
  hint: string;
}

export const NAV_ALL: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard', hint: 'Today’s position of play' },
  { key: 'requests', href: '/requests', label: 'Vacancy requests', hint: 'The register' },
  { key: 'my_actions', href: '/my-actions', label: 'My Actions', hint: 'Waiting on you' },
  { key: 'on_hold', href: '/on-hold', label: 'On Hold', hint: 'Paused, not forgotten' },
  { key: 'closed', href: '/closed', label: 'Closed', hint: 'Outcomes' },
  { key: 'admin', href: '/admin', label: 'Admin Panel', hint: 'Configuration and accountability' },
];

/** Admin is configuration only, so the hiring queues are empty by design. */
export function navFor(role: Role | undefined | null): NavKey[] {
  switch (role) {
    case 'Admin':
      return ['dashboard', 'admin'];
    case 'Employee':
      return ['dashboard', 'requests', 'my_actions', 'closed'];
    case 'Finance':
      return ['dashboard', 'requests', 'my_actions', 'closed'];
    case 'Owner':
    case 'CEO':
      return ['dashboard', 'requests', 'my_actions', 'on_hold', 'closed'];
    case 'HR':
    case 'HrHead':
      return ['dashboard', 'requests', 'my_actions', 'on_hold', 'closed'];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// misc invariants
// ---------------------------------------------------------------------------
export const APP_NAME = 'Yash Honda';
export const APP_SUBTITLE = 'Vacancy & Hiring Tracker';

/** Indian fiscal year: 1 April to 31 March. */
export const FY_START_MONTH = 3; // zero-indexed April

export const DEFAULT_SLA_HOURS = 72;

/** Signed document URLs are minted for this long, then dead. */
export const DOCUMENT_URL_TTL_SECONDS = 60;

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Data categories that must never be entered into this system (DPDP minimisation). */
export const PROHIBITED_DATA = [
  'Aadhaar number',
  'PAN',
  'Bank account details',
  'Date of birth',
  'Caste or religion',
  'Health or medical records',
  'Biometrics',
  'Political opinions',
] as const;

// ---------------------------------------------------------------------------
// consent gate (mirrored in 0009_consent_gate.sql, locked by tests/consent-gate.test.ts)
// ---------------------------------------------------------------------------
/** The published document keys that must be acknowledged before any hiring write. */
export const CONSENT_GATE_KEYS = ['privacy_policy', 'terms_of_use'] as const;

/** The tables whose write is blocked until the gate is passed. */
export const CONSENT_GATED_TABLES = [
  'vacancy_requests',
  'positions',
  'candidates',
  'candidate_documents',
  'comments',
] as const;
