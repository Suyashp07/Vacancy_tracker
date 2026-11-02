import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import './dashboard.css';
import {
  AgeCell,
  Badge,
  Card,
  Empty,
  PositionBadge,
  SectionHead,
  Timeline,
  type TimelineEntry,
} from '@/components/ui';
import { MetricsGrid } from '@/components/metrics-grid';
import { LiveClock } from '@/components/live-clock';
import { ROLE_LABEL, POSITION_LABEL, can, type PositionStatus } from '@/lib/constants';
import { fiscalYearLabel, fiscalYearTag, fmtDate, fmtDuration, recentFyTags } from '@/lib/format';
import { requireActor } from '@/server/session';
import {
  getActivity,
  getAgeingRows,
  getFacilityBreakdown,
  getMetrics,
  getPipeline,
  getTasks,
} from '@/server/policy';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const actor = await requireActor();
  const { fy } = await searchParams;
  const tags = recentFyTags();
  const tag = tags.includes(fy ?? '') ? (fy as string) : tags[0];

  const [{ metrics, tiles }, tasks, ageing, pipeline, facilities, activity] = await Promise.all([
    getMetrics(actor, tag),
    getTasks(actor),
    getAgeingRows(actor),
    getPipeline(actor),
    getFacilityBreakdown(actor),
    can(actor.role, 'activity_timeline') ? getActivity(actor, 9) : Promise.resolve([]),
  ]);

  const canRaise = can(actor.role, 'raise_vacancy_request');
  const maxPipeline = Math.max(1, ...pipeline.map((p) => p.positions));
  const maxFacility = Math.max(1, ...facilities.map((f) => f.total));

  const firstName = actor.name.split(' ')[0];
  const overdueCount = tasks.filter((t) => t.slaState === 'overdue').length;

  // Worst per-facility SLA pressure, derived from the same ageing rows the stall
  // list uses, so the network-load chip and the register can never disagree.
  const facilityState = new Map<string, { tone: 'risk' | 'warn' | 'ok'; ratio: number }>();
  for (const r of ageing) {
    const ratio = r.slaDays > 0 ? r.ageing.active / r.slaDays : 0;
    const cur = facilityState.get(r.facilityName);
    if (!cur || ratio > cur.ratio) {
      facilityState.set(r.facilityName, { ratio, tone: ratio >= 2 ? 'risk' : ratio >= 1 ? 'warn' : 'ok' });
    }
  }
  const CHIP: Record<'risk' | 'warn' | 'ok', string> = { risk: 'Overdue SLA', warn: 'Watch', ok: 'Optimal' };

  const entries: TimelineEntry[] = activity.map((a) => ({
    key: a.key,
    when: a.occurred_at,
    variant: a.tone === 'risk' ? 'riskev' : a.tone === 'ok' ? 'decision' : a.tone === 'hold' ? 'hold' : 'key',
    what: (
      <span>
        {a.detail}
        {a.entity_ref ? <span className="mono muted"> · {a.entity_ref}</span> : null}
      </span>
    ),
    who: a.actor_name,
    role: a.actor_role ? ROLE_LABEL[a.actor_role] : null,
    note: a.reason ? <span className="sub">“{a.reason}”</span> : null,
  }));

  return (
    <>
      <header className="dash-hero reveal">
        <div className="dash-hero-top">
          <div className="grow">
            <div className="crumb" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Fiscal year {fiscalYearLabel(tag)} · India</span>
              <LiveClock />
            </div>
            <h1 className="dash-title">
              Executive <em>Hiring Command</em>
            </h1>
            <p className="dash-greet">
              Good {greeting()}, {firstName}.{' '}
              {actor.role === 'Admin'
                ? 'Administration holds no hiring power, so the queues below show only what an Admin is permitted to see: counts, never candidate identities.'
                : tasks.length > 0
                  ? `${tasks.length} decision${tasks.length === 1 ? '' : 's'} is waiting on you. Nothing here expires silently - each row says how long it has been waiting.`
                  : 'Nothing is waiting on your decision right now. This screen is also where a stalled position becomes visible before it becomes a problem.'}
            </p>
          </div>
          <div className="dash-hero-actions">
            <div className="period">
              {tags.map((t) => (
                <Link key={t} href={`/dashboard?fy=${t}`} className={t === tag ? 'on' : ''}>
                  {fiscalYearLabel(t)}
                </Link>
              ))}
            </div>
            {canRaise ? (
              <Link href="/requests/new" className="btn primary">
                <Plus size={15} />
                Raise a vacancy request
              </Link>
            ) : null}
          </div>
        </div>

        <div className="stat-strip">
          <Link href="/requests?sort=age" className="stat">
            <div className="stat-label">Open positions</div>
            <div className="stat-num">
              {metrics.open_positions}
              <small>in your scope</small>
            </div>
          </Link>
          <Link href="/my-actions" className={`stat ${overdueCount > 0 ? 'alert' : ''}`}>
            <div className="stat-label">Waiting on you</div>
            <div className="stat-num">
              {tasks.length}
              <small>{overdueCount > 0 ? `${overdueCount} overdue` : 'decisions'}</small>
            </div>
          </Link>
          <Link href="/on-hold" className={`stat ${metrics.on_hold > 0 ? 'wait' : ''}`}>
            <div className="stat-label">On hold</div>
            <div className="stat-num">
              {metrics.on_hold}
              <small>paused</small>
            </div>
          </Link>
          <Link href={`/requests?fy=${tag}`} className="stat">
            <div className="stat-label">Joined · FY {fiscalYearLabel(tag)}</div>
            <div className="stat-num">
              {metrics.hired_fy}
              <small>confirmed</small>
            </div>
          </Link>
        </div>
      </header>

      <MetricsGrid tiles={tiles.filter((t) => t.value > 0 || ALWAYS_SHOWN.includes(t.key))} />


      <div className="dashgrid">
        <Card className="queue" reveal={1}>
          <SectionHead
            title="Waiting on you"
            note={tasks.length ? `${tasks.length} open decision${tasks.length === 1 ? '' : 's'}` : undefined}
            right={
              <Link href="/my-actions" className="ddlink row" style={{ gap: 4 }}>
                All actions <ChevronRight size={13} />
              </Link>
            }
          />
          {tasks.length === 0 ? (
            <Empty title="Your desk is clear" note="Approval tasks appear here the moment someone routes a decision to your role." />
          ) : (
            <div className="qbody">
              {tasks.slice(0, 5).map((t) => (
                <Link key={t.task.id} href={t.href} className={`qrow ${t.slaState}`}>
                  <span className="qtype">{t.task.task_type.replace(/_/g, ' ')}</span>
                  <span className="qtitle">
                    {t.entityLabel}
                    <span className="qsub"> · {t.facilityName}</span>
                  </span>
                  <span className="qright">
                    <Badge tone={t.slaState === 'overdue' ? 'risk' : t.slaState === 'warning' ? 'wait' : 'neutral'}>
                      {fmtDuration(t.waitingSince)}
                    </Badge>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="snap" reveal={2}>
          <SectionHead title="Where positions are stuck" note="Oldest active time first, hold days excluded" right={
            <Link href="/requests?sort=age" className="ddlink row" style={{ gap: 4 }}>
              Register <ChevronRight size={13} />
            </Link>
          } />
          {ageing.length === 0 ? (
            <Empty title="No open positions" note="Every position you can see is either filled or closed." />
          ) : (
            <table className="reg">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Stage</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {ageing.slice(0, 6).map((r) => (
                  <tr key={r.position.id}>
                    <td>
                      <Link href={`/requests/${r.requestId}`} className="cell-main">
                        {r.position.label}
                      </Link>
                      <div className="cell-id">
                        {r.position.position_number} · {r.facilityName}
                      </div>
                    </td>
                    <td>
                      <PositionBadge status={r.position.status} />
                    </td>
                    <td>
                      <AgeCell days={r.ageing.active} sla={r.slaDays} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="section reveal d3">
        <SectionHead title="Pipeline" note="Positions you can see, by stage. Hold time is its own stage, never hidden inside sourcing." />
        <div className="pipe">
          {pipeline.map((p) => (
            <Link key={p.status} href={`/requests?status=${p.status}`} className={`stage ${p.status === 'hold' ? 'st-hold' : ''}`}>
              <div className="st-num tnum">{p.positions}</div>
              <div className="st-name">{POSITION_LABEL[p.status as PositionStatus] ?? p.status}</div>
              <div className="st-bar">
                <i style={{ width: `${Math.round((p.positions / maxPipeline) * 100)}%` }} />
              </div>
              {p.held > 0 ? <div className="tiny muted">{p.held} held</div> : null}
            </Link>
          ))}
          {pipeline.length === 0 ? <Empty title="Nothing in the pipeline" note="Raise a request to start one." /> : null}
        </div>
      </div>

      <div className="dashgrid">
        <Card className="facilities" reveal={1}>
          <SectionHead
            title="Facility network load"
            note={`Open positions by location, FY ${fiscalYearLabel(tag)} onwards, as visible to you`}
            right={
              <Link href="/requests" className="ddlink row" style={{ gap: 4 }}>
                Register <ChevronRight size={13} />
              </Link>
            }
          />
          {facilities.length === 0 ? (
            <Empty title="No facilities in your scope" note="An Admin assigns which locations you can see." />
          ) : (
            <div className="netload">
              {facilities.map((f, i) => {
                const st = facilityState.get(f.name) ?? { tone: 'ok' as const, ratio: 0 };
                return (
                  <div className="fbar" key={f.name}>
                    <span className="frank">{String(i + 1).padStart(2, '0')}</span>
                    <span className="fname">{f.name}</span>
                    <span className={`track ${st.tone}`}>
                      <i style={{ width: `${Math.round((f.total / maxFacility) * 100)}%` }} />
                    </span>
                    <span className="fval">{f.total}</span>
                    <span className={`fchip ${st.tone}`}>{CHIP[st.tone]}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="activity" reveal={2}>
          <SectionHead
            title="Activity"
            note={
              activity.length
                ? 'Business events only. Candidate names and documents never appear in a shared timeline.'
                : undefined
            }
          />
          <div style={{ padding: '2px 18px 18px' }}>
            {entries.length === 0 ? (
              <Empty
                title={can(actor.role, 'activity_timeline') ? 'No recorded movement yet' : 'Not available for your role'}
                note={
                  can(actor.role, 'activity_timeline')
                    ? 'The first approval or status change will show up here.'
                    : 'Your role sees outcomes on its own screens rather than the company-wide trail.'
                }
              />
            ) : (
              <Timeline entries={entries} />
            )}
          </div>
        </Card>
      </div>

      <p className="tiny muted" style={{ marginTop: 26, maxWidth: '88ch' }}>
        Numbers cover {metrics.total_positions_in_fy} position record(s) raised in fiscal year {fiscalYearTag(null, new Date()) === tag ? 'the current' : 'the selected'} year and
        only what your role and facilities are entitled to see. {metrics.candidates_without_photo > 0 && can(actor.role, 'add_candidate') ? (
          <span style={{ color: 'var(--warn)' }}>
            {metrics.candidates_without_photo} live candidate record(s) still have no photograph attached - they cannot be
            sent for approval without one unless an exception is recorded.
          </span>
        ) : null} Last computed {fmtDate(new Date().toISOString())}.
      </p>
    </>
  );
}

/** Tiles that stay visible even at zero, because "none" is itself the answer. */
const ALWAYS_SHOWN = ['open_positions', 'overdue_actions', 'on_hold'];

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()),
  );
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}
