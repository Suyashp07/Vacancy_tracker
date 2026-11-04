import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
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
        title="My actions"
        note="Decisions that are waiting for you. Each one disappears when you act on it."
        right={
          <div className="row" style={{ gap: 6 }}>
            {(['all', 'overdue', 'urgent'] as Filter[]).map((f) => (
              <Link key={f} href={f === 'all' ? '/my-actions' : `/my-actions?filter=${f}`} className={`chip ${f === filter ? 'on' : ''}`.trim()}>
                {f === 'all' ? 'All' : f === 'overdue' ? `Late${overdue ? ` · ${overdue}` : ''}` : 'Urgent'}
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
              <div className="k">Waiting</div>
            </div>
            <div className="stat">
              <div className="v tnum" style={{ color: overdue ? 'var(--risk)' : undefined }}>
                {overdue}
              </div>
              <div className="k">Late</div>
            </div>
            <div className="stat">
              <div className="v tnum">{Math.round(oldest)}d</div>
              <div className="k">Longest wait</div>
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="card">
              <div className="clear">
                <div className="mark">
                  <CheckCircle2 size={21} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>All clear</div>
                <div className="sub" style={{ marginTop: 5 }}>
                  Nothing is waiting for you{filter === 'all' ? '' : ' in this filter'}.
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
              {groups.map((g) => (
                <div className="group" key={g.type}>
                  <div className="gh">
                    <h3>{TASK_GROUP[g.type].label}</h3>
                    <span className="n">{g.items.length}</span>
                    <span className="sla">{TASK_GROUP[g.type].note}</span>
                  </div>
                  {g.items.map((t) => (
                    <TaskRow key={t.task.id} item={t} mine={t.task.requested_by === actor.id} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="section-head">
            <h2>Recent updates</h2>
          </div>
          <div className="card pad">
            {notifications.length === 0 ? (
              <Empty title="Nothing new" note="Updates about your requests will appear here." />
            ) : (
              notifications.map((n) => (
                <div className="drow" key={n.id}>
                  <span>
                    <b style={{ fontWeight: 500 }}>{n.title}</b>
                    <div className="tiny muted">{n.body ?? ''}</div>
                  </span>
                  <span className="tiny mono nowrap">
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

          <details className="card pad" style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 500 }}>What do these tasks mean?</summary>
            <div className="col" style={{ marginTop: 12, gap: 10 }}>
              {ORDER.map((type) => (
                <div className="howrow" key={type}>
                  <Badge tone={TASK_GROUP[type].tone}>{TASK_GROUP[type].label.split(' ')[0]}</Badge>
                  <span className="muted">{TASK_GROUP[type].note}</span>
                </div>
              ))}
            </div>
          </details>
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

  // You cannot decide on something you raised yourself, so no buttons are shown for it.
  const blocked = mine && (task.task_type === 'vacancy_approval' || task.task_type === 'candidate_approval');

  return (
    <div className={`task ${state === 'overdue' ? 'over' : state === 'warning' ? 'soon' : ''}`.trim()}>
      <div className="rail" />
      <div>
        <div className="tk-title">
          <Link href={item.href} className="link">
            {item.entityLabel}
          </Link>
          {task.priority === 'high' ? <Badge tone="risk">Urgent</Badge> : null}
        </div>
        <div className="tk-sub">
          <span className="cell-id">{item.entityNumber}</span>
          <span>{item.facilityName}</span>
          <AgeCell days={ageDays} sla={slaDays} />
          {task.due_at ? <span>Due {fmtDate(task.due_at)}</span> : null}
          {item.requestedByName ? <span>From {item.requestedByName}</span> : null}
        </div>
      </div>

      <div className="tk-right">
        <div className="quick">
          {blocked ? (
            <span className="tiny muted tk-note">You raised this, so someone else has to decide.</span>
          ) : (
            <>
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
                    intro="Goes back to the requester with your question attached."
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
                    intro="The person may join. HR confirms the joining date as a separate step."
                  />
                  <ActionForm
                    run={decide}
                    args={[task.entity_id, item.requestId, 'reject']}
                    label="Reject"
                    variant="danger"
                    requireReason
                    requireComment
                    intro="This cannot be undone and starts the deletion clock on their data."
                  />
                </>
              ) : null}
            </>
          )}

          {task.task_type === 'hold_review' && task.position_id ? (
            <ActionForm
              run={resume}
              args={[task.position_id, item.requestId]}
              label="Resume"
              variant="default"
              requireComment
              commentLabel="Why it is back on"
              intro="Puts the position back at the stage it was held at."
            />
          ) : null}

          <Link href={item.href} className="btn sm ghost">
            Open
          </Link>
        </div>
      </div>
    </div>
  );
}
