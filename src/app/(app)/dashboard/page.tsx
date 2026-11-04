import Link from 'next/link';
import { ChevronRight, Download, Plus } from 'lucide-react';
import './dashboard.css';
import {
  AgeCell,
  Badge,
  Card,
  Empty,
  Notice,
  PositionBadge,
  SectionHead,
  Timeline,
  type TimelineEntry,
} from '@/components/ui';
import { MetricsGrid } from '@/components/metrics-grid';
import { ROLE_LABEL, POSITION_LABEL, can, type PositionStatus } from '@/lib/constants';
import { fiscalYearLabel, fmtDuration, recentFyTags } from '@/lib/format';
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

/** Numbers that stay visible even at zero, because "none" is itself an answer. */
const ALWAYS_SHOWN = ['open_positions', 'overdue_actions', 'on_hold'];

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()),
  );
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

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

  // Positions that have been open longer than their allowed time.
  const lateCount = ageing.filter((r) => r.slaDays > 0 && r.ageing.active >= r.slaDays).length;

  // Only showrooms that actually have open positions are listed.
  const busyFacilities = facilities.filter((f) => f.total > 0);
  const quietCount = facilities.length - busyFacilities.length;

  // Worst delay per showroom, so the label next to each bar matches the list above it.
  const facilityState = new Map<string, { tone: 'risk' | 'warn' | 'ok'; ratio: number }>();
  for (const r of ageing) {
    const ratio = r.slaDays > 0 ? r.ageing.active / r.slaDays : 0;
    const cur = facilityState.get(r.facilityName);
    if (!cur || ratio > cur.ratio) {
      facilityState.set(r.facilityName, { ratio, tone: ratio >= 2 ? 'risk' : ratio >= 1 ? 'warn' : 'ok' });
    }
  }
  const CHIP: Record<'risk' | 'warn' | 'ok', string> = { risk: 'Late', warn: 'Watch', ok: 'On track' };

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
      {/* 1. Title, year switch and the main button */}
      <header className="dash-hero">
        <div className="dash-hero-top">
          <div className="grow">
            <h1 className="dash-title">Hiring overview</h1>
            <p className="dash-greet">
              Good {greeting()}, {firstName}.{' '}
              {actor.role === 'Admin'
                ? 'You can see counts only, not candidate details.'
                : tasks.length > 0
                  ? `${tasks.length} ${tasks.length === 1 ? 'decision needs' : 'decisions need'} you.`
                  : 'Nothing needs your decision right now.'}
            </p>
          </div>
          <div className="dash-hero-actions">
            <div className="period" aria-label="Financial year">
              {tags.map((t) => (
                <Link key={t} href={`/dashboard?fy=${t}`} className={t === tag ? 'on' : ''}>
                  {fiscalYearLabel(t)}
                </Link>
              ))}
            </div>
            {canRaise ? (
              <Link href="/requests/new" className="btn primary">
                <Plus size={15} />
                New vacancy request
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* 2. What needs you: a full card only when there is something to do */}
      {tasks.length === 0 ? (
        <div className="dash-note">
          <Notice tone="ok">
            <strong>All clear.</strong> Nothing needs your decision. New decisions appear here when they are sent to you.
          </Notice>
        </div>
      ) : (
        <div className="section">
          <Card className="queue" pad>
            <SectionHead
              title="Needs your decision"
              note={`${tasks.length} waiting`}
              right={
                <Link href="/my-actions" className="ddlink row" style={{ gap: 4 }}>
                  See all <ChevronRight size={14} />
                </Link>
              }
            />
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
                      Waiting {fmtDuration(t.waitingSince)}
                    </Badge>
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 3. Four headline numbers */}
      <div className="stat-strip">
        <Link href="/requests?sort=age" className="stat">
          <div className="stat-label">Open positions</div>
          <div className="stat-num">{metrics.open_positions}</div>
        </Link>
        <Link href="/requests?sort=age" className={`stat ${lateCount > 0 ? 'alert' : ''}`}>
          <div className="stat-label">Running late</div>
          <div className="stat-num">{lateCount}</div>
        </Link>
        <Link href="/on-hold" className={`stat ${metrics.on_hold > 0 ? 'wait' : ''}`}>
          <div className="stat-label">On hold</div>
          <div className="stat-num">{metrics.on_hold}</div>
        </Link>
        <Link href={`/requests?fy=${tag}`} className="stat">
          <div className="stat-label">Joined this year</div>
          <div className="stat-num">{metrics.hired_fy}</div>
        </Link>
      </div>

      {/* 4. Where to look first */}
      <div className="dashgrid">
        <Card className="snap" pad>
          <SectionHead
            title="Needs attention"
            note="Positions open the longest"
            right={
              <Link href="/requests?sort=age" className="ddlink row" style={{ gap: 4 }}>
                All requests <ChevronRight size={14} />
              </Link>
            }
          />
          {ageing.length === 0 ? (
            <Empty title="No open positions" note="Every position is filled or closed." />
          ) : (
            <table className="reg">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Stage</th>
                  <th>Days open</th>
                </tr>
              </thead>
              <tbody>
                {ageing.slice(0, 6).map((r) => (
                  <tr key={r.position.id}>
                    <td>
                      <Link href={`/requests/${r.requestId}`} className="cell-main">
                        {r.position.label}
                      </Link>
                      <div className="cell-id">{r.position.position_number}</div>
                      <div className="tiny muted">{r.facilityName}</div>
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

        <Card className="facilities" pad>
          <SectionHead
            title="Open positions by showroom"
            note={quietCount > 0 ? `${quietCount} more with none open` : undefined}
          />
          {busyFacilities.length === 0 ? (
            <Empty title="No open positions" note="No showroom you can see has an open position." />
          ) : (
            <div className="netload">
              {busyFacilities.map((f) => {
                const st = facilityState.get(f.name) ?? { tone: 'ok' as const, ratio: 0 };
                return (
                  <div className="fbar" key={f.name}>
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
      </div>

      {/* 5. Pipeline */}
      <div className="section">
        <SectionHead
          title="Hiring pipeline"
          note="Positions by stage"
          right={
            can(actor.role, 'reports_export') ? (
              <a href="/api/export?type=candidates" download className="btn sm ghost">
                <Download size={14} />
                Download CSV
              </a>
            ) : null
          }
        />
        <div className="pipe">
          {pipeline.map((p) => (
            <Link
              key={p.status}
              href={`/requests?status=${p.status}`}
              className={`stage ${p.status === 'hold' ? 'st-hold' : ''}`}
            >
              <div className="st-num tnum">{p.positions}</div>
              <div className="st-name">{POSITION_LABEL[p.status as PositionStatus] ?? p.status}</div>
              <div className="st-bar">
                <i style={{ width: `${Math.round((p.positions / maxPipeline) * 100)}%` }} />
              </div>
              {p.held > 0 ? <div className="tiny muted">{p.held} on hold</div> : null}
            </Link>
          ))}
          {pipeline.length === 0 ? <Empty title="Nothing in the pipeline" note="Raise a request to start one." /> : null}
        </div>
      </div>

      {/* 6. Recent activity */}
      <div className="section">
        <Card pad>
          <SectionHead title="Recent activity" />
          {entries.length === 0 ? (
            <Empty
              title={can(actor.role, 'activity_timeline') ? 'No activity yet' : 'Not available for your role'}
              note={
                can(actor.role, 'activity_timeline')
                  ? 'Approvals and status changes will show up here.'
                  : 'You can follow progress on your own screens.'
              }
            />
          ) : (
            <Timeline entries={entries} />
          )}
        </Card>
      </div>

      {/* 7. Extra numbers, hidden until wanted */}
      <details className="section more-numbers">
        <summary className="btn sm ghost">Show more numbers</summary>
        <div style={{ marginTop: 12 }}>
          <MetricsGrid tiles={tiles.filter((t) => t.value > 0 || ALWAYS_SHOWN.includes(t.key))} />
        </div>
      </details>
    </>
  );
}
