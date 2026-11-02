/**
 * The state machine, evaluated against the configuration it will actually run.
 *
 * Nothing here talks to Postgres. evaluateTransition() is pure and workflow.ts is
 * a thin shell around it, so the whole machine can be proven by feeding it the
 * seeded steps and transitions with hand-written records - including the cases
 * that must be refused, which are the ones a user would otherwise discover.
 */
import { describe, expect, it } from 'vitest';
import {
  availableActions,
  canSubmitCandidate,
  documentGate,
  enterHold,
  evaluateTransition,
  exitHold,
  findStep,
  missingFields,
  positionClosable,
  positionStatusAfterCandidateDecision,
  slaStateOf,
  ageingOf,
  type DocState,
  type StepConfig,
  type TransitionConfig,
  type WorkflowConfig,
} from '@/server/workflow-rules';
import { seededConfig } from './seed';

const config = seededConfig();

function workflow(key: string, entity: WorkflowConfig['entity']): WorkflowConfig {
  return {
    key,
    entity,
    steps: (config.get(`${key}:workflow_steps`)?.rows ?? []) as unknown as StepConfig[],
    transitions: (config.get(`${key}:workflow_transitions`)?.rows ?? []) as unknown as TransitionConfig[],
  };
}

const position = workflow('position_default', 'position');
const request = workflow('vacancy_request_default', 'vacancy_request');
const candidate = workflow('candidate_default', 'candidate');

/** A position whose parent request carries everything the approval step asks for. */
function approvablePosition(overrides: Record<string, unknown> = {}) {
  return {
    justification: 'The line lost two operators to a transfer.',
    quantity: 2,
    ctc_max: 640000,
    target_fill_date: '2026-12-31',
    ...overrides,
  };
}

const noDocs: DocState[] = [];
const fullDocs: DocState[] = [
  { document_type: 'Resume' },
  { document_type: 'Photograph' },
];

describe('availableActions', () => {
  it('offers the approver the three decisions and nobody else anything', () => {
    expect(availableActions(position, 'awaiting_vacancy_approval', 'Owner').sort()).toEqual([
      'approve',
      'reject',
      'return_for_information',
    ]);
    expect(availableActions(position, 'awaiting_vacancy_approval', 'HR')).toEqual([]);
    expect(availableActions(position, 'awaiting_vacancy_approval', 'Admin')).toEqual([]);
  });

  it('offers nothing on a finished record', () => {
    expect(availableActions(position, 'hired', 'HR')).toEqual([]);
    expect(availableActions(request, 'closed', 'Owner')).toEqual([]);
    expect(availableActions(candidate, 'rejected', 'CEO')).toEqual([]);
  });

  it('returns nothing for a status the configuration does not know', () => {
    expect(availableActions(position, 'not_a_stage', 'HR')).toEqual([]);
  });
});

describe('evaluateTransition on a position awaiting vacancy approval', () => {
  const base = {
    workflow: position,
    currentStatus: 'awaiting_vacancy_approval',
    action: 'approve',
    actorRole: 'CEO',
    actorId: 'ceo-1',
    requestedBy: 'hr-1',
    documents: noDocs,
  };

  it('allows the approval when the request behind it is complete', () => {
    const decision = evaluateTransition({ ...base, record: approvablePosition() });
    expect(decision).toEqual({ ok: true, value: { to_status: 'approved', excepted: [] } });
  });

  it('refuses a role the move does not belong to, and names the roles it does', () => {
    const decision = evaluateTransition({ ...base, record: approvablePosition(), actorRole: 'HR' });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe('role_not_allowed');
      expect(decision.message).toContain('Owner or CEO');
    }
  });

  it('refuses when a required field is missing, listing exactly what is short', () => {
    const decision = evaluateTransition({
      ...base,
      record: approvablePosition({ justification: '   ', quantity: null }),
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe('missing_fields');
      expect(decision.message).toContain('justification');
      expect(decision.message).toContain('quantity');
      expect(decision.message).not.toContain('ctc_max');
    }
  });

  it('refuses a move that is not configured from this stage at all', () => {
    const decision = evaluateTransition({ ...base, record: approvablePosition(), action: 'confirm_joining' });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe('invalid_transition');
  });

  it('will not let the person who raised it approve it, whatever their role', () => {
    const decision = evaluateTransition({
      ...base,
      record: approvablePosition(),
      actorRole: 'Owner',
      actorId: 'owner-9',
      requestedBy: 'owner-9',
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe('self_approval');
  });

  it('demands a reason where the configuration says the decision must be explained', () => {
    const withoutReason = evaluateTransition({ ...base, record: approvablePosition(), action: 'reject', reason: '  ' });
    expect(withoutReason.ok).toBe(false);
    if (!withoutReason.ok) expect(withoutReason.code).toBe('reason_required');

    const withReason = evaluateTransition({
      ...base,
      record: approvablePosition(),
      action: 'reject',
      reason: 'Budget withdrawn at the management review.',
      comment: 'Re-open next quarter if the line staffing changes.',
    });
    expect(withReason.ok).toBe(true);
  });
});

describe('evaluateTransition on the document gate', () => {
  const sending = {
    workflow: candidate,
    currentStatus: 'draft',
    action: 'submit_for_recruitment_approval',
    actorRole: 'HR',
    actorId: 'hr-1',
    requestedBy: null,
    record: { full_name: 'A. Kulkarni', expected_ctc: 540000 },
  };

  it('refuses to send a candidate for approval without a resume and a photograph', () => {
    const decision = evaluateTransition({ ...sending, documents: [{ document_type: 'Resume' }] });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe('missing_documents');
      expect(decision.message).toContain('Photograph');
    }
  });

  it('accepts a recorded exception but reports it as a deviation', () => {
    const decision = evaluateTransition({
      ...sending,
      documents: [
        { document_type: 'Resume' },
        { document_type: 'Photograph', is_exception: true, exception_reason: 'Internal transfer, photo on personnel file' },
      ],
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.value.excepted).toEqual(['Photograph']);
  });

  it('keeps the DPDP gate on the position side of the same move', () => {
    const decision = evaluateTransition({
      workflow: position,
      currentStatus: 'candidate_available',
      action: 'submit_for_candidate_approval',
      actorRole: 'HR',
      actorId: 'hr-1',
      requestedBy: null,
      record: { full_name: 'A. Kulkarni', experience_text: '7 years', expected_ctc: 520000 },
      documents: [{ document_type: 'Resume' }],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.message).toContain('Photograph');
  });
});

describe('a terminal stage cannot be left', () => {
  it('refuses every move out of hired, even though the record still exists', () => {
    // The configuration gives a final stage no transitions, so this is refused as
    // an invalid move rather than as a permission problem - which is the point.
    const decision = evaluateTransition({
      workflow: position,
      currentStatus: 'hired',
      action: 'hold',
      actorRole: 'Owner',
      actorId: 'owner-1',
      requestedBy: null,
      record: { hold_reason: 'x', hold_start_date: '2026-10-01' },
      documents: noDocs,
      reason: 'Trying to pause a person who already joined.',
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(['invalid_transition', 'terminal_state']).toContain(decision.code);
  });
});

describe('hold is an overlay', () => {
  it('enters from a real stage and remembers it', () => {
    expect(enterHold('sourcing')).toEqual({ ok: true, value: { status: 'hold', previous_status_before_hold: 'sourcing' } });
  });

  it('refuses to pause a draft, a hire or a closed position', () => {
    for (const status of ['draft', 'hired', 'position_closed'] as const) {
      const result = enterHold(status);
      expect(result.ok, `${status} should not be holdable`).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid_transition');
    }
  });

  it('refuses to pause something already paused, and refuses to resume without a recorded stage', () => {
    expect(enterHold('hold')).toMatchObject({ ok: false, code: 'stale_state' });
    expect(exitHold(null)).toMatchObject({ ok: false, code: 'stale_state' });
    expect(exitHold('hold')).toMatchObject({ ok: false, code: 'stale_state' });
    expect(exitHold('approved')).toEqual({ ok: true, value: 'approved' });
  });
});

describe('a candidate decision decides the position too', () => {
  it('keeps sourcing alive while other candidates are still in the frame', () => {
    expect(positionStatusAfterCandidateDecision('rejected', 3)).toBe('sourcing');
    expect(positionStatusAfterCandidateDecision('candidature_unsuccessful', 1)).toBe('candidature_unsuccessful');
    expect(positionStatusAfterCandidateDecision('hired', 4)).toBe('hired');
    expect(positionStatusAfterCandidateDecision('returned_for_modifications', 2)).toBe('candidate_available');
    expect(positionStatusAfterCandidateDecision('approved_for_joining', 1)).toBe('approved_for_joining');
  });

  it('will not close a request while a position is still live', () => {
    const blocked = positionClosable(['sourcing', 'hold', 'hired']);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.message).toContain('2 position(s)');
      expect(blocked.message).toContain('sourcing');
    }
    expect(positionClosable(['hired', 'position_closed', 'draft'])).toEqual({ ok: true, value: true });
    expect(positionClosable([])).toEqual({ ok: true, value: true });
  });
});

describe('clocks', () => {
  const now = new Date('2026-10-16T12:00:00Z');

  it('counts a pause as paused, not as overdue', () => {
    const createdAt = new Date('2026-04-01T12:00:00Z');
    const heldSince = new Date('2026-08-01T12:00:00Z');
    const ageing = ageingOf({ createdAt, stageStartedAt: heldSince, holdStartedAt: heldSince, isOnHold: true, now });
    expect(ageing.total).toBe(198);
    expect(ageing.hold).toBe(76);
    expect(ageing.active).toBe(198 - 76);
    expect(ageing.stage).toBe(76);
  });

  it('never reports a negative age for a timestamp in the future', () => {
    const ageing = ageingOf({ createdAt: now, stageStartedAt: now, now: new Date('2026-01-01T00:00:00Z') });
    expect(ageing).toEqual({ total: 0, stage: 0, active: 0, hold: 0 });
  });

  it('warns at the SLA and calls it overdue at twice the SLA', () => {
    const created = new Date('2026-10-13T12:00:00Z');
    expect(slaStateOf(created, 72, now)).toBe('warning');
    expect(slaStateOf(created, 36, now)).toBe('overdue');
    expect(slaStateOf(created, 144, now)).toBe('within');
  });
});

describe('the gate primitives', () => {
  it('treats an empty string, a null and an empty list as unfilled, but not false or zero', () => {
    expect(
      missingFields(['title', 'reason', 'quantity', 'budget_available', 'tags', 'ctc_min'], {
        title: '   ',
        reason: null,
        quantity: 0,
        budget_available: false,
        tags: [],
        ctc_min: Number.NaN,
      }),
    ).toEqual(['title', 'reason', 'tags', 'ctc_min']);
  });

  it('separates a missing document from one present on an exception', () => {
    expect(
      documentGate(['Resume', 'Photograph', 'Offer acknowledgement'], [
        { document_type: 'Resume' },
        { document_type: 'Photograph', is_exception: true },
      ]),
    ).toEqual({ missing: ['Offer acknowledgement'], excepted: ['Photograph'] });
  });

  it('falls back to the mandatory pair when a step configures nothing', () => {
    expect(canSubmitCandidate([], [{ document_type: 'Resume' }])).toMatchObject({ ok: false, code: 'missing_documents' });
    expect(canSubmitCandidate(['Education certificate'], [{ document_type: 'Education certificate' }])).toMatchObject({
      ok: true,
    });
  });

  it('reads a step definition so a screen can say what is still needed', () => {
    expect(findStep(request, 'submitted_for_vacancy_approval')?.required_fields).toEqual(['justification', 'quantity']);
    expect(findStep(request, 'no_such_stage')).toBeUndefined();
  });
});
