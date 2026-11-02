import { db, call } from './db';
import { getActor, getWorkflow } from './session';
import { evaluateTransition, type WorkflowConfig, type DocState } from './workflow-rules';
import type { PositionStatus, RequestStatus, CandidateStatus } from '@/lib/constants';

/**
 * attemptTransition - the only path in the application that changes a status.
 *
 * Two-stage by design:
 *   1. evaluateTransition() runs the pure rules against the workflow config,
 *      producing precise, human-readable refusals for the UI;
 *   2. the Postgres function performs the same checks again under a row lock
 *      and writes the change, its history rows, the task settlement and the
 *      audit event in one transaction.
 *
 * A page handler never updates a status column directly, so a UI bug cannot
 * invent a state the workflow does not allow.
 */

export type Result<T> =
  | { ok: true; value: T; warning?: string }
  | { ok: false; code: string; message: string };

const fail = (code: string, message: string): Result<never> => ({ ok: false, code, message });

interface BaseArgs {
  reason?: string | null;
  comment?: string | null;
}

type Entity = 'vacancy_request' | 'position' | 'candidate';

/** Loads the configured workflow for an entity, straight from the database. */
async function configFor(entity: Entity): Promise<WorkflowConfig> {
  return getWorkflow(`${entity}_default`);
}

/** The moves a vacancy request can be given. Mirrors the seeded transitions. */
export type RequestAction =
  | 'submit_for_vacancy_approval'
  | 'approve'
  | 'return_for_information'
  | 'reject'
  | 'close'
  | 'resubmit'
  | 'cancel';

export async function attemptRequestTransition(
  requestId: string,
  action: RequestAction,
  args: BaseArgs = {},
): Promise<Result<{ id: string; status: RequestStatus; positions: string[] }>> {
  const actor = await getActor();
  if (!actor) return fail('unauthenticated', 'Your session ended. Sign in again.');
  const workflow = await configFor('vacancy_request');
  const client = await db();

  const { data: request } = await client.from('vacancy_requests').select('*').eq('id', requestId).maybeSingle();
  if (!request) return fail('not_found', 'That vacancy request no longer exists.');

  const decision = evaluateTransition({
    workflow,
    currentStatus: request.status,
    action,
    actorRole: actor.role,
    actorId: actor.id,
    requestedBy: request.submitted_by,
    record: request as Record<string, unknown>,
    documents: [],
    reason: args.reason,
    comment: args.comment,
  });
  if (!decision.ok) return fail(decision.code, decision.message);

  try {
    const value = await call<{ id: string; status: RequestStatus; positions: string[] }>(
      client,
      'transition_request',
      {
        p_request_id: requestId,
        p_action: action,
        p_actor: actor.id,
        p_reason: args.reason ?? null,
        p_comment: args.comment ?? null,
      },
    );
    return { ok: true, value };
  } catch (error) {
    return classify(error);
  }
}

export async function attemptPositionTransition(
  positionId: string,
  action: string,
  args: BaseArgs & { patch?: Record<string, string | number | null> } = {},
): Promise<Result<{ id: string; status: PositionStatus }>> {
  const actor = await getActor();
  if (!actor) return fail('unauthenticated', 'Your session ended. Sign in again.');
  const workflow = await configFor('position');
  const client = await db();

  const { data: position } = await client
    .from('positions')
    .select('*, vacancy_requests(submitted_by, status)')
    .eq('id', positionId)
    .maybeSingle();
  if (!position) return fail('not_found', 'That position no longer exists.');

  const { data: candidates } = await client
    .from('candidates')
    .select('id')
    .eq('position_id', positionId);
  const ids = (candidates ?? []).map((c: { id: string }) => c.id);
  const { data: docs } = ids.length
    ? await client
        .from('candidate_documents')
        .select('document_type, is_exception, exception_reason')
        .in('candidate_id', ids)
    : { data: [] as DocState[] };

  // A position's step requirements are written against the record a person is
  // actually looking at, which is three rows wide: the request that justifies the
  // vacancy, the candidate standing in front of it, and the position itself. The
  // database does not gate fields at this step at all, so evaluating the position
  // row alone would refuse moves the process intends - "justification" lives on
  // the request and "full_name" on the candidate. Position columns win, because
  // the position is the record being changed.
  const [{ data: parentRequest }, { data: recentCandidates }] = await Promise.all([
    client.from('vacancy_requests').select('*').eq('id', position.request_id).maybeSingle(),
    client
      .from('candidates')
      .select('*')
      .eq('position_id', positionId)
      .order('updated_at', { ascending: false })
      .limit(1),
  ]);
  const record: Record<string, unknown> = {
    ...(parentRequest ?? {}),
    ...(recentCandidates?.[0] ?? {}),
    ...(position as Record<string, unknown>),
    // A move that is *about to write* the data a stage asks for must not be
    // refused for lacking it: entering hold carries its own reason and date, and
    // the patch is applied by the same transaction that changes the status.
    ...(args.patch ?? {}),
    hold_reason: position.hold_reason ?? args.reason ?? null,
    hold_start_date: position.hold_start_date ?? args.patch?.hold_start_date ?? new Date().toISOString().slice(0, 10),
  };

  const decision = evaluateTransition({
    workflow,
    currentStatus: position.status,
    action,
    actorRole: actor.role,
    actorId: actor.id,
    requestedBy: (position.vacancy_requests as { submitted_by?: string } | null)?.submitted_by ?? null,
    record,
    documents: (docs ?? []) as DocState[],
    reason: args.reason,
    comment: args.comment,
  });
  if (!decision.ok) return fail(decision.code, decision.message);

  try {
    const value = await call<{ id: string; status: PositionStatus }>(client, 'transition_position', {
      p_position_id: positionId,
      p_action: action,
      p_actor: actor.id,
      p_reason: args.reason ?? null,
      p_comment: args.comment ?? null,
      p_patch: args.patch ?? {},
    });
    return {
      ok: true,
      value,
      warning:
        decision.ok && decision.value.excepted.length > 0
          ? `Proceeding on a recorded exception for: ${decision.value.excepted.join(', ')}.`
          : undefined,
    };
  } catch (error) {
    return classify(error);
  }
}

export async function holdPositions(
  positionIds: string[],
  reason: string,
  startDate: string,
  expectedEnd: string | null,
): Promise<Result<{ held: number; not_holdable: string[] }>> {
  const actor = await getActor();
  if (!actor) return fail('unauthenticated', 'Your session ended. Sign in again.');
  if (positionIds.length === 0) return fail('validation', 'Select at least one position to hold.');
  if (reason.trim().length < 5) {
    return fail('reason_required', 'A hold reason is mandatory and is shown to everyone who opens the position.');
  }
  const client = await db();
  try {
    const value = await call<{ held: number; not_holdable: string[] }>(client, 'hold_positions', {
      p_position_ids: positionIds,
      p_actor: actor.id,
      p_reason: reason,
      p_start_date: startDate,
      p_expected_end: expectedEnd,
    });
    return { ok: true, value };
  } catch (error) {
    return classify(error);
  }
}

export async function resumePosition(
  positionId: string,
  comment?: string,
): Promise<Result<{ id: string; status: PositionStatus }>> {
  const actor = await getActor();
  if (!actor) return fail('unauthenticated', 'Your session ended. Sign in again.');
  const client = await db();
  try {
    const value = await call<{ id: string; status: PositionStatus }>(client, 'resume_position', {
      p_position_id: positionId,
      p_actor: actor.id,
      p_comment: comment ?? null,
    });
    return { ok: true, value };
  } catch (error) {
    return classify(error);
  }
}

export interface DocumentException {
  reason: string;
  authority_basis: string;
  authorized_by: string;
}

/**
 * The gate that defines this product: a candidate cannot be sent for approval
 * without a resume and a photograph, unless an exception is explicitly recorded
 * with a reason and the authority it rests on. The exception is not a bypass -
 * it is a permanent, visible deviation.
 */
export async function submitCandidate(
  candidateId: string,
  exception: DocumentException | null = null,
): Promise<Result<{ id: string; status: CandidateStatus }>> {
  const actor = await getActor();
  if (!actor) return fail('unauthenticated', 'Your session ended. Sign in again.');
  const client = await db();
  const workflow = await configFor('candidate');

  const { data: candidate } = await client.from('candidates').select('*').eq('id', candidateId).maybeSingle();
  if (!candidate) return fail('not_found', 'That candidate no longer exists.');
  const { data: docs } = await client
    .from('candidate_documents')
    .select('document_type, is_exception, exception_reason')
    .eq('candidate_id', candidateId);

  const decision = evaluateTransition({
    workflow,
    currentStatus: candidate.status,
    action: 'submit_for_recruitment_approval',
    actorRole: actor.role,
    actorId: actor.id,
    requestedBy: candidate.created_by,
    record: candidate as Record<string, unknown>,
    documents: (docs ?? []) as DocState[],
  });

  const blockedByDocs = !decision.ok && decision.code === 'missing_documents';
  if (blockedByDocs && !exception) return fail('missing_documents', decision.message);
  if (!decision.ok && !blockedByDocs) return fail(decision.code, decision.message);
  if (exception) {
    if (exception.reason.trim().length < 10) {
      return fail('reason_required', 'An exception needs a real reason - it stays with the record permanently.');
    }
    if (exception.authority_basis.trim().length < 3) {
      return fail('reason_required', 'State whose authority allows this candidate through without the document.');
    }
  }

  try {
    const value = await call<{ id: string; status: CandidateStatus }>(client, 'submit_candidate', {
      p_candidate_id: candidateId,
      p_actor: actor.id,
      p_exception: exception
        ? {
            reason: exception.reason,
            authority_basis: exception.authority_basis,
            authorized_by: exception.authorized_by,
          }
        : null,
    });
    return {
      ok: true,
      value,
      warning: exception
        ? 'Submitted on a recorded document exception. The deviation is visible in the audit log permanently.'
        : undefined,
    };
  } catch (error) {
    return classify(error);
  }
}

export async function decideCandidate(
  candidateId: string,
  action: 'approve_for_joining' | 'reject' | 'return_for_modifications',
  args: BaseArgs = {},
): Promise<Result<{ candidate_id: string; status: CandidateStatus; position_status: PositionStatus }>> {
  const actor = await getActor();
  if (!actor) return fail('unauthenticated', 'Your session ended. Sign in again.');
  const client = await db();

  try {
    const value = await call<{
      candidate_id: string;
      status: CandidateStatus;
      position_status: PositionStatus;
    }>(client, 'decide_candidate', {
      p_candidate_id: candidateId,
      p_actor: actor.id,
      p_action: action,
      p_reason: args.reason ?? null,
      p_comment: args.comment ?? null,
    });
    return { ok: true, value };
  } catch (error) {
    return classify(error);
  }
}

export async function confirmJoining(
  candidateId: string,
  joiningDate: string,
): Promise<Result<{ candidate_id: string; position_id: string; peers_closed: number }>> {
  const actor = await getActor();
  if (!actor) return fail('unauthenticated', 'Your session ended. Sign in again.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) {
    return fail('validation', 'Provide the actual joining date - approval is not joining.');
  }
  const client = await db();
  try {
    const value = await call<{ candidate_id: string; position_id: string; peers_closed: number }>(
      client,
      'confirm_joining',
      { p_candidate_id: candidateId, p_actor: actor.id, p_joining_date: joiningDate },
    );
    return { ok: true, value };
  } catch (error) {
    return classify(error);
  }
}

/** Turns a Postgres raise into the same shape the pure rules produce. */
function classify(error: unknown): Result<never> {
  const raw = error instanceof Error ? error.message : String(error);
  if (/forbidden/i.test(raw)) return { ok: false, code: 'forbidden', message: shorten(raw) };
  if (/invalid transition/i.test(raw)) return { ok: false, code: 'invalid_transition', message: shorten(raw) };
  if (/validation/i.test(raw)) return { ok: false, code: 'validation', message: shorten(raw) };
  if (/missing_documents/i.test(raw)) return { ok: false, code: 'missing_documents', message: shorten(raw) };
  if (/conflict/i.test(raw)) return { ok: false, code: 'conflict', message: shorten(raw) };
  return { ok: false, code: 'error', message: shorten(raw) };
}

function shorten(raw: string): string {
  return raw.replace(/\s*(CONTEXT|DETAIL|HINT):.*$/is, '').trim().slice(0, 400);
}
