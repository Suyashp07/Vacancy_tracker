'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { AgeCell, Badge, Empty, RequestBadge } from '@/components/ui';
import { fmtCTCBand, fmtDate, fiscalYearLabel } from '@/lib/format';
import { POSITION_LABEL, type RequestStatus } from '@/lib/constants';
import type { Facility } from '@/types/domain';
import type { RequestRow } from '@/server/policy';

const TABS: { key: string; label: string; match: (s: RequestStatus) => boolean }[] = [
  { key: 'all', label: 'All requests', match: () => true },
  { key: 'pending', label: 'Awaiting approval', match: (s) => s === 'submitted_for_vacancy_approval' },
  { key: 'hiring', label: 'Approved & hiring', match: (s) => s === 'approved' },
  { key: 'returned', label: 'Returned', match: (s) => s === 'returned_for_information' },
  { key: 'draft', label: 'Drafts', match: (s) => s === 'draft' },
  { key: 'closed', label: 'Closed / rejected', match: (s) => s === 'closed' || s === 'rejected' },
];

type Params = { q?: string; tab?: string; facility?: string; fy?: string; sort?: string };

function buildHref(base: Params, current: Params): string {
  const merged = { ...current, ...base };
  const search = new URLSearchParams();
  for (const key of ['q', 'tab', 'facility', 'fy', 'sort'] as const) {
    const value = merged[key];
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `/requests?${qs}` : '/requests';
}

export function RequestsRegister({
  rows,
  facilities,
  params,
  tags,
  fy,
  scopeNote,
}: {
  rows: RequestRow[];
  facilities: Facility[];
  params: Params;
  tags: string[];
  fy: string;
  scopeNote: string;
}) {
  const [activeTabKey, setActiveTabKey] = useState<string>(params.tab || 'all');
  const [sortByAge, setSortByAge] = useState<boolean>(params.sort === 'age');
  const [, startTransition] = useTransition();

  const activeTab = useMemo(() => TABS.find((t) => t.key === activeTabKey) ?? TABS[0], [activeTabKey]);

  // Pre-calculate counts for each tab
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: rows.length };
    for (const t of TABS) {
      if (t.key === 'all') continue;
      map[t.key] = rows.filter((r) => t.match(r.request.status)).length;
    }
    return map;
  }, [rows]);

  const visible = useMemo(() => rows.filter((r) => activeTab.match(r.request.status)), [rows, activeTab]);

  const sorted = useMemo(() => {
    if (!sortByAge) return visible;
    return [...visible].sort((a, b) => (b.oldestActiveAge ?? -1) - (a.oldestActiveAge ?? -1));
  }, [visible, sortByAge]);

  function handleTabClick(e: React.MouseEvent, tabKey: string) {
    e.preventDefault();
    startTransition(() => {
      setActiveTabKey(tabKey);
      const newUrl = buildHref({ tab: tabKey }, params);
      window.history.replaceState(null, '', newUrl);
    });
  }

  function handleSortToggle(e: React.MouseEvent) {
    e.preventDefault();
    startTransition(() => {
      const nextSort = !sortByAge;
      setSortByAge(nextSort);
      const newUrl = buildHref({ sort: nextSort ? 'age' : undefined }, params);
      window.history.replaceState(null, '', newUrl);
    });
  }

  return (
    <>
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
          {activeTabKey !== 'all' ? <input type="hidden" name="tab" value={activeTabKey} /> : null}
          {params.facility ? <input type="hidden" name="facility" value={params.facility} /> : null}
          <input type="hidden" name="fy" value={fy} />
        </form>

        <div className="fchips" role="tablist" aria-label="Filter by request stage">
          {TABS.map((t) => {
            const isSelected = t.key === activeTabKey;
            const count = counts[t.key] ?? 0;
            return (
              <button
                type="button"
                key={t.key}
                role="tab"
                aria-selected={isSelected}
                onClick={(e) => handleTabClick(e, t.key)}
                className={`chip ${isSelected ? 'on' : ''}`}
                style={{ cursor: 'pointer', border: 'none', font: 'inherit' }}
              >
                <span>{t.label}</span>
                <span className="tiny tnum" style={{ opacity: isSelected ? 0.95 : 0.65, marginLeft: 6 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="tail">
          <form method="get" action="/requests">
            {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
            {activeTabKey !== 'all' ? <input type="hidden" name="tab" value={activeTabKey} /> : null}
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
          <button
            type="button"
            onClick={handleSortToggle}
            className={`btn sm ${sortByAge ? 'dark' : ''}`}
            title="Sort by the position that has been open longest"
          >
            {sortByAge ? 'Oldest first ✓' : 'Oldest first'}
          </button>
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
                          title={`${p.position_number} · ${POSITION_LABEL[p.status] ?? p.status}`}
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
