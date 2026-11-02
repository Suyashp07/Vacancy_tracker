/**
 * Workflow rules - pure, deterministic, no I/O.
 *
 * `attemptTransition()` in workflow.ts is the only function in the codebase
 * that writes a status, and it is a thin shell around the checks here. Keeping
 * the logic pure means the whole state machine can be proven without a
 * database, and a page handler can never invent its own rule.
 */
import type { CandidateStatus, PositionStatus } from '@/lib/constants';
import { MANDATORY_DOCUMENTS, type DocumentType } from '@/lib/constants';

export type DenialCode =
  | 'invalid_transition'
  | 'role_not_allowed'
  | 'self_approval'
  | 'missing_fields'
  | 'missing_documents'
  | 'reason_required'
  | 'comment_required'
  | 'terminal_state'
  | 'stale_state';

export type Rule<T> = { ok: true; value: T } | { ok: false; code: DenialCode; message: string };

const deny = (code: DenialCode, message: string): Rule<never> => ({ ok: false, code, message });

// ---------------------------------------------------------------------------
// configuration shapes (loaded from the workflow tables)
// ---------------------------------------------------------------------------
export interface TransitionConfig {
  from_status: string;
  action: string;
  to_status: string;
  allowed_roles: string[];
  requires_reason: boolean;
  requires_comment: boolean;
}

export interface StepConfig {
  status_key: string;
  label: string;
  step_type: 'approval' | 'system';
  required_fields: string[];
  required_documents: string[];
  allowed_actions: string[];
  allowed_roles: string[];
  is_terminal: boolean;
  sort_order?: number;
  /** how long a position may sit here before it is called out; null = no clock */
  overdue_sla_days?: number | null;
  max_sla_days?: number | null;
}

export interface WorkflowConfig {
  /** populated by session.ts when the config is loaded from the database */
  key?: string;
  entity?: 'vacancy_request' | 'position' | 'candidate';
  steps: StepConfig[];
  transitions: TransitionConfig[];
}

export interface DocState {
  document_type: string;
  /** an approved DPDP exception satisfies the gate, but is recorded as a deviation */
  is_exception?: boolean;
  exception_reason?: string | null;
}

export interface TransitionRequest {
  workflow: WorkflowConfig;
  currentStatus: string;
  action: string;
  actorRole: string;
  actorId: string;
  /** person who caused the record to be submitted for this decision */
  requestedBy: string | null;
  record: Record<string, unknown>;
  documents: DocState[];
  reason?: string | null;
  comment?: string | null;
}

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------
export function findStep(workflow: WorkflowConfig, statusKey: string): StepConfig | undefined {
  return workflow.steps.find((s) => s.status_key === statusKey);
}

export function findTransition(
  workflow: WorkflowConfig,
  fromStatus: string,
  action: string,
): TransitionConfig | undefined {
  return workflow.transitions.find((t) => t.from_status === fromStatus && t.action === action);
}

/** Actions actually offered to this actor right now, for button rendering. */
export function availableActions(workflow: WorkflowConfig, statusKey: string, role: string): string[] {
  const step = findStep(workflow, statusKey);
  if (!step) return [];
  return workflow.transitions
    .filter(
      (t) =>
        t.from_status === statusKey &&
        (t.allowed_roles.length === 0 || t.allowed_roles.includes(role)) &&
        step.allowed_actions.includes(t.action),
    )
    .map((t) => t.action);
}

// ---------------------------------------------------------------------------
// the gate
// ---------------------------------------------------------------------------
export function missingFields(required: string[], record: Record<string, unknown>): string[] {
  return required.filter((field) => {
    const value = record[field];
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (typeof value === 'number' && !Number.isFinite(value)) return true;
    if (typeof value === 'boolean') return false;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
}

export interface DocumentGate {
  missing: string[];
  /** present only as an audited exception */
  excepted: string[];
}

/**
 * Mandatory documents are compared against the *position configuration*, not a
 * constant: resume and photograph are required for every candidate by default,
 * and an Admin can widen or narrow that per step.
 */
export function documentGate(required: string[], present: DocState[]): DocumentGate {
  const byType = new Map(present.map((d) => [d.document_type, d]));
  const missing: string[] = [];
  const excepted: string[] = [];
  for (const type of required) {
    const doc = byType.get(type);
    if (!doc) missing.push(type);
    else if (doc.is_exception) excepted.push(type);
  }
  return { missing, excepted };
}

/** Convenience for the default policy so callers read clearly at the call site. */
export function canSubmitCandidate(configured: string[] | undefined, docs: DocState[]): Rule<DocumentGate> {
  const required = configured && configured.length > 0 ? configured : [...MANDATORY_DOCUMENTS];
  const gate = documentGate(required as DocumentType[], docs);
  if (gate.missing.length > 0) {
    return deny(
      'missing_documents',
      `Cannot send for approval: ${gate.missing.join(', ')} not attached. ` +
        `Upload it, or record an exception with a reason and the authority it rests on.`,
    );
  }
  return { ok: true, value: gate };
}

/**
 * Full evaluation of one attempted move. Order matters: a person who is not
 * allowed to act at all should not learn which fields are missing.
 */
export function evaluateTransition(req: TransitionRequest): Rule<{ to_status: string; excepted: string[] }> {
  const { workflow, currentStatus, action, actorRole } = req;

  const transition = findTransition(workflow, currentStatus, action);
  const step = findStep(workflow, currentStatus);
  if (!transition) {
    return deny(
      'invalid_transition',
      `“${action}" is not a permitted move from ${step?.label ?? currentStatus}.`,
    );
  }
  if (step?.is_terminal) {
    return deny('terminal_state', `${step.label} is a final state. Open a fresh request instead.`);
  }

  if (transition.allowed_roles.length > 0 && !transition.allowed_roles.includes(actorRole)) {
    return deny(
      'role_not_allowed',
      `${actorRole} cannot perform “${action}". This move belongs to ${transition.allowed_roles.join(' or ')}.`,
    );
  }

  // No one approves their own submission, whatever their role. A CEO who also
  // raised a request must have the other approver act, or it stays pending.
  if (
    req.requestedBy &&
    req.requestedBy === req.actorId &&
    (transition.to_status !== currentStatus) &&
    ['approve', 'approve_for_joining', 'confirm_joining'].includes(action)
  ) {
    return deny(
      'self_approval',
      'You raised this, so you cannot approve it. The decision needs a different person.',
    );
  }

  const target = findStep(workflow, transition.to_status);
  // Requirements are enforced against the state being ENTERED, and against the
  // current state when the action is a submission.
  const gateFields = [
    ...missingFields(step?.required_fields ?? [], req.record),
    ...missingFields(target?.required_fields ?? [], req.record),
  ];
  if (gateFields.length > 0) {
    return deny(
      'missing_fields',
      `Required before this step: ${gateFields.join(', ')}.`,
    );
  }

  const requiredDocs = Array.from(
    new Set([...(step?.required_documents ?? []), ...(target?.required_documents ?? [])]),
  );
  const gate = documentGate(requiredDocs, req.documents);
  if (gate.missing.length > 0) {
    return deny(
      'missing_documents',
      `Required documents not attached: ${gate.missing.join(', ')}.`,
    );
  }

  if (transition.requires_reason && !nonEmpty(req.reason)) {
    return deny('reason_required', 'A reason is mandatory for this decision and becomes part of the audit record.');
  }
  if (transition.requires_comment && !nonEmpty(req.comment)) {
    return deny('comment_required', 'A comment is mandatory for this decision.');
  }

  return { ok: true, value: { to_status: transition.to_status, excepted: gate.excepted } };
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length >= 3;
}

// ---------------------------------------------------------------------------
// hold is an overlay, never a stage
// ---------------------------------------------------------------------------
/** Stages that may be paused. Draft and final states cannot go on hold. */
export const HOLDABLE_POSITION_STATUSES: PositionStatus[] = [
  'awaiting_vacancy_approval',
  'approved',
  'sourcing',
  'candidate_available',
  'sent_for_candidate_approval',
  'approved_for_joining',
];

export function enterHold(previous: PositionStatus): Rule<{ status: 'hold'; previous_status_before_hold: PositionStatus }> {
  if (previous === 'hold') return deny('stale_state', 'This position is already on hold.');
  if (previous === 'draft' || previous === 'hired' || previous === 'position_closed') {
    return deny('invalid_transition', `A ${previous} position cannot be put on hold.`);
  }
  return { ok: true, value: { status: 'hold', previous_status_before_hold: previous } };
}

export function exitHold(previous: PositionStatus | null): Rule<PositionStatus> {
  if (!previous || previous === 'hold') {
    return deny('stale_state', 'No prior stage was recorded for this hold; set the stage explicitly.');
  }
  return { ok: true, value: previous };
}

// ---------------------------------------------------------------------------
// candidate decision -> position consequence
// ---------------------------------------------------------------------------
/**
 * The rule that keeps a position and its candidates from drifting apart: a
 * rejected candidate returns the position to sourcing, because the vacancy
 * still exists even though this person does not.
 */
export function positionStatusAfterCandidateDecision(
  decision: Extract<CandidateStatus, 'hired' | 'rejected' | 'candidature_unsuccessful' | 'returned_for_modifications' | 'approved_for_joining'>,
  candidateCount: number,
): PositionStatus | null {
  switch (decision) {
    case 'hired':
      return 'hired';
    case 'approved_for_joining':
      return 'approved_for_joining';
    case 'rejected':
    case 'candidature_unsuccessful':
      // more people still in the frame keeps sourcing alive
      return candidateCount > 1 ? 'sourcing' : 'candidature_unsuccessful';
    case 'returned_for_modifications':
      return 'candidate_available';
    default:
      return null;
  }
}

/** A position may only close when nothing is still running against it. */
export function positionClosable(statuses: (PositionStatus | undefined)[]): Rule<true> {
  const live = statuses.filter(
    (s) => s && !['hired', 'position_closed', 'candidature_unsuccessful', 'draft'].includes(s),
  );
  if (live.length > 0) {
    return deny('invalid_transition', `Close blocked: ${live.length} position(s) are still active (${live.join(', ')}).`);
  }
  return { ok: true, value: true };
}

// ---------------------------------------------------------------------------
// ageing and SLA
// ---------------------------------------------------------------------------
export interface AgeingInput {
  createdAt: Date | string;
  stageStartedAt: Date | string;
  holdStartedAt?: Date | string | null;
  isOnHold?: boolean;
  now?: Date;
}

const DAY = 86_400_000;
const asDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));

/**
 * Four clocks. A position paused for six months must not read as six months
 * overdue, and a position on hold must show how long it has been paused.
 */
export function ageingOf(input: AgeingInput): { total: number; stage: number; active: number; hold: number } {
  const now = input.now ?? new Date();
  const created = asDate(input.createdAt);
  const stageStart = asDate(input.stageStartedAt);
  const total = Math.max(0, Math.floor((now.getTime() - created.getTime()) / DAY));
  const stage = Math.max(0, Math.floor((now.getTime() - stageStart.getTime()) / DAY));
  const hold =
    input.isOnHold && input.holdStartedAt
      ? Math.max(0, Math.floor((now.getTime() - asDate(input.holdStartedAt).getTime()) / DAY))
      : 0;
  return { total, stage, active: Math.max(0, total - hold), hold };
}

export type SlaState = 'within' | 'warning' | 'overdue';

export function slaStateOf(createdAt: Date | string, slaHours: number, now: Date = new Date()): SlaState {
  const ms = now.getTime() - asDate(createdAt).getTime();
  const hours = ms / 3_600_000;
  if (hours >= slaHours * 2) return 'overdue';
  if (hours >= slaHours) return 'warning';
  return 'within';
}

/** Positions counted in a report are positions, never candidates. */
export function isOpenPosition(status: PositionStatus): boolean {
  return !['hired', 'position_closed', 'draft'].includes(status);
}
