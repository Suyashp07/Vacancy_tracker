import Link from 'next/link';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { AgeCell, Badge, Empty, PageHead, RequestBadge } from '@/components/ui';
import { can, type RequestStatus } from '@/lib/constants';
import { fmtCTCBand, fmtDate, fiscalYearLabel, recentFyTags } from '@/lib/format';
import { listFacilities, listRequests } from '@/server/policy';
import { requireActor } from '@/server/session';

export const metadata = { title: 'Vacancy requests' };
export const dynamic = 'force-dynamic';

/** The register's tabs. Each is a statement about the process, not a raw status. */
const TABS: { key: string; label: string; match: (s: RequestStatus) => boolean }[] = [
  { key: 'all', label: 'All requests', match: () => true },
  { key: 'pending', label: 'Awaiting approval', match: (s) => s === 'submitted_for_vacancy_approval' },
  { key: 'hiring', label: 'Approved & hiring', match: (s) => s === 'approved' },
  { key: 'returned', label: 'Returned', match: (s) => s === 'returned_for_information' },
  { key: 'draft', label: 'Drafts', match: (s) => s === 'draft' },
  { key: 'closed', label: 'Closed / rejected', match: (s) => s === 'closed' || s === 'rejected' },
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
      ? 'You see requests you raised. Anything another person started is not listed, not even by number.'
      : can(actor.role, 'view_all_facilities')
        ? 'Every facility is in your scope. Row visibility is decided in Postgres, not in this page.'
        : 'Scoped view - only the facilities assigned to you, plus requests you raised yourself.';

  return (
    <>
      <PageHead
        crumb={`Register · Fiscal year ${fiscalYearLabel(fy)}`}
        title="Vacancy requests"
        note={`${sorted.length} of ${rows.length} request(s) in this view. ${scopeNote}`}
        right={
          can(actor.role, 'raise_vacancy_request') ? (
            <Link href="/requests/new" className="btn primary">
              <Plus size={15} />
              New vacancy request
            </Link>
          ) : null
        }
      />

      <div className="tools">
        <form method="get" action="/requests" className="search">
          <Search size={15} />
          <input
            className="input"
            name="q"
            id="q"
            defaultValue={params.q ?? ''}
            placeholder="Search request number, title, role or facility…"
            aria-label="Search the register"
          />
          {params.tab ? <input type="hidden" name="tab" value={params.tab} /> : null}
          {params.facility ? <input type="hidden" name="facility" value={params.facility} /> : null}
          <input type="hidden" name="fy" value={fy} />
        </form>

        <div className="fchips">
          {TABS.map((t) => (
            <Link key={t.key} href={href({ tab: t.key }, params)} className={`chip ${t.key === tab.key ? 'on' : ''}`}>
              {t.label}
            </Link>
          ))}
        </div>

        <div className="tail">
          <form method="get" action="/requests">
            {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
            {params.tab ? <input type="hidden" name="tab" value={params.tab} /> : null}
            <select
              className="select"
              name="facility"
              aria-label="Filter by facility"
              defaultValue={params.facility ?? ''}
              style={{ minWidth: 168 }}
            >
              <option value="">All facilities in scope</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select className="select" name="fy" aria-label="Fiscal year" defaultValue={fy} style={{ minWidth: 148 }}>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {fiscalYearLabel(t)}
                </option>
              ))}
            </select>
            <button type="submit" className="btn sm">
              Apply
            </button>
          </form>
          <Link
            href={href({ sort: params.sort === 'age' ? undefined : 'age' }, params)}
            className={`btn sm ${params.sort === 'age' ? 'dark' : ''}`}
            title="Sort by the position that has been open longest"
          >
            {params.sort === 'age' ? 'Oldest first ✓' : 'Oldest first'}
          </Link>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {sorted.length === 0 ? (
          <Empty
            title="No requests match this view"
            note="Clear the search, widen the filter, or raise the first request for this facility."
          />
        ) : (
          <table className="reg">
            <thead>
              <tr>
                <th>Request</th>
                <th>Facility</th>
                <th>Headcount</th>
                <th>CTC band</th>
                <th>Raised by</th>
                <th>Ageing</th>
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
                      <span>·</span>
                      <span>{r.request.position_type}</span>
                      {r.request.is_urgent ? (
                        <>
                          <span>·</span>
                          <Badge tone="risk">urgent</Badge>
                        </>
                      ) : null}
                      {r.request.status === 'draft' ? (
                        <>
                          <span>·</span>
                          <span>not yet submitted</span>
                        </>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {r.facility?.name ?? <span className="muted">Unassigned</span>}
                    <div className="cell-id">{r.facility?.code ?? '—'}</div>
                  </td>
                  <td>
                    <span className="tnum">{r.request.quantity}</span>
                    <div className="posmini" aria-hidden>
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
                    </div>
                    <div className="cell-id">
                      {r.openPositions} open · {r.candidateCount} candidate(s)
                    </div>
                  </td>
                  <td className="nowrap">{fmtCTCBand(r.request.ctc_min, r.request.ctc_max)}</td>
                  <td>
                    {r.raisedByName ?? <span className="muted">—</span>}
                    <div className="cell-id">{fmtDate(r.request.submitted_at ?? r.request.created_at)}</div>
                  </td>
                  <td>
                    <AgeCell days={r.oldestActiveAge} sla={21} />
                  </td>
                  <td>
                    <RequestBadge status={r.request.status} />
                  </td>
                  <td>
                    <Link href={`/requests/${r.request.id}`} className="btn ghost sm" aria-label={`Open ${r.request.number}`}>
                      <ChevronRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="regfoot">
        <div>
          {scopeNote} Status words and their colours come from the configured workflow, so the same stage reads the
          same way on every screen.
        </div>
        <div className="tnum">{sorted.length} rows</div>
      </div>
    </>
  );
}

/** The mini map has room for one word per square, and nothing more. */
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
