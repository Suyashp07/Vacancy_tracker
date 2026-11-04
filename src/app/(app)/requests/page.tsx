import Link from 'next/link';
import { ChevronRight, Download, Plus, Search } from 'lucide-react';
import './requests.css';
import { AgeCell, Badge, Empty, PageHead, RequestBadge } from '@/components/ui';
import { can, type RequestStatus } from '@/lib/constants';
import { fmtCTCBand, fmtDate, fiscalYearLabel, recentFyTags } from '@/lib/format';
import { listFacilities, listRequests } from '@/server/policy';
import { requireActor } from '@/server/session';

export const metadata = { title: 'Vacancy requests' };
export const dynamic = 'force-dynamic';

const TABS: { key: string; label: string; match: (s: RequestStatus) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'pending', label: 'Awaiting approval', match: (s) => s === 'submitted_for_vacancy_approval' },
  { key: 'hiring', label: 'Hiring', match: (s) => s === 'approved' },
  { key: 'returned', label: 'Returned', match: (s) => s === 'returned_for_information' },
  { key: 'draft', label: 'Drafts', match: (s) => s === 'draft' },
  { key: 'closed', label: 'Closed', match: (s) => s === 'closed' || s === 'rejected' },
];

type Params = { q?: string; tab?: string; facility?: string; fy?: string; sort?: string };

function href(base: Params, current: Params): string {
  const merged = { ...current, ...base };
  const search = new URLSearchParams();
  for (const key of ['q', 'tab', 'facility', 'fy', 'sort'] as const) {
    const value = merged[key];
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `/requests?${qs}` : '/requests';
}

const POSITION_SHORT: Record<string, string> = {
  draft: 'draft',
  awaiting_vacancy_approval: 'awaiting approval',
  approved: 'approved',
  sourcing: 'sourcing',
  candidate_available: 'candidate available',
  sent_for_candidate_approval: 'awaiting decision',
  hold: 'on hold',
  approved_for_joining: 'approved for joining',
  hired: 'hired',
  position_closed: 'closed',
  candidature_unsuccessful: 'unsuccessful',
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const tab = TABS.find((t) => t.key === params.tab) ?? TABS[0];
  const tags = recentFyTags();
  const fy = tags.includes(params.fy ?? '') ? (params.fy as string) : tags[0];

  const [rows, facilities] = await Promise.all([
    listRequests(actor, { status: 'all', search: params.q, facilityId: params.facility, fy }),
    listFacilities(),
  ]);

  const visible = rows.filter((r) => tab.match(r.request.status));
  const sorted =
    params.sort === 'age'
      ? [...visible].sort((a, b) => (b.oldestActiveAge ?? -1) - (a.oldestActiveAge ?? -1))
      : visible;

  const scopeNote =
    actor.role === 'Employee'
      ? 'Requests you raised.'
      : can(actor.role, 'view_all_facilities')
        ? 'All showrooms.'
        : 'Your showrooms, and requests you raised.';

  return (
    <>
      <PageHead
        title="Vacancy requests"
        note={`${fiscalYearLabel(fy)} · ${scopeNote}`}
        right={
          <div className="row" style={{ gap: 8 }}>
            {can(actor.role, 'reports_export') ? (
              <a href="/api/export?type=requests" download className="btn sm ghost">
                <Download size={14} />
                Download CSV
              </a>
            ) : null}
            {can(actor.role, 'raise_vacancy_request') ? (
              <Link href="/requests/new" className="btn primary">
                <Plus size={15} />
                New vacancy request
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href({ tab: t.key }, params)}
            className={`tab ${t.key === tab.key ? 'on' : ''}`.trim()}
            role="tab"
            aria-selected={t.key === tab.key}
          >
            {t.label}
            <span className="n tnum">{rows.filter((r) => t.match(r.request.status)).length}</span>
          </Link>
        ))}
      </div>

      <form method="get" action="/requests" className="reqbar">
        <div className="search">
          <Search size={15} />
          <input
            className="input"
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search by title, number or showroom"
            aria-label="Search requests"
          />
        </div>
        {params.tab ? <input type="hidden" name="tab" value={params.tab} /> : null}
        <select className="select" name="facility" aria-label="Showroom" defaultValue={params.facility ?? ''}>
          <option value="">All showrooms</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select className="select" name="fy" aria-label="Financial year" defaultValue={fy}>
          {tags.map((t) => (
            <option key={t} value={t}>
              {fiscalYearLabel(t)}
            </option>
          ))}
        </select>
        <select className="select" name="sort" aria-label="Sort" defaultValue={params.sort ?? ''}>
          <option value="">Newest first</option>
          <option value="age">Open longest first</option>
        </select>
        <button type="submit" className="btn">
          Apply
        </button>
      </form>

      <div className="card" style={{ overflow: 'hidden' }}>
        {sorted.length === 0 ? (
          <Empty
            title="No requests found"
            note="Try another tab, clear the search, or raise a new request."
          />
        ) : (
          <div className="scroll-x">
            <table className="reg reqtable">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Showroom</th>
                  <th>Positions</th>
                  <th>Pay per month</th>
                  <th>Raised by</th>
                  <th>Open for</th>
                  <th>Status</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.request.id} className="reqrow">
                    <td>
                      <Link href={`/requests/${r.request.id}`} className="cell-main">
                        <span className="ttl">{r.request.title}</span>
                      </Link>
                      <div className="subrow">
                        <span className="mono">{r.request.number}</span>
                        <span>{r.request.position_type}</span>
                        {r.request.is_urgent ? <Badge tone="risk">Urgent</Badge> : null}
                      </div>
                    </td>
                    <td className="where">{r.facility?.name ?? <span className="muted">Not set</span>}</td>
                    <td>
                      <div className="posline">
                        <span className="tnum">
                          {r.openPositions} open of {r.request.quantity}
                        </span>
                        <span className="posmini" aria-hidden style={{ marginTop: 0 }}>
                          {r.positions.slice(0, 12).map((p) => (
                            <i
                              key={p.id}
                              className={
                                p.status === 'hired'
                                  ? 'hired'
                                  : p.status === 'hold'
                                    ? 'hold'
                                    : ['position_closed', 'candidature_unsuccessful'].includes(p.status)
                                      ? 'dead'
                                      : 'live'
                              }
                              title={`${p.position_number} · ${POSITION_SHORT[p.status] ?? p.status}`}
                            />
                          ))}
                        </span>
                      </div>
                      <div className="tiny muted">
                        {r.candidateCount} {r.candidateCount === 1 ? 'candidate' : 'candidates'}
                      </div>
                    </td>
                    <td className="nowrap">{fmtCTCBand(r.request.ctc_min, r.request.ctc_max)}</td>
                    <td>
                      {r.raisedByName ?? <span className="muted">—</span>}
                      <div className="tiny muted">{fmtDate(r.request.submitted_at ?? r.request.created_at)}</div>
                    </td>
                    <td>
                      <AgeCell days={r.oldestActiveAge} sla={21} />
                    </td>
                    <td>
                      <RequestBadge status={r.request.status} />
                    </td>
                    <td>
                      <ChevronRight size={16} className="muted" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="tiny muted" style={{ marginTop: 12 }}>
        Showing {sorted.length} of {rows.length} requests.
      </p>
    </>
  );
}
