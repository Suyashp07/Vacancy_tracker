import Link from 'next/link';
import { CheckCircle2, Inbox } from 'lucide-react';
import './my-actions.css';
import { ActionForm } from '@/components/action-form';
import { AgeCell, Badge, Empty, PageHead } from '@/components/ui';
import { TASK_GROUP, type TaskType } from '@/lib/constants';
import { fmtDate, fmtDuration } from '@/lib/format';
import { getNotifications, getTasks } from '@/server/policy';
import { requireActor } from '@/server/session';
import { actOnRequest, decide, resume } from '@/server/actions';
import type { TaskListItem } from '@/types/domain';

export const metadata = { title: 'My Actions' };
export const dynamic = 'force-dynamic';

const ORDER: TaskType[] = [
  'vacancy_approval',
  'candidate_approval',
  'hold_review',
  'joining_confirmation',
  'budget_review',
  'clarification',
];

type Filter = 'all' | 'overdue' | 'urgent';

export default async function MyActionsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const filter: Filter = params.filter === 'overdue' || params.filter === 'urgent' ? params.filter : 'all';

  const [tasks, notifications] = await Promise.all([getTasks(actor), getNotifications(actor, 8)]);

  const shown = tasks.filter((t) =>
    filter === 'all' ? true : filter === 'overdue' ? t.slaState === 'overdue' : t.task.priority === 'high' || t.slaState !== 'within',
  );
  const overdue = tasks.filter((t) => t.slaState === 'overdue').length;
  const oldest = tasks.reduce((max, t) => Math.max(max, (Date.now() - new Date(t.waitingSince).getTime()) / 86_400_000), 0);

  const groups = ORDER.map((type) => ({ type, items: shown.filter((t) => t.task.task_type === type) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <>
      <PageHead
        crumb="My Actions"
        title={`Waiting on ${actor.name.split(' ')[0]}`}
        note="This queue is built by the workflow, not by a person assigning work. A task exists because the step is yours, and it closes in the same transaction as the decision."
        right={
          <div className="row" style={{ gap: 6 }}>
            {(['all', 'overdue', 'urgent'] as Filter[]).map((f) => (
              <Link key={f} href={f === 'all' ? '/my-actions' : `/my-actions?filter=${f}`} className={`chip ${f === filter ? 'on' : ''}`.trim()}>
                {f === 'all' ? 'Everything' : f === 'overdue' ? `Overdue${overdue ? ` · ${overdue}` : ''}` : 'Urgent'}
              </Link>
            ))}
          </div>
        }
      />

      <div className="split">
        <div>
          <div className="statline">
            <div className="stat">
              <div className="v tnum">{tasks.length}</div>
              <div className="k">Awaiting you</div>
            </div>
            <div className="stat">
              <div className="v tnum" style={{ color: overdue ? 'var(--risk)' : undefined }}>
                {overdue}
              </div>
              <div className="k">Past their SLA</div>
            </div>
            <div className="stat">
              <div className="v tnum">{Math.round(oldest)}d</div>
              <div className="k">Oldest wait</div>
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="card">
              <div className="clear">
                <div className="mark">
                  <CheckCircle2 size={21} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Queue clear</div>
                <div className="sub" style={{ marginTop: 5, maxWidth: '42ch', marginInline: 'auto' }}>
                  Nothing is waiting on you{filter === 'all' ? '' : ' in this filter'}. Decisions you already took stay
                  on the record, not here.
                </div>
                {tasks.length > 0 && filter !== 'all' ? (
                  <Link href="/my-actions" className="btn sm" style={{ marginTop: 12 }}>
                    Show everything
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="card">
              {groups.map((g, i) => (
                <div key={g.type}>
                  {i > 0 ? <div style={{ height: 1, background: 'var(--line-soft)' }} /> : null}
                  <div className="group" style={{ padding: '14px 16px', marginBottom: i === groups.length - 1 ? 0 : 22 }}>
                    <div className="gh">
                      <h3>{TASK_GROUP[g.type].label}</h3>
                      <span className="n">{g.items.length}</span>
                      <span className="sla">{TASK_GROUP[g.type].note}</span>
                    </div>
                    {g.items.map((t) => (
                      <TaskRow key={t.task.id} item={t} mine={t.task.requested_by === actor.id} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="card pad">
            <div className="section-head" style={{ margin: '0 0 8px' }}>
              <h2>How this queue is built</h2>
            </div>
            <div className="sub" style={{ fontSize: 12.5 }}>
              Tasks are rows in <span className="mono">approval_tasks</span>, created by the same database function that
              moved the record. Nobody can be assigned a task by hand, and completing one settles it.
            </div>
            <div className="col" style={{ marginTop: 14, gap: 9 }}>
              {ORDER.map((type) => (
                <div className="howrow" key={type}>
                  <Badge tone={TASK_GROUP[type].tone}>{TASK_GROUP[type].label.split(' ')[0]}</Badge>
                  <span className="muted">{TASK_GROUP[type].note}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="section-head" style={{ marginTop: 20 }}>
            <h2>Notified you</h2>
            <span className="note">in-app only</span>
          </div>
          <div className="card pad">
            {notifications.length === 0 ? (
              <Empty title="Nothing new" note="Notifications are created by the same transitions that create tasks." />
            ) : (
              notifications.map((n) => (
                <div className="drow" key={n.id}>
                  <span className="muted">
                    {n.title}
                    <div className="tiny" style={{ color: 'var(--ink-3)' }}>
                      {n.body ?? ''}
                    </div>
                  </span>
                  <span className="tiny mono">
                    {n.link ? (
                      <Link href={n.link} className="link">
                        {fmtDuration(n.created_at)}
                      </Link>
                    ) : (
                      fmtDuration(n.created_at)
                    )}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="notice info" style={{ marginTop: 16 }}>
            <Inbox size={16} />
            <div>
              In-app notifications only in this release. No email, no WhatsApp, no reminder automation — an overdue
              decision has to be visible where the work is done, which is this screen.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TaskRow({ item, mine }: { item: TaskListItem; mine: boolean }) {
  const { task } = item;
  const state = item.slaState;
  const slaDays = (task.sla_hours ?? 72) / 24;
  const ageDays = (Date.now() - new Date(item.waitingSince).getTime()) / 86_400_000;

  return (
    <div className={`task ${state === 'overdue' ? 'over' : state === 'warning' ? 'soon' : ''}`.trim()}>
      <div className="rail" />
      <div>
        <div className="tk-title">
          <Link href={item.href} className="link">
            {item.entityLabel}
          </Link>
          {task.priority === 'high' ? <Badge tone="risk">Urgent</Badge> : null}
          {mine ? <Badge tone="wait">you raised this · self-decision is blocked</Badge> : null}
        </div>
        <div className="tk-sub">
          <span className="cell-id">{item.entityNumber}</span>
          <span>·</span>
          <span>{item.facilityName}</span>
          <span>·</span>
          <AgeCell days={ageDays} sla={slaDays} />
          {task.due_at ? (
            <>
              <span>·</span>
              <span>due {fmtDate(task.due_at)}</span>
            </>
          ) : null}
          {item.requestedByName ? (
            <>
              <span>·</span>
              <span>from {item.requestedByName}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="tk-right">
        <div className="quick">
          {task.entity_type === 'vacancy_request' && task.task_type === 'vacancy_approval' ? (
            <>
              <ActionForm
                run={actOnRequest}
                args={[task.entity_id, 'approve']}
                label="Approve"
                variant="primary"
                submitLabel="Approve the vacancy"
                intro="Creates the positions and releases them to sourcing."
              />
              <ActionForm
                run={actOnRequest}
                args={[task.entity_id, 'return_for_information']}
                label="Return"
                variant="default"
                requireReason
                requireComment
                intro="Goes back to the requester with your question attached, and the clock keeps running."
              />
            </>
          ) : null}

          {task.entity_type === 'candidate' && task.task_type === 'candidate_approval' ? (
            <>
              <ActionForm
                run={decide}
                args={[task.entity_id, item.requestId, 'approve_for_joining']}
                label="Approve"
                variant="primary"
                submitLabel="Approve for joining"
                intro="The person may join. Confirming that they did is a separate step for HR."
              />
              <ActionForm
                run={decide}
                args={[task.entity_id, item.requestId, 'reject']}
                label="Reject"
                variant="danger"
                requireReason
                requireComment
                intro="Permanent, readable by everyone on the record, and it starts the deletion clock on their data."
              />
            </>
          ) : null}

          {task.task_type === 'hold_review' && task.position_id ? (
            <ActionForm
              run={resume}
              args={[task.position_id, item.requestId]}
              label="Resume"
              variant="default"
              requireComment
              commentLabel="Why it is back on"
              intro="Restores the exact stage the position was held at. If it should stay held, leave the task open — the reason is already on record."
            />
          ) : null}

          <Link href={item.href} className="btn sm ghost">
            Open the record
          </Link>
        </div>
      </div>
    </div>
  );
}
