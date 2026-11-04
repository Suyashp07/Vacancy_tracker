'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, adminDb, call } from './db';
import { getActor, requireActor, pendingAcknowledgement } from './session';
import { invalidateServerCache } from './policy';
import {
  attemptRequestTransition,
  attemptPositionTransition,
  decideCandidate,
  holdPositions,
  resumePosition,
  submitCandidate,
  confirmJoining,
  type RequestAction,
  type Result,
} from './workflow';
import { uploadCandidateDocument, openCandidateDocument } from './files';
import { ROLE_LABEL, VACANCY_REASONS, type DocumentType, type Role } from '@/lib/constants';

/**
 * Every mutation the UI can trigger. No action writes a status column itself -
 * they validate the form, then delegate to the workflow facade, which delegates
 * to the Postgres functions. Redirects and revalidations happen here so a stale
 * queue can never be acted on twice.
 */

export type ActionState = { ok: boolean; message: string; warning?: string; href?: string };

const fail = (message: string): ActionState => ({ ok: false, message });
const done = (message: string, href?: string, warning?: string): ActionState => ({ ok: true, message, href, warning });

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'The form has an error.';
}

function settle<T>(result: Result<T>, message = 'Done.'): ActionState {
  if (result.ok) return done(message, undefined, result.warning);
  return fail(result.message);
}

/** Postgres status values are snake_case; the UI never shows them raw. */
const human = (status: string): string => status.replace(/_/g, ' ');

// ---------------------------------------------------------------------------
// vacancy request
// ---------------------------------------------------------------------------
const requestSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the position a title.'),
    reason: z.enum(VACANCY_REASONS, { errorMap: () => ({ message: 'Choose a reason for the vacancy.' }) }),
    facility_id: z.string().min(1, 'Choose a facility.'),
    position_type: z.string().trim().min(2, 'Name the role.'),
    quantity: z.coerce.number().int().min(1, 'At least one position.').max(50, 'Split a request above 50 positions.'),
    justification: z.string().trim().min(20, 'Explain the business need - 20 characters at least.'),
    min_qualification: z.string().trim().optional(),
    experience_text: z.string().trim().optional(),
    previous_employee_name: z.string().trim().optional(),
    backfill_ref_note: z.string().trim().optional(),
    budget_available: z.coerce.boolean().optional(),
    ctc_min: z.coerce.number().nonnegative().optional(),
    ctc_max: z.coerce.number().nonnegative().optional(),
    target_fill_date: z.string().optional(),
    is_urgent: z.coerce.boolean().optional(),
    acknowledgement_accepted: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the vacancy request acknowledgement.' }),
    }),
    acknowledgement_version: z.string().default('1.0-draft'),
  })
  .refine((v) => v.ctc_min === undefined || v.ctc_max === undefined || v.ctc_max >= v.ctc_min, {
    message: 'The CTC ceiling is below the floor.',
    path: ['ctc_max'],
  });

export async function createVacancyRequest(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await getActor();
  if (!actor) return fail('Your session ended. Sign in again.');

  const parsed = requestSchema.safeParse({
    title: form.get('title'),
    reason: form.get('reason'),
    facility_id: form.get('facility_id'),
    position_type: form.get('position_type'),
    quantity: form.get('quantity') ?? 1,
    justification: form.get('justification'),
    min_qualification: form.get('min_qualification') || undefined,
    experience_text: form.get('experience_text') || undefined,
    previous_employee_name: form.get('previous_employee_name') || undefined,
    backfill_ref_note: form.get('backfill_ref_note') || undefined,
    budget_available: form.get('budget_available') === 'on' ? true : form.get('budget_available') === 'off' ? false : undefined,
    ctc_min: form.get('ctc_min') || undefined,
    ctc_max: form.get('ctc_max') || undefined,
    target_fill_date: form.get('target_fill_date') || undefined,
    is_urgent: form.get('is_urgent') === 'on',
    acknowledgement_accepted: form.get('acknowledgement_accepted') === 'on',
    acknowledgement_version: (form.get('acknowledgement_version') as string) || '1.0-draft',
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  // one request creates N positions; the count of people is never implied here
  const client = await db();
  try {
    const created = await call<{ id: string; number: string; positions: string[] }>(client, 'create_vacancy_request', {
      p: {
        actor: actor.id,
        submit: true,
        ...clean({
          title: parsed.data.title,
          reason: parsed.data.reason,
          facility_id: parsed.data.facility_id,
          position_type: parsed.data.position_type,
          quantity: parsed.data.quantity,
          justification: parsed.data.justification,
          min_qualification: parsed.data.min_qualification,
          experience_text: parsed.data.experience_text,
          previous_employee_name: parsed.data.previous_employee_name,
          backfill_ref_note: parsed.data.backfill_ref_note,
          has_backfill_ref: Boolean(parsed.data.backfill_ref_note),
          budget_available: parsed.data.budget_available,
          ctc_min: parsed.data.ctc_min,
          ctc_max: parsed.data.ctc_max,
          target_fill_date: parsed.data.target_fill_date || undefined,
          is_urgent: parsed.data.is_urgent,
          acknowledgement_accepted: parsed.data.acknowledgement_accepted,
          acknowledgement_version: parsed.data.acknowledgement_version,
        }),
      },
    });
    invalidateServerCache();
    revalidatePath('/dashboard');
    revalidatePath('/requests');
    return done(`${created.number} submitted for vacancy approval.`, `/requests/${created.id}`);
  } catch (error) {
    return fail(messageOf(error));
  }
}

// ---------------------------------------------------------------------------
// approvals and decisions
// ---------------------------------------------------------------------------
export async function actOnRequest(
  requestId: string,
  action: RequestAction,
  formData: FormData,
): Promise<ActionState> {
  await requireActor();
  const result = await attemptRequestTransition(requestId, action, {
    reason: (formText(formData, 'reason') ?? '') || null,
    comment: (formText(formData, 'comment') ?? '') || null,
  });
  if (result.ok) {
    invalidateServerCache();
    revalidatePath('/dashboard');
    revalidatePath('/requests');
    revalidatePath('/my-actions');
    revalidatePath(`/requests/${requestId}`);
  }
  return settle(result, result.ok ? `The request is now ${human(result.value.status)}.` : '');
}

export async function actOnPosition(
  positionId: string,
  requestId: string,
  action: string,
  formData: FormData,
): Promise<ActionState> {
  await requireActor();
  const patch: Record<string, string> = {};
  for (const key of ['target_fill_date', 'ctc_max', 'ctc_min', 'hold_start_date', 'hold_end_date_expected']) {
    const value = formText(formData, key);
    if (value) patch[key] = value;
  }
  const result = await attemptPositionTransition(positionId, action, {
    reason: formText(formData, 'reason'),
    comment: formText(formData, 'comment'),
    patch,
  });
  if (result.ok) revalidateAfterPosition(requestId);
  return settle(result, result.ok ? `The position is now ${human(result.value.status)}.` : '');
}

export async function holdRequestPositions(
  requestId: string,
  positionIds: string[],
  formData: FormData,
): Promise<ActionState> {
  await requireActor();
  const result = await holdPositions(
    positionIds,
    formText(formData, 'reason') ?? '',
    formText(formData, 'hold_start_date') ?? new Date().toISOString().slice(0, 10),
    formText(formData, 'hold_end_date_expected') ?? null,
  );
  if (result.ok) {
    invalidateServerCache();
    revalidatePath('/dashboard');
    revalidatePath(`/requests/${requestId}`);
    revalidatePath('/on-hold');
    return done(`${result.value.held} position(s) placed on hold. The reason is visible to everyone.`);
  }
  return settle(result);
}

export async function resume(positionId: string, requestId: string, formData: FormData): Promise<ActionState> {
  await requireActor();
  const result = await resumePosition(positionId, formText(formData, 'comment') ?? undefined);
  if (result.ok) {
    invalidateServerCache();
    revalidatePath('/dashboard');
    revalidatePath(`/requests/${requestId}`);
    revalidatePath('/on-hold');
    revalidatePath('/my-actions');
    return done(`Resumed at ${result.value.status.replace(/_/g, ' ')}. The stage before the hold was restored exactly.`);
  }
  return settle(result);
}

export async function decide(
  candidateId: string,
  requestId: string,
  action: 'approve_for_joining' | 'reject' | 'return_for_modifications',
  formData: FormData,
): Promise<ActionState> {
  await requireActor();
  const result = await decideCandidate(candidateId, action, {
    reason: formText(formData, 'reason'),
    comment: formText(formData, 'comment'),
  });
  if (result.ok) {
    invalidateServerCache();
    revalidatePath('/dashboard');
    revalidatePath('/my-actions');
    revalidatePath(`/requests/${requestId}`);
    const verb =
      action === 'approve_for_joining'
        ? 'Approved for joining.'
        : action === 'reject'
          ? 'Rejected. The reason is recorded permanently.'
          : 'Returned to HR for modification.';
    return done(`${verb} The position is now ${result.value.position_status.replace(/_/g, ' ')}.`);
  }
  return settle(result);
}

export async function confirmJoin(candidateId: string, requestId: string, formData: FormData): Promise<ActionState> {
  await requireActor();
  const date = formText(formData, 'actual_joining_date');
  if (!date) return fail('Enter the date the person actually joined.');
  const result = await confirmJoining(candidateId, date);
  if (result.ok) {
    invalidateServerCache();
    revalidatePath('/dashboard');
    revalidatePath('/requests');
    revalidatePath('/my-actions');
    revalidatePath(`/requests/${requestId}`);
    return done('Marked as hired. Other candidates on this position were closed out and put on the deletion clock.');
  }
  return settle(result);
}

// ---------------------------------------------------------------------------
// candidates and documents
// ---------------------------------------------------------------------------
const candidateSchema = z.object({
  position_id: z.string().min(1),
  full_name: z.string().trim().min(2, 'Enter the candidate name.'),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  current_location: z.string().trim().optional(),
  expected_ctc: z.coerce.number().nonnegative().optional(),
  experience_text: z.string().trim().optional(),
  qualifications: z.string().trim().optional(),
  notice_period_days: z.coerce.number().int().nonnegative().optional(),
  source: z.string().trim().optional(),
  notice_acknowledged: z.literal(true, {
    errorMap: () => ({ message: 'Confirm the candidate has been told their data is being collected.' }),
  }),
});

export async function addCandidate(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await getActor();
  if (!actor) return fail('Your session ended. Sign in again.');

  const parsed = candidateSchema.safeParse({
    position_id: form.get('position_id'),
    full_name: form.get('full_name'),
    email: form.get('email') || undefined,
    phone: form.get('phone') || undefined,
    current_location: form.get('current_location') || undefined,
    expected_ctc: form.get('expected_ctc') || undefined,
    experience_text: form.get('experience_text') || undefined,
    qualifications: form.get('qualifications') || undefined,
    notice_period_days: form.get('notice_period_days') || undefined,
    source: form.get('source') || undefined,
    notice_acknowledged: form.get('notice_acknowledged') === 'on',
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const client = await db();
  try {
    const created = await call<{ id: string }>(client, 'add_candidate', {
      p: {
        actor: actor.id,
        ...clean(parsed.data),
        notice_acknowledged: true,
      },
    });
    revalidatePath(`/requests/${form.get('request_id') ?? ''}`);
    revalidatePath('/dashboard');
    return done('Candidate added. Attach the resume and photograph before sending for approval.', `/requests/${form.get('request_id')}`);
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function uploadDocument(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireActor();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Choose a file to upload.');
  const result = await uploadCandidateDocument({
    candidateId: String(form.get('candidate_id')),
    facilityId: String(form.get('facility_id')),
    documentType: String(form.get('document_type')) as DocumentType,
    file,
  });
  if (!result.ok) return fail(result.message);
  revalidatePath(`/requests/${form.get('request_id')}`);
  return done(`${form.get('document_type')} attached.`);
}

export async function sendCandidateForApproval(
  candidateId: string,
  requestId: string,
  formData: FormData,
): Promise<ActionState> {
  await requireActor();
  const exceptionReason = formText(formData, 'exception_reason');
  const exception = exceptionReason
    ? {
        reason: exceptionReason,
        authority_basis: formText(formData, 'authority_basis') ?? '',
        authorized_by: formText(formData, 'authorized_by') ?? '',
      }
    : null;
  const result = await submitCandidate(candidateId, exception);
  if (result.ok) {
    revalidatePath('/dashboard');
    revalidatePath('/my-actions');
    revalidatePath(`/requests/${requestId}`);
    return done('Sent for candidate approval. The Owner or CEO now has a decision.', undefined, result.warning);
  }
  return settle(result);
}

export async function openDocument(
  documentId: string,
  action: 'view' | 'download' = 'view',
): Promise<{ ok: boolean; url?: string; message?: string; expiresIn?: number }> {
  await requireActor();
  const result = await openCandidateDocument(documentId, action);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, url: result.url, expiresIn: result.expiresIn };
}

// ---------------------------------------------------------------------------
// collaboration
// ---------------------------------------------------------------------------
export async function addComment(entityType: 'vacancy_request' | 'position' | 'candidate', entityId: string, requestId: string, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const body = formText(formData, 'body') ?? '';
  if (body.trim().length < 1) return fail('Write something first.');
  const client = await db();
  try {
    await call(client, 'add_comment', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_actor: actor.id,
      p_body: body,
    });
    revalidatePath(`/requests/${requestId}`);
    return done('Comment added.');
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function markNotificationsRead(ids: string[]): Promise<ActionState> {
  const actor = await requireActor();
  if (ids.length === 0) return done('Nothing to mark.');
  const client = await db();
  await call(client, 'mark_notifications_read', { p_ids: ids, p_actor: actor.id });
  revalidatePath('/dashboard');
  return done('Marked as read.');
}

// ---------------------------------------------------------------------------
// legal acknowledgement gate
// ---------------------------------------------------------------------------
export async function acknowledgeLegal(documentId: string): Promise<ActionState> {
  const actor = await requireActor();
  const client = await db();
  try {
    await call(client, 'acknowledge_legal_document', {
      p_document_id: documentId,
      p_actor: actor.id,
    });
    revalidatePath('/dashboard');
    revalidatePath('/legal/acknowledge');
    return done('Recorded. The version and time are kept as consent evidence.');
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function pendingAck() {
  const actor = await getActor();
  if (!actor) return null;
  return pendingAcknowledgement(actor);
}

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------
export async function publishLegalDocument(documentId: string): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.role !== 'Admin') return fail('Only an Admin can publish a policy document.');
  const client = await db();
  try {
    await call(client, 'publish_legal_document', {
      p_document_id: documentId,
      p_actor: actor.id,
      p_effective_from: new Date().toISOString().slice(0, 10),
    });
    revalidatePath('/admin');
    // A new published version changes what every other user is shown and asked
    // to accept, so their screens are invalidated too, not just this one.
    revalidatePath('/legal');
    revalidatePath('/legal/acknowledge');
    return done('Published. Older versions are superseded and users will be asked to acknowledge this one.');
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function saveLegalDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.role !== 'Admin') return fail('Only an Admin can author legal documents.');
  const client = await db();
  try {
    await call(client, 'save_legal_document', {
      p: {
        key: formText(formData, 'key'),
        title: formText(formData, 'title'),
        version: formText(formData, 'version'),
        body_md: formText(formData, 'body_md'),
      },
      p_actor: actor.id,
    });
    revalidatePath('/admin');
    revalidatePath('/legal');
    return done('Draft saved. It is not visible to users until published.');
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function setUserRole(userId: string, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.role !== 'Admin') return fail('Only an Admin can change roles.');
  const role = formText(form, 'role');
  if (!role) return fail('Choose the role to grant.');
  const client = await db();
  try {
    await call(client, 'admin_set_user_role', { p_user_id: userId, p_actor: actor.id, p_role: role });
    invalidateServerCache();
    revalidatePath('/admin');
    return done(`Role set to ${ROLE_LABEL[role as Role] ?? role}. The change is in the audit log.`);
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.role !== 'Admin') return fail('Only an Admin can enable or disable accounts.');
  const client = await db();
  try {
    await call(client, 'admin_set_user_active', { p_user_id: userId, p_actor: actor.id, p_active: active });
    invalidateServerCache();
    revalidatePath('/admin');
    return done(active ? 'Account enabled.' : 'Account disabled. Their history stays in the audit log.');
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function createUser(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.role !== 'Admin') return fail('Only an Admin can create accounts.');
  const email = formText(form, 'email') ?? '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Enter a valid work email.');
  const client = await db();
  try {
    const created = await call<{ id: string; email: string }>(client, 'admin_create_user', {
      p: {
        email,
        full_name: formText(form, 'full_name'),
        role: formText(form, 'role'),
        primary_facility_id: formText(form, 'primary_facility_id'),
        department: formText(form, 'department'),
        designation: formText(form, 'designation'),
      },
      p_actor: actor.id,
    });

    invalidateServerCache();

    let inviteMsg = '';
    try {
      const admin = adminDb();
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: created.email,
      });
      if (linkData?.properties?.action_link) {
        inviteMsg = ` Setup link: ${linkData.properties.action_link}`;
      }
    } catch {
      // non-fatal fallback
    }

    revalidatePath('/admin');
    return done(
      `Account created for ${created.email}.${inviteMsg ? inviteMsg : ' Generate a setup link anytime from the accounts list.'}`,
    );
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function generateUserSetupLink(email: string): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.role !== 'Admin') return fail('Only an Admin can generate user setup links.');
  try {
    const admin = adminDb();
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim().toLowerCase(),
    });
    if (error || !data?.properties?.action_link) {
      return fail(error?.message ?? 'Could not generate setup link.');
    }
    return done(`Setup link for ${email}: ${data.properties.action_link}`);
  } catch (err) {
    return fail(messageOf(err));
  }
}

export async function runRetentionPurge(): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.role !== 'Admin') return fail('Only an Admin can execute the retention purge.');
  const client = await db();
  try {
    const res = await call<{ purged: number; batch: string }>(client, 'purge_due_retention', { p_limit: 50 });
    invalidateServerCache();
    revalidatePath('/admin');
    if (!res || res.purged === 0) {
      return done('Retention purge ran. No expired personal records are currently due for deletion.');
    }
    return done(`Retention purge completed. Purged ${res.purged} expired record(s) under batch ${res.batch}.`);
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function setRetention(policyId: string, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.role !== 'Admin') return fail('Only an Admin can change retention.');
  const purpose = formText(form, 'purpose');
  if (!purpose) return fail('State the purpose the data is kept for - retention without a stated purpose is not lawful.');
  const days = Number(formText(form, 'days'));
  if (!Number.isFinite(days) || days < 1 || days > 2555) {
    return fail('Retention must be between 1 day and 7 years.');
  }
  const client = await db();
  try {
    await call(client, 'configure_retention', {
      p_policy_id: policyId,
      p_actor: actor.id,
      p_retention_days: Math.floor(days),
      p_basis: 'dpdp_compliance',
      p_purpose: purpose,
    });
    invalidateServerCache();
    revalidatePath('/admin');
    return done(`Retention set to ${Math.floor(days)} days. Records already scheduled keep their original date.`);
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function recordDsr(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const client = await db();
  try {
    const result = await call<{ reference: string }>(client, 'record_dsr', {
      p: {
        subject_email: formText(formData, 'subject_email'),
        subject_name: formText(formData, 'subject_name'),
        subject_category: formText(formData, 'subject_category') ?? 'Candidate',
        request_type: formText(formData, 'request_type'),
        detail: formText(formData, 'detail'),
      },
      p_actor: actor.id,
    });
    revalidatePath('/admin');
    return done(`${result.reference} recorded with a 30-day response deadline.`);
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function fulfilDsr(dsrId: string, outcome: string, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.role !== 'Admin' && actor.role !== 'HrHead') return fail('Only Admin or HR head can fulfil a request.');
  const summary = formText(form, 'comment');
  if (!summary) return fail('Write what was actually sent back to the person - the response is the evidence.');
  const client = await db();
  try {
    await call(client, 'fulfil_dsr', { p_dsr_id: dsrId, p_actor: actor.id, p_outcome: outcome, p_summary: summary });
    revalidatePath('/admin');
    return done(`Recorded as ${outcome.replace(/_/g, ' ')} with the response summary attached.`);
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function adjustPosition(
  positionId: string,
  requestId: string,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const client = await db();
  try {
    await call(client, 'adjust_position_terms', {
      p_position_id: positionId,
      p_actor: actor.id,
      p_field: formText(formData, 'field') ?? 'ctc_max',
      p_new_value: formText(formData, 'new_value') ?? '',
      p_reason: formText(formData, 'reason') ?? '',
      p_authority_basis: formText(formData, 'authority_basis') ?? '',
    });
    revalidatePath(`/requests/${requestId}`);
    return done('The deviation is recorded against the position, permanently visible.');
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function verifyDoc(documentId: string, requestId: string, result: 'Verified' | 'Rejected' | 'Under Review'): Promise<ActionState> {
  const actor = await requireActor();
  const client = await db();
  try {
    await call(client, 'verify_document', { p_document_id: documentId, p_actor: actor.id, p_result: result });
    revalidatePath(`/requests/${requestId}`);
    return done(`Document marked ${result}.`);
  } catch (error) {
    return fail(messageOf(error));
  }
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------
export async function signIn(formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return fail('Enter your email and password.');
  const client = await db();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    // a wrong password is a failed-login signal, not just a message
    try {
      const actor = await getActor();
      await call(client, 'record_denial', {
        p_action: 'auth.login_failed',
        p_entity_type: 'session',
        p_entity_id: email,
        p_actor: actor?.id ?? null,
        p_reason: 'invalid credentials',
        p_severity: 'low',
      });
    } catch {
      /* never leak the failure of a failure */
    }
    return fail('Those credentials do not match an active account.');
  }
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  invalidateServerCache();
  const client = await db();
  await client.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = formText(form, 'email')?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail('Enter a valid work email.');
  }

  const client = await db();
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
  } catch {
    // Non-fatal: do not leak existence of email
  }

  return done(
    'If an account exists for this work email, instructions to reset your password have been sent.',
  );
}

export async function completePasswordReset(_prev: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get('password') ?? '');
  const confirmPassword = String(form.get('confirm_password') ?? '');

  if (password.length < 8) {
    return fail('Password must be at least 8 characters long.');
  }
  if (password !== confirmPassword) {
    return fail('Passwords do not match.');
  }

  const client = await db();
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    return fail(error.message);
  }

  try {
    const actor = await getActor();
    if (actor) {
      const admin = adminDb();
      await admin.from('audit_events').insert({
        actor_id: actor.id,
        actor_role: actor.role,
        action: 'auth.password_reset',
        entity_type: 'user',
        entity_id: actor.id,
        result: 'success',
        reason: 'User completed password recovery',
        metadata: { email: actor.email },
      });
    }
  } catch {
    // Non-fatal audit log write
  }

  return done('Your password has been updated successfully.', '/dashboard');
}

export async function changePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const password = String(form.get('password') ?? '');
  const confirmPassword = String(form.get('confirm_password') ?? '');

  if (password.length < 8) {
    return fail('Password must be at least 8 characters long.');
  }
  if (password !== confirmPassword) {
    return fail('Passwords do not match.');
  }

  const client = await db();
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    return fail(error.message);
  }

  try {
    const admin = adminDb();
    await admin.from('audit_events').insert({
      actor_id: actor.id,
      actor_role: actor.role,
      action: 'auth.password_change',
      entity_type: 'user',
      entity_id: actor.id,
      result: 'success',
      reason: 'User changed their account password',
      metadata: { email: actor.email },
    });
  } catch {
    // Non-blocking audit write
  }

  return done('Your password has been changed successfully.');
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function formText(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function clean<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out as T;
}

function revalidateAfterPosition(requestId: string): void {
  invalidateServerCache();
  revalidatePath('/dashboard');
  revalidatePath('/requests');
  revalidatePath('/on-hold');
  revalidatePath('/my-actions');
  if (requestId) revalidatePath(`/requests/${requestId}`);
}

function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s*(CONTEXT|DETAIL|HINT):.*$/is, '').trim().slice(0, 400) || 'Something went wrong.';
}
