import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  FileWarning,
  Lock,
  PauseCircle,
  ShieldCheck,
  User,
} from 'lucide-react';
import './detail.css';
import { ActionForm, type ExtraField } from '@/components/action-form';
import { AddCandidateForm } from '@/components/candidate-forms';
import { DocumentRow, UploadDocumentForm } from '@/components/document-tools';
import { HoldPanel } from '@/components/hold-panel';
import {
  Avatar,
  AgeCell,
  Badge,
  CandidateBadge,
  Empty,
  KeyValue,
  PositionBadge,
  RequestBadge,
  SectionHead,
  Timeline,
} from '@/components/ui';
import {
  ACTION_HINT,
  ACTION_VARIANT,
  DOCUMENT_TYPES,
  MANDATORY_DOCUMENTS,
  ROLE_LABEL,
  actionLabel,
  can,
  fieldLabel,
  type PositionStatus,
  type Role,
} from '@/lib/constants';
import { daysSince, fmtCTCBand, fmtDate, fmtDateTime, fmtDuration, fmtINR } from '@/lib/format';
import {
  getRequestActivity,
  getCommentsFor,
  getRequestDetail,
  getPendingDecisions,
  stepFor,
  transitionsFor,
  type CommentRow,
  type PendingDecision,
  type StepConfig,
  type TransitionConfig,
} from '@/server/policy';
import { requireActor } from '@/server/session';
import { ageingOf, missingFields } from '@/server/workflow-rules';
import {
  actOnPosition,
  actOnRequest,
  addComment,
  adjustPosition,
  confirmJoin,
  decide,
  resume,
  sendCandidateForApproval,
} from '@/server/actions';
import type { Position, RequestDetail, VacancyRequest } from '@/types/domain';

export const metadata = { title: 'Vacancy request' };
export const dynamic = 'force-dynamic';

/** The hiring path a position walks. Only used to draw the progress dots. */
const POS_FLOW: PositionStatus[] = [
  'awaiting_vacancy_approval',
  'approved',
  'sourcing',
  'candidate_available',
  'sent_for_candidate_approval',
  'approved_for_joining',
  'hired',
];

/** Actions the position card renders as a purpose-built panel instead of a button. */
const POSITION_PANEL_ACTIONS = new Set(['hold', 'add_candidate', 'confirm_joining']);

type Moves = Map<string, { moves: TransitionConfig[]; step: StepConfig | null }>;

/** A position exactly as the detail read returns it: its own candidates and deviations. */
type PositionRow = RequestDetail['positions'][number];
type CandidateWithDocs = PositionRow['candidates'][number];

/**
 * Steps and permitted moves per status, fetched once per distinct status. The
 * workflow itself is memoised per request, so twenty positions cost one query.
 */
async function movesByStatus(
  entity: 'vacancy_request' | 'position' | 'candidate',
  statuses: string[],
  role: Role,
): Promise<Moves> {
  const out: Moves = new Map();
  for (const status of statuses) {
    out.set(status, { moves: await transitionsFor(entity, status, role), step: await stepFor(entity, status) });
  }
  return out;
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const detail = await getRequestDetail(actor, id);
  if (!detail) notFound();

  const positions = detail.positions;
  const candidates = positions.flatMap((p) => p.candidates);
  const entityIds: string[] = [detail.id].concat(
    positions.map((p) => p.id),
    candidates.map((c) => c.id),
  );

  const requestMoves = await transitionsFor('vacancy_request', detail.status, actor.role);
  const requestStep = await stepFor('vacancy_request', detail.status);
  const [decisions, comments, activity, posConfig, candConfig] = await Promise.all([
    getPendingDecisions(entityIds),
    getCommentsFor(entityIds),
    getRequestActivity(actor, detail.id),
    movesByStatus('position', [...new Set(positions.map((p) => p.status))], actor.role),
    movesByStatus('candidate', [...new Set(candidates.map((c) => c.status))], actor.role),
  ]);

  // Role capability comes from the permission catalogue, never from a status.
  const seesDocs = can(actor.role, 'view_candidate_documents');
  const seesContact = can(actor.role, 'add_candidate');
  const canAddCandidate = can(actor.role, 'add_candidate');
  const canAdjust = can(actor.role, 'adjust_position_terms');
  const raisedByMe = detail.created_by === actor.id;

  const held = positions.filter((p) => p.status === 'hold' && p.hold_start_date);
  const holdable = positions.filter((p) => !['draft', 'hold', 'hired', 'position_closed'].includes(p.status));
  const age = ageingOf({
    createdAt: detail.created_at,
    stageStartedAt: detail.submitted_at ?? detail.updated_at,
  });
  const maxHold = held.reduce((max, p) => Math.max(max, daysSince(p.hold_start_date) ?? 0), 0);
  const stageWait = Math.max(
    0,
    ...positions.map(
      (p) =>
        ageingOf({
          createdAt: p.created_at,
          stageStartedAt: p.updated_at,
          holdStartedAt: p.hold_start_date,
          isOnHold: p.status === 'hold',
        }).stage,
    ),
    age.stage,
  );

  const byEntity = new Map<string, CommentRow[]>();
  for (const c of comments) {
    const list = byEntity.get(c.entity_id) ?? [];
    list.push(c);
    byEntity.set(c.entity_id, list);
  }
  const requestComments = byEntity.get(detail.id) ?? [];

  const blockedFields = requestStep ? missingFields(requestStep.required_fields, detail as unknown as Record<string, unknown>) : [];
  const pendingForRequest = decisions.filter((d) => d.entity_id === detail.id);

  return (
    <>
      <div className="head">
        <div>
          <div className="idline">
            <span className="rid">{detail.number}</span>
            <RequestBadge status={detail.status} />
            <Badge tone={detail.is_urgent ? 'risk' : 'neutral'}>{detail.is_urgent ? 'Urgent' : 'Normal priority'}</Badge>
            <Badge>{detail.facility?.name ?? 'Facility out of your scope'}</Badge>
            <Badge tone="neutral">workflow v1</Badge>
          </div>
          <h2 className="title">{detail.title}</h2>

          <div className="meta">
            <span>
              Raised by <b>{detail.requester?.full_name ?? 'a removed account'}</b>
              {detail.requester?.designation ? ` (${detail.requester.designation})` : ''}
            </span>
            <span>
              Submitted <b>{fmtDate(detail.submitted_at)}</b>
            </span>
            <span>
              Reason <b>{detail.reason}</b>
            </span>
            <span>
              Headcount <b className="tnum">{detail.quantity}</b>
            </span>
            <span>
              CTC <b>{fmtCTCBand(detail.ctc_min, detail.ctc_max)}</b>
            </span>
            <span>
              Target fill <b>{fmtDate(detail.target_fill_date)}</b>
            </span>
            {detail.facility?.code ? (
              <span>
                Facility code <b className="mono">{detail.facility.code}</b>
              </span>
            ) : null}
          </div>

          <div className="just">
            <FileWarning size={16} />
            <div>
              <div>{detail.justification}</div>
              <div className="cmeta" style={{ marginTop: 6 }}>
                <span>
                  Minimum qualification: <b>{detail.min_qualification ?? 'not stated'}</b>
                </span>
                <span>·</span>
                <span>Experience: {detail.experience_text ?? 'not stated'}</span>
                {detail.has_backfill_ref ? (
                  <>
                    <span>·</span>
                    <span>
                      Backfill reference: {detail.previous_employee_name ?? 'named person'}{' '}
                      {detail.backfill_ref_note ? `(${detail.backfill_ref_note})` : ''}
                    </span>
                  </>
                ) : null}
                <span>·</span>
                <span>
                  Budget: {detail.budget_available === null ? 'not stated' : detail.budget_available ? 'available' : 'not available'}
                </span>
              </div>
            </div>
          </div>

          {requestMoves.length > 0 ? (
            <div className="actions">
              {requestMoves.map((t) => (
                <ActionForm
                  key={t.action}
                  run={actOnRequest}
                  args={[detail.id, t.action]}
                  label={actionLabel(t.action)}
                  variant={ACTION_VARIANT[t.action] ?? 'default'}
                  intro={
                    <>
                      {ACTION_HINT[t.action] ?? `Moves this request to ${t.to_status.replace(/_/g, ' ')}.`}
                      {t.action === 'approve' && raisedByMe
                        ? ' You raised this request, so the system will refuse your own approval.'
                        : ''}
                    </>
                  }
                  requireReason={t.requires_reason}
                  requireComment={t.requires_comment}
                  keepOpen={false}
                />
              ))}
              <Link href="/requests" className="btn ghost sm">
                <ArrowLeft size={14} />
                Register
              </Link>
            </div>
          ) : (
            <div className="actions">
              <span className="tiny muted">
                No move is permitted from “{detail.status.replace(/_/g, ' ')}” for your role. The trail below is still
                readable.
              </span>
            </div>
          )}

          {detail.status === 'returned_for_information' || detail.status === 'rejected' || detail.status === 'closed' ? (
            <div className="notice warn" style={{ marginTop: 16 }}>
              <ShieldCheck size={16} />
              <div>
                <b>
                  {detail.status === 'returned_for_information'
                    ? 'Returned for information'
                    : detail.status === 'rejected'
                      ? 'Rejected'
                      : 'Closed'}{' '}
                  · {fmtDate(detail.closed_at ?? detail.updated_at)}
                </b>
                <div style={{ marginTop: 4 }}>
                  {detail.closure_reason ??
                    'The reason is recorded with the decision and appears in the trail below - it is never deleted.'}
                </div>
              </div>
            </div>
          ) : null}

          {held.length > 0 ? (
            <div className="holdbanner">
              <PauseCircle size={16} />
              <div style={{ flex: 1 }}>
                <b>
                  {held.length} position(s) on hold
                  {held[0]?.hold_start_date ? ` · held from ${fmtDate(held[0].hold_start_date)}` : ''}
                </b>
                <div className="sub" style={{ fontSize: 12.5 }}>
                  {held[0]?.hold_reason}
                </div>
                <div className="cmeta">
                  <span>
                    expected review {held[0]?.hold_end_date_expected ? fmtDate(held[0].hold_end_date_expected) : 'not set — stays open-ended'}
                  </span>
                  <span>·</span>
                  <span>stage clock frozen for these positions</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="card pad">
          <SectionHead title="Decision of record" note="the request, not the people" />
          <DecisionRows
            request={detail}
            positions={positions}
            pending={pendingForRequest}
            actorRole={actor.role}
            raisedByMe={raisedByMe}
          />

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
            <div className="nav-label" style={{ padding: '0 0 8px' }}>
              Ageing clocks
            </div>
            <div className="clocks">
              <Clock k="Total calendar age" v={`${age.total}d`} sub={`since ${fmtDate(detail.created_at)}`} />
              <Clock k="Working age" v={`${Math.max(0, age.total - maxHold)}d`} sub="hold excluded" cls="act" />
              <Clock k="Oldest stage wait" v={`${stageWait}d`} sub={requestStep?.label ?? detail.status} />
              <Clock
                k="Time on hold"
                v={`${maxHold}d`}
                sub={held.length > 0 ? `review ${held[0]?.hold_end_date_expected ? fmtDate(held[0].hold_end_date_expected) : 'unset'}` : 'nothing held'}
                cls="holdc"
              />
            </div>
          </div>

          {blockedFields.length > 0 ? (
            <div className="notice warn" style={{ marginTop: 14 }}>
              <FileWarning size={16} />
              <div>
                <b>This step still needs</b>
                <div style={{ marginTop: 4 }}>{blockedFields.map(fieldLabel).join(', ')} — the workflow refuses to move
                  forward without them, whoever is signed in.</div>
              </div>
            </div>
          ) : null}

          {holdable.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <HoldPanel
                requestId={detail.id}
                positions={holdable.map((p) => ({ id: p.id, label: p.label, number: p.position_number }))}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="section dgrid">
        <div>
          <SectionHead
            title={`Positions (${positions.length})`}
            note="each moves on its own clock · adding a candidate never changes headcount"
          />
          {positions.length === 0 ? (
            <div className="card pad" style={{ textAlign: 'center', padding: 44 }}>
              <div className="mark" style={{ margin: '0 auto 12px' }}>
                <User size={18} />
              </div>
              <div className="cell-main">No position records yet</div>
              <div className="sub" style={{ marginTop: 4 }}>
                {detail.quantity} position(s) are created the moment an approver acts — and only by someone who did not
                raise this request.
              </div>
            </div>
          ) : (
            positions.map((p) => (
              <PositionCard
                key={p.id}
                position={p}
                config={posConfig.get(p.status) ?? { moves: [], step: null }}
                comments={comments}
                decisions={decisions.filter((d) => d.entity_id === p.id)}
                candConfig={candConfig}
                requestId={detail.id}
                seesDocs={seesDocs}
                seesContact={seesContact}
                canAddCandidate={canAddCandidate}
                canAdjust={canAdjust}
                actorRole={actor.role}
              />
            ))
          )}
        </div>

        <div>
          <SectionHead title="Who is holding it up" note="pending tasks on this record" />
          <div className="card pad">
            {decisions.length === 0 ? (
              <Empty title="Nothing is waiting on a person" note="Every open task on this request has been acted on." />
            ) : (
              decisions.map((d) => (
                <div className="drow" key={d.id}>
                  <span className="muted">
                    {actionLabel(d.task_type)}
                    <div className="tiny" style={{ color: 'var(--ink-3)' }}>
                      {d.entity_type === 'vacancy_request'
                        ? 'the request'
                        : d.entity_type === 'position'
                          ? `position ${positions.find((p) => p.id === d.entity_id)?.position_number ?? '—'}`
                          : `candidate ${candidates.find((c) => c.id === d.entity_id)?.full_name ?? '—'}`}
                    </div>
                  </span>
                  <span>
                    <b>{d.holder}</b>
                    <div className="tiny muted">
                      {fmtDuration(d.created_at)} waiting · {d.slaState === 'within' ? 'inside SLA' : d.slaState === 'warning' ? 'SLA reached' : 'overdue'}
                    </div>
                  </span>
                </div>
              ))
            )}
          </div>

          <SectionHead title="Activity timeline" note="status changes only" right={<span className="tiny muted">{activity.length} events</span>} />
          <div className="card pad">
            <Timeline
              entries={activity.map((a) => ({
                key: a.key,
                when: a.occurred_at,
                what: (
                  <>
                    <b>{a.entity_ref ?? a.entity_type}</b> — {a.detail}
                  </>
                ),
                who: a.actor_name,
                role: a.actor_role ? ROLE_LABEL[a.actor_role] : null,
                note: a.reason ? <span style={{ fontStyle: 'italic' }}>{a.reason}</span> : null,
                variant: a.tone === 'hold' ? 'hold' : a.tone === 'risk' ? 'riskev' : a.action.includes('approve') ? 'decision' : '',
              }))}
            />
          </div>

          <SectionHead
            title="Comments"
            note={actor.role === 'Employee' ? 'visible to you and the people working this request' : 'internal to permitted roles'}
          />
          <div className="card pad">
            {requestComments.length === 0 ? (
              <div className="tiny muted" style={{ marginBottom: 10 }}>
                No comments on the request itself. Position and candidate comments sit with their own record.
              </div>
            ) : (
              requestComments.map((c) => <CommentBubble key={c.id} comment={c} />)
            )}
            <ActionForm
              run={addComment}
              args={['vacancy_request', detail.id, detail.id]}
              label="Write a comment"
              variant="dark"
              submitLabel="Post"
              intro="Stored against this request, readable by everyone with access to it, and included in a data-subject response."
            >
              <textarea
                name="body"
                className="textarea"
                rows={3}
                required
                placeholder="What the next person needs to know…"
              />
            </ActionForm>
          </div>

          <div className="regfoot" style={{ marginTop: 16 }}>
            <span>
              Every document open, decision and comment on this record is written to the audit register with your name
              and the state it changed.
            </span>
            <Link href="/requests" className="btn ghost sm">
              Register
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------

function Clock({ k, v, sub, cls = '' }: { k: string; v: string; sub: string; cls?: string }) {
  return (
    <div className={`clock ${cls}`.trim()}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="k" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

function DecisionRows({
  request,
  positions,
  pending,
  actorRole,
  raisedByMe,
}: {
  request: VacancyRequest;
  positions: Position[];
  pending: PendingDecision[];
  actorRole: Role;
  raisedByMe: boolean;
}) {
  return (
    <div>
      <div className="drow">
        <span className="muted">Vacancy approval</span>
        <span>{pending.length > 0 ? `Open · ${pending.map((p) => p.holder).join(', ')}` : 'Closed'}</span>
      </div>
      <div className="drow">
        <span className="muted">Decided</span>
        <span>{request.status === 'draft' ? '—' : fmtDate(request.submitted_at ?? request.updated_at)}</span>
      </div>
      <div className="drow">
        <span className="muted">Positions created</span>
        <span className="tnum">
          {positions.length} of {request.quantity} requested
        </span>
      </div>
      <div className="drow">
        <span className="muted">Self-approval</span>
        <span>{raisedByMe && ['submitted_for_vacancy_approval', 'returned_for_information'].includes(request.status) ? 'blocked for you · you raised this' : 'not applicable to you'}</span>
      </div>
      <div className="drow">
        <span className="muted">Your role here</span>
        <span>{ROLE_LABEL[actorRole]}</span>
      </div>
      <div className="drow">
        <span className="muted">Acknowledged</span>
        <span>
          {request.acknowledgement_accepted ? `yes · v${request.acknowledgement_version ?? '—'}` : 'not recorded'}
        </span>
      </div>
    </div>
  );
}

function CommentBubble({ comment }: { comment: CommentRow }) {
  return (
    <div className="cmt">
      <div className="cmt-h">
        <Avatar name={comment.author_name} />
        <b style={{ color: 'var(--ink-2)' }}>{comment.author_name}</b>
        <span>{comment.author_role ? ROLE_LABEL[comment.author_role] : '—'}</span>
        <span className="mono" style={{ marginLeft: 'auto' }}>
          {fmtDateTime(comment.created_at)}
        </span>
      </div>
      <div className="cmt-t">{comment.body}</div>
    </div>
  );
}

function PositionCard({
  position,
  config,
  comments,
  decisions,
  candConfig,
  requestId,
  seesDocs,
  seesContact,
  canAddCandidate,
  canAdjust,
  actorRole,
}: {
  position: PositionRow;
  config: { moves: TransitionConfig[]; step: StepConfig | null };
  /** every comment on the request; each record renders the ones addressed to it */
  comments: CommentRow[];
  decisions: PendingDecision[];
  candConfig: Moves;
  requestId: string;
  seesDocs: boolean;
  seesContact: boolean;
  canAddCandidate: boolean;
  canAdjust: boolean;
  actorRole: Role;
}) {
  const p = position;
  const onHold = p.status === 'hold';
  const positionComments = comments.filter((x) => x.entity_id === p.id);
  const ageing = ageingOf({
    createdAt: p.created_at,
    stageStartedAt: p.updated_at,
    holdStartedAt: p.hold_start_date,
    isOnHold: onHold,
  });
  const flowIndex = POS_FLOW.indexOf(p.status);
  const openMoves = config.moves.filter((t) => !POSITION_PANEL_ACTIONS.has(t.action));
  const hasHold = config.moves.some((t) => t.action === 'hold');
  const hasAddCandidate = config.moves.some((t) => t.action === 'add_candidate');
  const hasConfirmJoining = config.moves.some((t) => t.action === 'confirm_joining');
  const slaDays = config.step?.overdue_sla_days ?? config.step?.max_sla_days ?? 21;
  const label = config.step?.label ?? p.status.replace(/_/g, ' ');

  return (
    <details className="pos" open={p.candidates.length > 0 && p.candidates.some((c) => c.status === 'submitted_for_recruitment_approval')}>
      <summary className="poshead">
        <span className="pnum">{p.position_number}</span>
        <div className="pstage">
          <div className="row wrap" style={{ gap: 8 }}>
            {onHold ? (
              <Badge tone="hold" dot>
                On hold · was {p.previous_status_before_hold?.replace(/_/g, ' ') ?? 'an earlier stage'}
              </Badge>
            ) : (
              <PositionBadge status={p.status} />
            )}
            <Badge>{label}</Badge>
            <Badge tone="neutral">
              {p.candidates.length === 0 ? 'no candidates' : `${p.candidates.length} candidate${p.candidates.length > 1 ? 's' : ''}`}
            </Badge>
          </div>
          <div className="pmini" aria-hidden>
            {POS_FLOW.map((s, i) => (
              <i key={s} className={i <= flowIndex ? 'done' : ''} title={s.replace(/_/g, ' ')} />
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <AgeCell days={onHold ? ageing.hold : ageing.stage} sla={slaDays} />
          <div className="cmeta">{p.target_fill_date ? `target ${fmtDate(p.target_fill_date)}` : 'no target date'}</div>
        </div>
        <span className="tiny muted">{decisions.length > 0 ? 'waiting' : ''}</span>
      </summary>

      <div className="pbody">
        {onHold ? (
          <div className="holdbanner" style={{ margin: '14px 0' }}>
            <PauseCircle size={16} />
            <div style={{ flex: 1 }}>
              <b>Held {fmtDate(p.hold_start_date)}</b>
              <div className="sub" style={{ fontSize: 12.5 }}>
                {p.hold_reason}
              </div>
              <div className="cmeta">
                <span>review {p.hold_end_date_expected ? fmtDate(p.hold_end_date_expected) : 'not scheduled'}</span>
                <span>·</span>
                <span>hold age {ageing.hold}d</span>
              </div>
            </div>
            {config.moves.some((t) => t.action === 'resume') ? (
              <ActionForm
                run={resume}
                args={[p.id, requestId]}
                label="Resume"
                variant="default"
                commentLabel="Why it is back on"
                requireComment
                intro="The stage the position was held at is restored exactly, and the hold review task is closed."
              />
            ) : null}
          </div>
        ) : null}

        <div className="grid2" style={{ marginTop: 14, gap: '6px 18px' }}>
          <KeyValue k="CTC band" v={fmtCTCBand(p.ctc_min, p.ctc_max)} />
          <KeyValue k="Label" v={p.label} />
          <KeyValue k="Resume required" v={p.resume_required ? 'yes' : 'no'} />
          <KeyValue k="Photograph required" v={p.photo_required ? 'yes' : 'no'} />
          <KeyValue k="Ageing" v={`${ageing.total}d total · ${ageing.active}d working${ageing.hold ? ` · ${ageing.hold}d held` : ''}`} />
          <KeyValue k="Last moved" v={fmtDateTime(p.updated_at)} />
        </div>

        {openMoves.length > 0 || hasHold || hasAddCandidate ? (
          <div className="actions" style={{ marginTop: 14 }}>
            {openMoves.map((t) =>
              t.action === 'resume' ? null : (
                <ActionForm
                  key={t.action}
                  run={actOnPosition}
                  args={[p.id, requestId, t.action]}
                  label={actionLabel(t.action)}
                  variant={ACTION_VARIANT[t.action] ?? 'default'}
                  intro={ACTION_HINT[t.action] ?? `Moves the position to ${t.to_status.replace(/_/g, ' ')}.`}
                  requireReason={t.requires_reason}
                  requireComment={t.requires_comment}
                  fields={
                    t.action === 'start_sourcing'
                      ? [{ name: 'target_fill_date', label: 'Target fill date', type: 'date' } as ExtraField]
                      : []
                  }
                />
              ),
            )}
            {hasHold ? <span className="tiny muted">Holding this position is done from the panel beside the head.</span> : null}
            {hasAddCandidate && !canAddCandidate ? (
              <span className="tiny muted">Adding a candidate belongs to HR.</span>
            ) : null}
            {hasConfirmJoining ? (
              <span className="tiny muted">Joining is confirmed against the person, with the date they actually joined.</span>
            ) : null}
          </div>
        ) : null}

        {canAdjust && ['approved', 'sourcing', 'candidate_available'].includes(p.status) ? (
          <div style={{ marginTop: 12 }}>
            <ActionForm
              run={adjustPosition}
              args={[p.id, requestId]}
              label="Adjust approved terms"
              variant="dark"
              requireReason
              reasonLabel="Why the approved terms are changing"
              intro="An exception to a decision already taken. It needs an authority basis, stays on this position forever, and never rewrites the approval itself."
              fields={[
                {
                  name: 'field',
                  label: 'Which term',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'ctc_max', label: 'CTC ceiling' },
                    { value: 'ctc_min', label: 'CTC floor' },
                    { value: 'target_fill_date', label: 'Target fill date' },
                  ],
                },
                { name: 'new_value', label: 'New value', required: true, placeholder: '42000 or 2026-12-31' },
                { name: 'authority_basis', label: 'Authority it rests on', required: true, placeholder: 'Owner email of 12 Oct, note reference' },
              ]}
            />
          </div>
        ) : null}

        {p.adjustments.length > 0 ? (
          <div className="notice warn" style={{ marginTop: 12 }}>
            <ShieldCheck size={16} />
            <div>
              <b>{p.adjustments.length} recorded deviation(s) on this position</b>
              {p.adjustments.map((a) => (
                <div key={a.id} className="sub" style={{ fontSize: 12.5, marginTop: 4 }}>
                  {fmtDate(a.adjusted_at)} · {fieldLabel(a.field)} {a.old_value ?? '—'} → {a.new_value} · rests on{' '}
                  {a.authority_basis} · {a.reason}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ paddingTop: 14 }}>
          {p.candidates.length === 0 ? (
            <div className="locked">
              <User size={15} />
              <div>
                {canAddCandidate
                  ? 'No candidate on this position yet. A resume and photograph must be attached before it can go for approval.'
                  : `No candidate submitted for this position${actorRole === 'Finance' ? ' — numbers only, by design' : ''}.`}
              </div>
            </div>
          ) : (
            p.candidates.map((c) => (
              <CandidateRow
                key={c.id}
                candidate={c}
                config={candConfig.get(c.status) ?? { moves: [], step: null }}
                comments={comments.filter((x) => x.entity_id === c.id)}
                decisions={decisions.filter((d) => d.entity_id === c.id)}
                requestId={requestId}
                facilityId={p.facility_id}
                seesDocs={seesDocs}
                seesContact={seesContact}
                canAddCandidate={canAddCandidate}
              />
            ))
          )}
          {canAddCandidate && hasAddCandidate ? (
            <details className="pos" style={{ marginTop: 12 }}>
              <summary className="poshead" style={{ cursor: 'pointer' }}>
                <span className="pnum">+</span>
                <div className="pstage">
                  <div className="cell-main">Add a candidate to {p.position_number}</div>
                  <span className="tiny muted">Creates a personal record. The person must have been told.</span>
                </div>
              </summary>
              <div className="pbody">
                <AddCandidateForm requestId={requestId} positionId={p.id} positionLabel={`${p.position_number} · ${p.label}`} />
              </div>
            </details>
          ) : null}
        </div>

        {positionComments.length > 0 ? (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
            <div className="nav-label" style={{ padding: '0 0 8px' }}>
              Comments on this position
            </div>
            {positionComments.map((c) => (
              <CommentBubble key={c.id} comment={c} />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function CandidateRow({
  candidate,
  config,
  comments,
  decisions,
  requestId,
  facilityId,
  seesDocs,
  seesContact,
  canAddCandidate,
}: {
  candidate: CandidateWithDocs;
  config: { moves: TransitionConfig[]; step: StepConfig | null };
  comments: CommentRow[];
  decisions: PendingDecision[];
  requestId: string;
  facilityId: string;
  seesDocs: boolean;
  seesContact: boolean;
  canAddCandidate: boolean;
}) {
  const c = candidate;
  const required: string[] = config.step?.required_documents?.length
    ? config.step.required_documents
    : [...MANDATORY_DOCUMENTS];
  const attached = new Set<string>((c.documents ?? []).map((d) => d.document_type));
  const missing = required.filter((t) => !attached.has(t));
  const excepted = (c.documents ?? []).filter((d) => d.is_exception).map((d) => d.document_type);
  const contact = [seesContact ? c.phone : null, seesContact ? c.email : null].filter(Boolean) as string[];

  return (
    <div className="cand">
      <Avatar name={c.full_name} size="lg" />
      <div>
        <div className="cname">
          {c.full_name}
          <span style={{ marginLeft: 8 }}>
            <CandidateBadge status={c.status} />
          </span>
        </div>
        <div className="cmeta">
          {c.current_location ? <span>{c.current_location}</span> : null}
          {contact.length > 0 ? <span className="mono">{contact.join(' · ')}</span> : <span className="locked" style={{ padding: '2px 7px' }}>contact hidden for this role</span>}
          <span>·</span>
          <span>expected {fmtINR(c.expected_ctc)}</span>
          {c.notice_period_days !== null ? (
            <>
              <span>·</span>
              <span>notice {c.notice_period_days}d</span>
            </>
          ) : null}
          {c.source ? (
            <>
              <span>·</span>
              <span>via {c.source}</span>
            </>
          ) : null}
          <span>·</span>
          <span>added {fmtDate(c.created_at)}</span>
        </div>

        <div className="cmeta" style={{ marginTop: 7 }}>
          {required.map((t) =>
            attached.has(t) ? (
              <Badge key={t} tone="ok">
                {t} on file
              </Badge>
            ) : (
              <Badge key={t} tone="risk">
                {t} missing
              </Badge>
            ),
          )}
          {excepted.length > 0 ? (
            <Badge tone="wait">on exception: {excepted.join(', ')}</Badge>
          ) : null}
        </div>

        {c.documents && c.documents.length > 0 ? (
          <div style={{ marginTop: 10 }}>
            {seesDocs ? (
              c.documents.map((doc) => <DocumentRow key={doc.id} doc={doc} requestId={requestId} />)
            ) : (
              <div className="locked">
                <Lock size={15} />
                <div>
                  {c.documents.length} document(s) held for this candidate, none of them readable by your role. The
                  purpose limitation is enforced in storage, not hidden here.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="tiny muted" style={{ marginTop: 8 }}>
            Nothing attached yet.
          </div>
        )}

        {c.rejection_reason ? (
          <div className="tl-note" style={{ marginTop: 8, maxWidth: '70ch' }}>
            <b>Recorded reason:</b> {c.rejection_reason}
          </div>
        ) : null}
        {c.actual_joining_date ? (
          <div className="tl-note" style={{ marginTop: 8 }}>
            <b>Joined</b> {fmtDate(c.actual_joining_date)}
            {c.approved_for_joining_at ? ` · approved ${fmtDate(c.approved_for_joining_at)}` : ''}
          </div>
        ) : null}
        {comments.map((x) => (
          <div key={x.id} className="tl-note" style={{ marginTop: 8, maxWidth: '70ch' }}>
            <b>{x.author_name}</b> ({x.author_role ? ROLE_LABEL[x.author_role] : '—'}) · {fmtDateTime(x.created_at)}
            <div>{x.body}</div>
          </div>
        ))}
      </div>

      <div className="col" style={{ gap: 8, alignItems: 'flex-end' }}>
        {decisions.map((d) => (
          <span key={d.id} className={`tiny ${d.slaState === 'overdue' ? 'err-msg' : 'muted'}`}>
            {d.holder} · {fmtDuration(d.created_at)} waiting
          </span>
        ))}

        {seesDocs && canAddCandidate ? (
          <UploadInDetails candidateId={c.id} requestId={requestId} facilityId={facilityId} />
        ) : null}

        {config.moves.map((t) => {
          if (t.action === 'submit_for_recruitment_approval') {
            return (
              <ActionForm
                key={t.action}
                run={sendCandidateForApproval}
                args={[c.id, requestId]}
                label={actionLabel(t.action)}
                variant={ACTION_VARIANT[t.action] ?? 'primary'}
                intro={
                  missing.length > 0
                    ? `Blocked until ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} attached — or an exception is recorded with the authority it rests on.`
                    : (ACTION_HINT[t.action] ?? '')
                }
                fields={
                  missing.length > 0
                    ? [
                        { name: 'exception_reason', label: 'Exception reason', required: true, placeholder: `Why ${missing.join(' and ')} is not available` },
                        { name: 'authority_basis', label: 'Authority it rests on', required: true },
                        { name: 'authorized_by', label: 'Who authorised it', required: true },
                      ]
                    : []
                }
              />
            );
          }
          if (t.action === 'confirm_joining') {
            return (
              <ActionForm
                key={t.action}
                run={confirmJoin}
                args={[c.id, requestId]}
                label={actionLabel(t.action)}
                variant={ACTION_VARIANT[t.action] ?? 'dark'}
                intro={ACTION_HINT[t.action]}
                fields={[
                  { name: 'actual_joining_date', label: 'Date they actually joined', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) },
                ]}
              />
            );
          }
          if (['approve_for_joining', 'reject', 'return_for_modifications'].includes(t.action)) {
            return (
              <ActionForm
                key={t.action}
                run={decide}
                args={[c.id, requestId, t.action]}
                label={actionLabel(t.action)}
                variant={ACTION_VARIANT[t.action] ?? 'default'}
                intro={
                  <>
                    {ACTION_HINT[t.action] ?? ''}
                    {c.submitted_for_approval_at ? ` Waiting since ${fmtDate(c.submitted_for_approval_at)}.` : ''}
                  </>
                }
                requireReason={t.requires_reason}
                requireComment={t.requires_comment}
              />
            );
          }
          return (
            <span key={t.action} className="tiny muted" style={{ maxWidth: 220, textAlign: 'right' }}>
              “{actionLabel(t.action)}” is configured for this step but has no form on this screen yet.
            </span>
          );
        })}
      </div>
    </div>
  );
}

function UploadInDetails({
  candidateId,
  requestId,
  facilityId,
}: {
  candidateId: string;
  requestId: string;
  facilityId: string;
}) {
  return (
    <details className="pos">
      <summary className="poshead" style={{ cursor: 'pointer', gridTemplateColumns: 'auto 1fr' }}>
        <span className="pnum">
          <CalendarClock size={13} />
        </span>
        <div className="pstage">
          <div className="cell-main">Attach a document</div>
          <span className="tiny muted">Stored privately; only a click here can turn it into a URL.</span>
        </div>
      </summary>
      <div className="pbody">
        <UploadDocumentForm
          requestId={requestId}
          candidateId={candidateId}
          facilityId={facilityId}
          documentTypes={[...DOCUMENT_TYPES]}
        />
      </div>
    </details>
  );
}
