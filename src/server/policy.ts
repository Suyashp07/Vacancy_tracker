import { cache } from 'react';
import { db } from './db';
import { seesFacility, getWorkflow } from './session';
import {
  isOpenPosition,
  ageingOf,
  availableActions,
  type AgeingInput,
  type StepConfig,
  type TransitionConfig,
} from './workflow-rules';
import {
  DEFAULT_SLA_HOURS,
  ROLE_LABEL,
  type Role,
  type TaskType,
  type PositionStatus,
  type RequestStatus,
  type Tone,
  POSITION_TONE,
  REQUEST_TONE,
} from '@/lib/constants';
import type {
  Actor,
  AppUser,
  ApprovalTask,
  AuditEvent,
  Candidate,
  CandidateDocument,
  DsrRequest,
  Facility,
  IsoDateTime,
  LegalDocument,
  Metrics,
  Position,
  RequestDetail,
  RetentionItemRow,
  RetentionPolicy,
  SecurityIncident,
  TaskListItem,
  UUID,
  VacancyRequest,
  WorkflowDefinition,
} from '@/types/domain';

/**
 * policy - the only module that reads business data.
 *
 * Two walls, deliberately redundant: every query is filtered here by the
 * actor's facility scope and ownership, and the same boundary is enforced again
 * by Postgres RLS. If a page forgets a filter, RLS still returns nothing; if
 * RLS is ever misconfigured, the server filter still holds.
 */

const REQUEST_COLUMNS =
  'id, number, title, reason, facility_id, position_type, min_qualification, experience_text, has_backfill_ref, backfill_ref_note, budget_available, ctc_min, ctc_max, joining_date, is_urgent, status, quantity, target_fill_date, justification, previous_employee_name, acknowledgement_accepted, acknowledgement_version, submitted_at, submitted_by, closed_at, closure_reason, created_at, created_by, updated_at';

const POSITION_COLUMNS =
  'id, request_id, position_number, label, facility_id, status, previous_status_before_hold, hold_reason, hold_start_date, hold_end_date_expected, resume_required, photo_required, ctc_min, ctc_max, target_fill_date, hired_at, created_at, updated_at';

const CANDIDATE_COLUMNS =
  'id, position_id, full_name, email, phone, current_location, expected_ctc, experience_text, qualifications, notice_period_days, source, status, rejection_reason, submitted_for_approval_at, decision_at, approved_for_joining_at, actual_joining_date, created_at, created_by, updated_at';

const DOCUMENT_COLUMNS =
  'id, candidate_id, document_type, file_name, mime_type, file_size_bytes, uploaded_at, verification_status, is_mandatory, is_exception, exception_reason';

/**
 * Supabase types an embedded resource as an array because it cannot know the
 * relationship cardinality without generated types. Every projection here is a
 * shape we own, so it is asserted once at the database boundary rather than
 * defended at each property read.
 */
function rows<T>(data: unknown): T[] {
  return (data ?? []) as unknown as T[];
}

function one<T>(data: unknown): T | null {
  return (data ?? null) as unknown as T | null;
}

function fiscalBounds(fyTag: string): { from: Date; to: Date } {
  const start = 2000 + Number(fyTag.slice(0, 2));
  return { from: new Date(Date.UTC(start, 3, 1)), to: new Date(Date.UTC(start + 1, 2, 31, 23, 59, 59)) };
}

/** Rows this actor may see at all. */
function withinScope(actor: Actor, facilityId: string | null | undefined, createdBy?: string | null): boolean {
  if (seesFacility(actor, facilityId ?? '')) return true;
  return !!createdBy && createdBy === actor.id;
}

export async function listFacilities(activeOnly = true): Promise<Facility[]> {
  const client = await db();
  let query = client.from('facilities').select('id, code, name, facility_type, city, is_active').order('name');
  if (activeOnly) query = query.eq('is_active', true);
  const { data } = await query;
  return (data ?? []) as Facility[];
}

// ---------------------------------------------------------------------------
// the register
// ---------------------------------------------------------------------------
export interface RequestRow {
  request: VacancyRequest;
  facility: Facility | null;
  raisedByName: string | null;
  positions: Position[];
  candidateCount: number;
  openPositions: number;
  oldestActiveAge: number | null;
  tone: Tone;
}

export async function listRequests(
  actor: Actor,
  opts: { status?: RequestStatus | 'all'; search?: string; facilityId?: string; fy?: string } = {},
): Promise<RequestRow[]> {
  const client = await db();
  let query = client
    .from('vacancy_requests')
    .select(`${REQUEST_COLUMNS}, facility:facilities(id, code, name, facility_type, city, is_active)`)
    .order('created_at', { ascending: false })
    .limit(400);

  if (opts.status && opts.status !== 'all') query = query.eq('status', opts.status);
  if (opts.facilityId) query = query.eq('facility_id', opts.facilityId);
  if (opts.fy) {
    const { from, to } = fiscalBounds(opts.fy);
    query = query.gte('created_at', from.toISOString()).lte('created_at', to.toISOString());
  }

  const { data } = await query;
  const rawRows = rows<VacancyRequest & { facility: Facility | null }>(data);

  // server-side scope: an Employee sees only what they raised
  const visible = rawRows.filter((r) => {
    if (actor.role === 'Employee' && r.created_by !== actor.id) return false;
    return withinScope(actor, r.facility_id, r.created_by);
  });

  const ids = visible.map((r) => r.id);
  const positionsByRequest = new Map<string, Position[]>();
  const candidatesByRequest = new Map<string, number>();
  const namesById = new Map<string, string>();

  if (ids.length > 0) {
    const [{ data: pos }, { data: people }] = await Promise.all([
      client.from('positions').select(POSITION_COLUMNS).in('request_id', ids).order('position_number'),
      client.from('users').select('id, full_name').in('id', [...new Set(visible.map((r) => r.created_by).filter(Boolean) as string[])]),
    ]);
    for (const p of (pos ?? []) as Position[]) {
      const list = positionsByRequest.get(p.request_id) ?? [];
      list.push(p);
      positionsByRequest.set(p.request_id, list);
    }
    for (const u of people ?? []) namesById.set(u.id as string, u.full_name as string);

    // One light pass for the register's candidate column. Names are never read
    // here - a list screen shows how many, never who.
    const positionIds = [...positionsByRequest.values()].flat().map((p) => p.id);
    if (positionIds.length > 0) {
      const { data: cands } = await client.from('candidates').select('position_id').in('position_id', positionIds);
      const positionToRequest = new Map([...positionsByRequest.entries()].flatMap(([rid, ps]) => ps.map((p) => [p.id, rid] as const)));
      for (const c of cands ?? []) {
        const rid = positionToRequest.get(c.position_id as string);
        if (!rid) continue;
        candidatesByRequest.set(rid, (candidatesByRequest.get(rid) ?? 0) + 1);
      }
    }
  }

  const search = opts.search?.trim().toLowerCase();
  const result: RequestRow[] = [];
  for (const r of visible) {
    const positions = positionsByRequest.get(r.id) ?? [];
    const open = positions.filter((p) => isOpenPosition(p.status));
    const oldest = open.length
      ? Math.max(...open.map((p) => ageingOf({ createdAt: p.created_at, stageStartedAt: p.updated_at }).total))
      : null;
    const row: RequestRow = {
      request: r,
      facility: r.facility ?? null,
      raisedByName: r.created_by ? namesById.get(r.created_by) ?? null : null,
      positions,
      candidateCount: candidatesByRequest.get(r.id) ?? 0,
      openPositions: open.length,
      oldestActiveAge: oldest,
      tone: REQUEST_TONE[r.status],
    };
    if (search) {
      const hay = [
        r.number,
        r.title,
        r.position_type,
        r.reason,
        r.facility?.name,
        ...positions.map((p) => p.position_number),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) continue;
    }
    result.push(row);
  }
  return result;
}

// ---------------------------------------------------------------------------
// request-level read memoization
//
// A single authenticated screen touches the same full "all requests" register,
// the task queue and the ageing rows from several places (the shell layout, the
// dashboard, metrics, facility breakdown). Without memoization each caller fired
// its own set of PostgREST round-trips over the same data. React's cache()
// dedupes by argument identity within one request, and `actor` comes from the
// already-cached getActor(), so these collapse N duplicate reads into one.
// ---------------------------------------------------------------------------
export const listRequestsAll = cache(async (actor: Actor): Promise<RequestRow[]> =>
  listRequests(actor, { status: 'all' }),
);

/** Candidate counts need a second pass only when a search targets a name. */
export type CandidateRow = Candidate & { documents: CandidateDocument[] };
export async function candidateNamesFor(client: Awaited<ReturnType<typeof db>>, positionIds: string[]): Promise<CandidateRow[]> {
  if (positionIds.length === 0) return [];
  const { data } = await client
    .from('candidates')
    .select(`${CANDIDATE_COLUMNS}, documents:candidate_documents(${DOCUMENT_COLUMNS})`)
    .in('position_id', positionIds)
    .order('created_at');
  return rows<CandidateRow>(data);
}

// ---------------------------------------------------------------------------
// one request, fully
// ---------------------------------------------------------------------------
export async function getRequestDetail(actor: Actor, requestId: string): Promise<RequestDetail | null> {
  const client = await db();
  const { data } = await client
    .from('vacancy_requests')
    .select(`${REQUEST_COLUMNS}, facility:facilities(id, code, name, facility_type, city, is_active)`)
    .eq('id', requestId)
    .maybeSingle();
  const request = one<VacancyRequest & { facility: Facility | null }>(data);
  if (!request) return null;
  if (actor.role === 'Employee' && request.created_by !== actor.id) return null;
  if (!withinScope(actor, request.facility_id, request.created_by)) return null;

  const { data: positions } = await client
    .from('positions')
    .select(POSITION_COLUMNS)
    .eq('request_id', requestId)
    .order('position_number');

  const posRows = (positions ?? []) as Position[];
  const candClient = await db();
  const candidates = await candidateNamesFor(candClient, posRows.map((p) => p.id));

  const byPosition = new Map<string, (Candidate & { documents: CandidateDocument[] })[]>();
  for (const c of candidates) {
    const list = byPosition.get(c.position_id) ?? [];
    list.push(c);
    byPosition.set(c.position_id, list);
  }

  const { data: requester } = await client
    .from('users')
    .select('id, full_name, designation')
    .eq('id', request.created_by ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle();

  const { data: adjustments } = await client
    .from('position_adjustments')
    .select('id, position_id, field, old_value, new_value, reason, authority_basis, adjusted_at')
    .in('position_id', posRows.map((p) => p.id));

  return {
    ...(request as VacancyRequest),
    facility: request.facility ?? null,
    requester: requester ?? null,
    positions: posRows.map((p) => ({
      ...p,
      raised_by_name: requester?.full_name ?? null,
      candidates: byPosition.get(p.id) ?? [],
      adjustments: (adjustments ?? []).filter((a) => a.position_id === p.id),
    })),
  } as RequestDetail;
}

// ---------------------------------------------------------------------------
// metrics and drill-downs: the tile and its drill must always agree
// ---------------------------------------------------------------------------
export interface DrillRow {
  ref: string;
  href: string;
  detail: string;
  facilityName: string;
  ageDays: number | null;
  tone: Tone;
  kind: 'position' | 'request' | 'task';
}

export interface MetricTile {
  key: string;
  label: string;
  value: number;
  unit: 'positions' | 'requests' | 'tasks' | 'candidates';
  hint: string;
  rows: DrillRow[];
}

export async function getMetrics(actor: Actor, fyTag: string): Promise<{ metrics: Metrics; tiles: MetricTile[] }> {
  const requests = await listRequestsAll(actor);
  const positions = requests.flatMap((r) =>
    r.positions.map((p) => ({ position: p, request: r.request, facility: r.facility })),
  );

  const { from, to } = fiscalBounds(fyTag);
  const inFy = positions.filter((x) => {
    const created = new Date(x.position.created_at);
    return created >= from && created <= to;
  });

  const buckets: Record<string, { unit: MetricTile['unit']; label: string; hint: string; rows: DrillRow[] }> = {
    open_positions: { unit: 'positions', label: 'Open positions', hint: 'Not yet filled, excluding drafts', rows: [] },
    awaiting_vacancy: { unit: 'positions', label: 'Awaiting vacancy approval', hint: 'Positions inside an unapproved request', rows: [] },
    awaiting_candidate: { unit: 'positions', label: 'Awaiting candidate decision', hint: 'Sent for approval, Owner or CEO must act', rows: [] },
    sourcing: { unit: 'positions', label: 'Sourcing', hint: 'Released for searching', rows: [] },
    on_hold: { unit: 'positions', label: 'On hold', hint: 'Paused with a recorded reason', rows: [] },
    awaiting_joining: { unit: 'positions', label: 'Approved, awaiting joining', hint: 'Offer accepted, not yet joined', rows: [] },
    hired_fy: { unit: 'positions', label: 'Hired', hint: 'Actual joinings in this fiscal year', rows: [] },
    closed_fy: { unit: 'requests', label: 'Closed or rejected', hint: 'Requests that will not produce a hire', rows: [] },
  };

  const positionTile = (key: keyof typeof buckets, p: Position, facilityName: string, href: string) => {
    buckets[key].rows.push({
      ref: p.position_number,
      href,
      detail: p.label,
      facilityName,
      ageDays: ageingOf({
        createdAt: p.created_at,
        stageStartedAt: p.updated_at,
        holdStartedAt: p.hold_start_date,
        isOnHold: p.status === 'hold',
      }).total,
      tone: POSITION_TONE[p.status],
      kind: 'position',
    });
  };

  for (const x of inFy) {
    const p = x.position;
    const facilityName = x.facility?.name ?? 'Unknown facility';
    const href = `/requests/${p.request_id}`;
    if (isOpenPosition(p.status) && p.status !== 'approved_for_joining') {
      positionTile('open_positions', p, facilityName, href);
    }
    switch (p.status) {
      case 'awaiting_vacancy_approval':
        positionTile('awaiting_vacancy', p, facilityName, href);
        break;
      case 'sent_for_candidate_approval':
        positionTile('awaiting_candidate', p, facilityName, href);
        break;
      case 'sourcing':
      case 'candidate_available':
      case 'approved':
        positionTile('sourcing', p, facilityName, href);
        break;
      case 'hold':
        positionTile('on_hold', p, facilityName, href);
        break;
      case 'approved_for_joining':
        positionTile('awaiting_joining', p, facilityName, href);
        break;
      case 'hired':
        positionTile('hired_fy', p, facilityName, href);
        break;
      default:
        break;
    }
  }

  for (const r of requests) {
    if (['closed', 'rejected'].includes(r.request.status)) {
      buckets.closed_fy.rows.push({
        ref: r.request.number,
        href: `/requests/${r.request.id}`,
        detail: r.request.closure_reason ?? r.request.title,
        facilityName: r.facility?.name ?? 'Unknown facility',
        ageDays: null,
        tone: 'neutral',
        kind: 'request',
      });
    }
  }

  const tasks = await getTasks(actor);
  const client = await db();
  const cands = await candidateNamesFor(client, inFy.map((x) => x.position.id));
  const liveCands = cands.filter((c) => !['candidature_unsuccessful', 'hired', 'rejected'].includes(c.status));
  const withoutPhoto = liveCands.filter((c) => !c.documents.some((d) => d.document_type === 'Photograph'));

  buckets.overdue = {
    unit: 'tasks',
    label: 'Overdue actions',
    hint: 'Past the SLA and waiting on a person',
    rows: tasks
      .filter((t) => t.slaState === 'overdue')
      .map((t) => ({
        ref: t.entityNumber,
        href: t.href,
        detail: `${t.entityLabel} · ${t.task.task_type.replace(/_/g, ' ')}`,
        facilityName: t.facilityName,
        ageDays: Math.floor((Date.now() - new Date(t.waitingSince).getTime()) / 86_400_000),
        tone: 'risk',
        kind: 'task',
      })),
  };

  const tiles: MetricTile[] = Object.entries(buckets).map(([key, b]) => ({
    key,
    label: b.label,
    value: b.rows.length,
    unit: b.unit,
    hint: b.hint,
    rows: b.rows,
  }));

  const value = (key: string) => tiles.find((t) => t.key === key)?.value ?? 0;

  return {
    metrics: {
      open_positions: value('open_positions'),
      awaiting_vacancy_approval: value('awaiting_vacancy'),
      awaiting_candidate_approval: value('awaiting_candidate'),
      sourcing: value('sourcing'),
      // "Shortlisted" is the stage where names have found a position but have
      // not yet gone to the Owner or CEO - stored as candidate_available.
      shortlisted: inFy.filter((x) => x.position.status === 'candidate_available').length,
      awaiting_joining: value('awaiting_joining'),
      on_hold: value('on_hold'),
      hired_fy: value('hired_fy'),
      closed_fy: value('closed_fy'),
      overdue_actions: buckets.overdue.rows.length,
      candidates_without_photo: withoutPhoto.length,
      total_positions_in_fy: inFy.length,
    },
    tiles,
  };
}

// ---------------------------------------------------------------------------
// the personal queue
// ---------------------------------------------------------------------------
async function getTasksImpl(actor: Actor): Promise<TaskListItem[]> {
  const client = await db();
  const roleFilters: string[] = [`assigned_user_id.eq.${actor.id}`, `requested_by.eq.${actor.id}`];
  if (!['Employee', 'Admin'].includes(actor.role)) {
    roleFilters.push(`assigned_role.eq.${actor.role}`);
  }
  const { data } = await client
    .from('approval_tasks')
    .select('*')
    .eq('status', 'pending')
    .or(roleFilters.join(','))
    .order('created_at', { ascending: false })
    .limit(200);

  const tasks = (data ?? []) as ApprovalTask[];

  const requestIds = tasks.filter((t) => t.entity_type === 'vacancy_request').map((t) => t.entity_id);
  const positionIds = tasks.filter((t) => t.entity_type === 'position').map((t) => t.entity_id);
  const candidateIds = tasks.filter((t) => t.entity_type === 'candidate').map((t) => t.entity_id);

  const [requests, positions, candidates, people] = await Promise.all([
    requestIds.length
      ? client.from('vacancy_requests').select(`${REQUEST_COLUMNS}, facility:facilities(name)`).in('id', requestIds)
      : Promise.resolve({ data: [] }),
    positionIds.length
      ? client.from('positions').select(`${POSITION_COLUMNS}, facility:facilities(name)`).in('id', positionIds)
      : Promise.resolve({ data: [] }),
    candidateIds.length
      ? client
          .from('candidates')
          .select(`${CANDIDATE_COLUMNS}, position:positions(${POSITION_COLUMNS}, facility:facilities(name))`)
          .in('id', candidateIds)
      : Promise.resolve({ data: [] }),
    client.from('users').select('id, full_name'),
  ]);

  const requestById = new Map(rows<VacancyRequest & { facility?: Facility }>(requests.data).map((r) => [r.id, r]));
  const positionById = new Map(rows<Position & { facility?: Facility }>(positions.data).map((p) => [p.id, p]));
  const candidateById = new Map(
    rows<Candidate & { position?: Position & { facility?: Facility } }>(candidates.data).map((c) => [c.id, c]),
  );
  const nameById = new Map(rows<{ id: string; full_name: string }>(people.data).map((u) => [u.id, u.full_name]));

  const out: TaskListItem[] = [];
  for (const task of tasks) {
    // A decision you raised yourself is still listed even though you will be
    // refused on submit: hiding it would make the record look lost rather than
    // blocked, and blocked is the thing the approver needs to see.
    let entityNumber = '';
    let entityLabel = '';
    let facilityName = 'Company wide';
    let href = '/dashboard';
    let waitingSince = task.created_at;
    let requestId: string | null = null;

    if (task.entity_type === 'vacancy_request') {
      const r = requestById.get(task.entity_id);
      if (!r) continue;
      entityNumber = r.number;
      entityLabel = r.title;
      facilityName = r.facility?.name ?? facilityName;
      href = `/requests/${r.id}`;
      waitingSince = r.submitted_at ?? r.created_at;
      requestId = r.id;
    } else if (task.entity_type === 'position') {
      const p = positionById.get(task.entity_id);
      if (!p) continue;
      entityNumber = p.position_number;
      entityLabel = p.label;
      facilityName = p.facility?.name ?? facilityName;
      href = `/requests/${p.request_id}`;
      waitingSince = p.updated_at;
      requestId = p.request_id;
    } else {
      const c = candidateById.get(task.entity_id);
      if (!c) continue;
      const p = c.position;
      if (!p) continue;
      if (!withinScope(actor, p.facility_id)) continue;
      entityNumber = p.position_number;
      entityLabel = `${c.full_name} - ${p.label}`;
      facilityName = p.facility?.name ?? facilityName;
      href = `/requests/${p.request_id}`;
      waitingSince = c.submitted_for_approval_at ?? c.created_at;
      requestId = p.request_id;
    }

    // A task that no longer points at a live record cannot be acted on, so it is
    // dropped rather than rendered as a button that would only fail.
    if (!requestId) continue;

    out.push({
      task,
      entityLabel,
      entityNumber,
      facilityName,
      waitingSince,
      requestedByName: task.requested_by ? nameById.get(task.requested_by) ?? null : null,
      href,
      slaState: slaOf(task, waitingSince),
      positionId: task.position_id,
      requestId,
    });
  }
  return out.sort((a, b) => (a.slaState === b.slaState ? 0 : a.slaState === 'overdue' ? -1 : 1));
}

/** Cached so the layout, the dashboard and getMetrics resolve the queue once. */
export const getTasks = cache(async (actor: Actor): Promise<TaskListItem[]> => getTasksImpl(actor));

function slaOf(task: ApprovalTask, since: string): 'within' | 'warning' | 'overdue' {
  const hours = task.sla_hours ?? DEFAULT_SLA_HOURS;
  const elapsed = (Date.now() - new Date(since).getTime()) / 3_600_000;
  if (elapsed >= hours * 2) return 'overdue';
  if (elapsed >= hours) return 'warning';
  return 'within';
}

// ---------------------------------------------------------------------------
// ageing, hold and outcome registers
// ---------------------------------------------------------------------------
export interface AgeingRow {
  position: Position;
  requestNumber: string;
  requestId: string;
  facilityName: string;
  ageing: ReturnType<typeof ageingOf>;
  slaDays: number;
}

async function getAgeingRowsImpl(actor: Actor, onlyOverdue = false): Promise<AgeingRow[]> {
  const requests = await listRequestsAll(actor);
  const rows: AgeingRow[] = [];
  for (const r of requests) {
    for (const p of r.positions) {
      if (!isOpenPosition(p.status) || p.status === 'hired') continue;
      const ageing = ageingOf({
        createdAt: p.created_at,
        stageStartedAt: p.updated_at,
        holdStartedAt: p.hold_start_date,
        isOnHold: p.status === 'hold',
      });
      const workflow = await getWorkflow('position_default');
      const step = workflow.steps.find((s) => s.status_key === p.status);
      const slaDays = step?.overdue_sla_days ?? step?.max_sla_days ?? 21;
      if (onlyOverdue && ageing.active < slaDays) continue;
      rows.push({
        position: p,
        requestNumber: r.request.number,
        requestId: r.request.id,
        facilityName: r.facility?.name ?? 'Unknown facility',
        ageing,
        slaDays,
      });
    }
  }
  return rows.sort((a, b) => b.ageing.active - a.ageing.active);
}

/** Cached: the layout's on-hold badge and the dashboard share one ageing pass. */
export const getAgeingRows = cache(
  async (actor: Actor, onlyOverdue = false): Promise<AgeingRow[]> => getAgeingRowsImpl(actor, onlyOverdue),
);

export interface OnHoldRow extends AgeingRow {
  /** Who paused it. Read from the hold_review task the pause generated. */
  heldBy: string | null;
  heldAt: string | null;
  /** The review point the hold function wrote onto that task. */
  reviewDue: string | null;
  /** The stage the position returns to when it resumes. */
  returnsTo: PositionStatus | null;
  reviewOverdue: boolean;
}

/**
 * Positions paused on purpose. A hold is not a delay pretending to be progress:
 * the stage clock stops and a review obligation starts, so this register shows
 * who paused it, why, and the date the pause itself has to be revisited.      
 */
export async function getOnHold(actor: Actor): Promise<OnHoldRow[]> {
  const held = (await getAgeingRows(actor)).filter((r) => r.position.status === 'hold');
  if (held.length === 0) return [];

  const client = await db();
  const [tasks, people] = await Promise.all([
    client
      .from('approval_tasks')
      .select('id, position_id, requested_by, created_at, due_at')
      .eq('task_type', 'hold_review')
      .eq('status', 'pending')
      .in('position_id', held.map((r) => r.position.id)),
    client.from('users').select('id, full_name'),
  ]);

  const taskByPosition = new Map(
    rows<{ id: string; position_id: string | null; requested_by: string | null; created_at: string; due_at: string | null }>(
      tasks.data,
    )
      .filter((t) => t.position_id)
      .map((t) => [t.position_id as string, t]),
  );
  const nameById = new Map(rows<{ id: string; full_name: string }>(people.data).map((u) => [u.id, u.full_name]));

  return held
    .map((r) => {
      const task = taskByPosition.get(r.position.id) ?? null;
      const reviewDue = task?.due_at ?? r.position.hold_end_date_expected;
      return {
        ...r,
        heldBy: task?.requested_by ? nameById.get(task.requested_by) ?? null : null,
        heldAt: r.position.hold_start_date ?? task?.created_at ?? null,
        reviewDue,
        returnsTo: r.position.previous_status_before_hold,
        reviewOverdue: reviewDue ? new Date(reviewDue).getTime() < Date.now() : false,
      };
    })
    // The ones whose pause has outlived its own review date are the point of the screen.
    .sort((a, b) => Number(b.reviewOverdue) - Number(a.reviewOverdue) || b.ageing.hold - a.ageing.hold);
}

export interface ClosedRow extends RequestRow {
  /**
   * The decision that ended the request. A rejection never writes onto the row,
   * so its reason is read back from the trail - the same rows the detail screen
   * shows, which keeps the two screens from telling different stories.
   */
  ending: { by: string | null; reason: string | null; detail: string | null; at: string } | null;
}

/** Requests that reached an end - closed out or rejected. Reporting is period-bound, hence the fiscal filter. */
export async function getClosed(actor: Actor, opts: { fy?: string } = {}): Promise<ClosedRow[]> {
  const requests = (await listRequests(actor, { status: 'all', fy: opts.fy })).filter((r) =>
    ['closed', 'rejected'].includes(r.request.status),
  );
  if (requests.length === 0) return [];

  const client = await db();
  const { data } = await client
    .from('activity_feed')
    .select('request_id, occurred_at, actor_name, action, detail, reason')
    .in('request_id', requests.map((r) => r.request.id))
    .in('action', ['to_closed', 'to_rejected'])
    .order('occurred_at', { ascending: false })
    .limit(600);

  const endingByRequest = new Map<string, ClosedRow['ending']>();
  for (const e of rows<{ request_id: string; occurred_at: string; actor_name: string | null; action: string; detail: string | null; reason: string | null }>(
    data,
  )) {
    // Descending order, so the first row seen per request is the one that ended it.
    if (!endingByRequest.has(e.request_id)) {
      endingByRequest.set(e.request_id, { by: e.actor_name, reason: e.reason, detail: e.detail, at: e.occurred_at });
    }
  }

  return requests
    .map((r) => ({ ...r, ending: endingByRequest.get(r.request.id) ?? null }))
    .sort(
      (a, b) =>
        new Date(b.request.closed_at ?? b.ending?.at ?? b.request.updated_at).getTime() -
        new Date(a.request.closed_at ?? a.ending?.at ?? a.request.updated_at).getTime(),
    );
}

// ---------------------------------------------------------------------------
// facility breakdown and activity
// ---------------------------------------------------------------------------
export async function getFacilityBreakdown(actor: Actor) {
  const requests = await listRequestsAll(actor);
  const byFacility = new Map<string, { id: string; name: string; counts: Record<PositionStatus, number>; total: number }>();
  for (const r of requests) {
    const key = r.facility?.id ?? 'unknown';
    const entry = byFacility.get(key) ?? {
      id: key,
      name: r.facility?.name ?? 'Unknown facility',
      counts: {} as Record<PositionStatus, number>,
      total: 0,
    };
    for (const p of r.positions) {
      entry.counts[p.status] = (entry.counts[p.status] ?? 0) + 1;
      if (isOpenPosition(p.status)) entry.total += 1;
    }
    byFacility.set(key, entry);
  }
  return [...byFacility.values()].sort((a, b) => b.total - a.total);
}

export interface ActivityRow {
  key: string;
  occurred_at: string;
  actor_id: string | null;
  actor_role: Role | null;
  actor_name: string;
  entity_type: string;
  entity_ref: string | null;
  facility_name: string | null;
  action: string;
  detail: string;
  reason: string | null;
  tone: Tone;
}

export async function getActivity(actor: Actor, limit = 12): Promise<ActivityRow[]> {
  const client = await db();
  // The audit register itself stays Admin-only. Everyone else reads the
  // activity timeline, which is the same business events projected without
  // personal data.
  const { data } = await client
    .from('activity_feed')
    .select('key, occurred_at, actor_id, actor_role, actor_name, entity_type, entity_ref, facility_name, action, detail, reason, tone')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as ActivityRow[];
}

/**
 * The trail of one request: every status change on the request, on each of its
 * positions and on each of its candidates. Reasons are included because the
 * request-scoped feed is read only by people entitled to that request; the
 * company-wide feed drops candidate reasons entirely.
 */
export async function getRequestActivity(actor: Actor, requestId: string, limit = 60): Promise<ActivityRow[]> {
  // Row visibility is decided by the view's own security_invoker policies on the
  // underlying status history, so an out-of-scope reader gets an empty trail
  // rather than an error or a 404 that would confirm the record exists.
  const client = await db();
  const { data } = await client
    .from('activity_feed')
    .select('key, occurred_at, actor_id, actor_role, actor_name, entity_type, entity_ref, facility_name, action, detail, reason, tone')
    .eq('request_id', requestId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  return rows<ActivityRow>(data);
}

export interface CommentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  body: string;
  author_name: string;
  author_role: Role | null;
  created_at: string;
}

/** Comments on a request and on every position and candidate beneath it. */
export async function getCommentsFor(entityIds: string[]): Promise<CommentRow[]> {
  if (entityIds.length === 0) return [];
  const client = await db();
  const { data } = await client
    .from('comments')
    .select('id, entity_type, entity_id, body, created_at, author:users(full_name, role)')
    .in('entity_id', entityIds)
    .order('created_at', { ascending: true })
    .limit(200);
  return rows<{ id: string; entity_type: string; entity_id: string; body: string; created_at: string; author?: { full_name?: string; role?: Role } | null }>(data).map(
    (c) => ({
      id: c.id,
      entity_type: c.entity_type,
      entity_id: c.entity_id,
      body: c.body,
      author_name: c.author?.full_name ?? 'A former account',
      author_role: c.author?.role ?? null,
      created_at: c.created_at,
    }),
  );
}

/**
 * Which buttons this actor is allowed to see right now, together with the rule
 * behind each one - whether it needs a reason, and where it lands. Read from the
 * same configured transitions the database re-enforces on submit, so a hidden
 * action is a real rule rather than a UI preference, and a new Admin-configured
 * action shows up as a working button without a page being edited.
 */
export async function transitionsFor(
  entity: 'vacancy_request' | 'position' | 'candidate',
  statusKey: string,
  role: Role,
): Promise<TransitionConfig[]> {
  const workflow = await getWorkflow(`${entity}_default`);
  const allowed = availableActions(workflow, statusKey, role);
  return workflow.transitions.filter((t) => t.from_status === statusKey && allowed.includes(t.action));
}

/** So a screen can render a move without reaching into the rules module. */
export type { TransitionConfig, StepConfig };

/** The step definition, so a screen can state what it still needs. */
export async function stepFor(
  entity: 'vacancy_request' | 'position' | 'candidate',
  statusKey: string,
): Promise<StepConfig | null> {
  const workflow = await getWorkflow(`${entity}_default`);
  return workflow.steps.find((s) => s.status_key === statusKey) ?? null;
}

export interface PendingDecision {
  id: string;
  entity_type: string;
  entity_id: string;
  task_type: TaskType;
  holder: string;
  assigned_role: Role | null;
  created_at: string;
  due_at: string | null;
  slaState: 'within' | 'warning' | 'overdue';
}

/** Who is currently holding this request up, by name where a name exists. */
export async function getPendingDecisions(entityIds: string[]): Promise<PendingDecision[]> {
  if (entityIds.length === 0) return [];
  const client = await db();
  const { data } = await client
    .from('approval_tasks')
    .select('id, entity_type, entity_id, task_type, assigned_role, assigned_user_id, created_at, due_at, sla_hours, status, holder:users!approval_tasks_assigned_user_id_fkey(full_name)')
    .in('entity_id', entityIds)
    .eq('status', 'pending')
    .order('created_at');
  return rows<{
    id: string;
    entity_type: string;
    entity_id: string;
    task_type: TaskType;
    assigned_role: Role | null;
    assigned_user_id: string | null;
    created_at: string;
    due_at: string | null;
    sla_hours: number | null;
    holder?: { full_name?: string } | null;
  }>(data).map((t) => {
    const hours = t.sla_hours ?? DEFAULT_SLA_HOURS;
    const elapsed = (Date.now() - new Date(t.created_at).getTime()) / 3_600_000;
    return {
      id: t.id,
      entity_type: t.entity_type,
      entity_id: t.entity_id,
      task_type: t.task_type,
      assigned_role: t.assigned_role,
      holder: t.holder?.full_name ?? (t.assigned_role ? ROLE_LABEL[t.assigned_role] : 'Unassigned'),
      created_at: t.created_at,
      due_at: t.due_at,
      slaState: elapsed >= hours * 2 ? 'overdue' : elapsed >= hours ? 'warning' : 'within',
    } satisfies PendingDecision;
  });
}

export async function getPipeline(actor: Actor) {
  const client = await db();
  const { data } = await client.from('v_position_pipeline').select('status, positions, held, oldest_at');
  return (data ?? []) as { status: PositionStatus; positions: number; held: number; oldest_at: string }[];
}

export async function getApproverLoad(actor: Actor) {
  const client = await db();
  const { data } = await client
    .from('v_approver_load')
    .select('assigned_role, actor_id, holder, pending, overdue, acted_30d')
    .order('overdue', { ascending: false });
  return data ?? [];
}

export async function getDocumentAccessSummary(actor: Actor) {
  if (actor.role !== 'Admin' && actor.role !== 'HrHead') return [];
  const client = await db();
  const { data } = await client
    .from('v_document_access_summary')
    .select('actor_id, actor_name, actor_role, accesses, downloads, distinct_documents, last_access_at')
    .order('accesses', { ascending: false })
    .limit(25);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------
export interface NotificationRow {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: 'low' | 'medium' | 'high';
  read_at: string | null;
  created_at: string;
}

export async function getNotifications(actor: Actor, limit = 20): Promise<NotificationRow[]> {
  const client = await db();
  const { data } = await client
    .from('notification_outbox')
    .select('id, entity_type, entity_id, title, body, link, severity, read_at, created_at')
    .eq('recipient_id', actor.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  return rows<NotificationRow>(data);
}

export async function unreadCount(actor: Actor): Promise<number> {
  const client = await db();
  const { count } = await client
    .from('notification_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', actor.id)
    .is('read_at', null);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// admin reads
// ---------------------------------------------------------------------------
export async function listUsers() {
  const client = await db();
  const { data } = await client
    .from('users')
    .select('id, email, full_name, role, primary_facility_id, department, designation, is_active, last_login_at, facility:facilities(name)')
    .order('role')
    .order('full_name');
  return rows<AppUser & { facility: { name: string } | null }>(data);
}

export async function listRetentionPolicies(): Promise<RetentionPolicy[]> {
  const client = await db();
  const { data } = await client.from('retention_policies').select('*').order('data_category');
  return rows<RetentionPolicy>(data);
}

export async function listLegalDocuments(): Promise<LegalDocument[]> {
  const client = await db();
  const { data } = await client
    .from('legal_documents')
    .select('id, key, title, version, status, effective_from, published_at, body_md, updated_at')
    .order('key')
    .order('version');
  return rows<LegalDocument>(data);
}

/**
 * Which policy versions this account has already accepted. Postgres restricts
 * the rows to the caller's own, so a page cannot reveal somebody else's consent.
 */
export async function getMyAcknowledgements(): Promise<Map<string, string>> {
  const client = await db();
  const { data } = await client.from('legal_document_acks').select('legal_document_id, accepted_at');
  const out = new Map<string, string>();
  for (const r of rows<{ legal_document_id: string; accepted_at: string }>(data)) {
    out.set(r.legal_document_id, r.accepted_at);
  }
  return out;
}

export async function listDsrRequests(): Promise<DsrRequest[]> {
  const client = await db();
  const { data } = await client
    .from('dsr_requests')
    .select('*')
    .order('statutory_due_at')
    .limit(100);
  return rows<DsrRequest>(data);
}

export async function listIncidents(): Promise<SecurityIncident[]> {
  const client = await db();
  const { data } = await client
    .from('security_incidents')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(100);
  return rows<SecurityIncident>(data);
}

/**
 * The deletion clock as it currently stands, per scheduled record. Read rather
 * than computed in the page, because the date on the row is the one the policy
 * version in force at finalisation produced.
 */
export async function getRetentionQueue(limit = 400): Promise<RetentionItemRow[]> {
  const client = await db();
  const { data } = await client
    .from('retention_items')
    .select('id, entity_type, entity_id, finalized_at, due_at, deleted_at, retention_policies(data_category)')
    .order('due_at')
    .limit(limit);
  return rows<RetentionItemRow>(data);
}

export interface AckLedgerRow {
  id: UUID;
  document_id: UUID;
  accepted_at: IsoDateTime;
  user_name: string;
  user_email: string;
  role: Role | null;
  document_key: string;
  document_title: string;
  document_version: string;
}

/**
 * Who accepted which version. RLS hands these rows to Admin only, which is why
 * the ledger is an accountability screen rather than something every role can
 * browse.
 */
export async function listAcknowledgementLedger(limit = 200): Promise<AckLedgerRow[]> {
  const client = await db();
  const { data } = await client
    .from('legal_document_acks')
    .select(
      'id, legal_document_id, accepted_at, users(full_name, email, role), legal_documents(id, key, title, version)',
    )
    .order('accepted_at', { ascending: false })
    .limit(limit);
  return rows<{
    id: UUID;
    legal_document_id: UUID;
    accepted_at: IsoDateTime;
    users: { full_name: string | null; email: string | null; role: Role | null } | null;
    legal_documents: { key: string; title: string; version: string } | null;
  }>(data).map((r) => ({
    id: r.id,
    document_id: r.legal_document_id,
    accepted_at: r.accepted_at,
    user_name: r.users?.full_name ?? 'A former account',
    user_email: r.users?.email ?? '—',
    role: r.users?.role ?? null,
    document_key: r.legal_documents?.key ?? '—',
    document_title: r.legal_documents?.title ?? 'Removed document',
    document_version: r.legal_documents?.version ?? '—',
  }));
}

/**
 * The audit register. Only an Admin may select these rows and RLS is what says
 * so, which is why this read goes through the session client instead of the
 * service-role key: the database keeps deciding visibility even for the screen
 * whose whole purpose is watching the database.
 */
export async function getAuditEvents(
  opts: { entityType?: string; limit?: number } = {},
): Promise<AuditEvent[]> {
  const client = await db();
  let query = client
    .from('audit_events')
    .select(
      'id, occurred_at, actor_id, actor_role, action, entity_type, entity_id, request_id, position_id, candidate_id, facility_id, reason, result, metadata',
    )
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? 300);
  if (opts.entityType) query = query.eq('entity_type', opts.entityType);
  const { data } = await query;
  return rows<AuditEvent>(data);
}

/** The workflow definitions as rows, so Admin can state which ones are live. */
export async function listWorkflowDefinitions(): Promise<WorkflowDefinition[]> {
  const client = await db();
  const { data } = await client
    .from('workflow_definitions')
    .select('id, key, name, entity_type, is_active, updated_at')
    .order('entity_type');
  return rows<WorkflowDefinition>(data);
}

export async function listPositionTypes(facilityId: string) {
  const client = await db();
  const { data } = await client
    .from('position_types')
    .select('id, name, accounting_head, default_ctc')
    .eq('facility_id', facilityId)
    .eq('is_active', true)
    .order('name');
  return data ?? [];
}

export type { AgeingInput };
