import Link from 'next/link';
import { Badge, Empty, Notice, PageHead, RequestBadge } from '@/components/ui';
import { type Tone } from '@/lib/constants';
import { daysSince, fmtDate, fmtDuration, fiscalYearLabel, recentFyTags } from '@/lib/format';
import { getClosed, listRetentionPolicies, type ClosedRow } from '@/server/policy';
import { requireActor } from '@/server/session';

export const metadata = { title: 'Closed' };
export const dynamic = 'force-dynamic';

type OutcomeKey = 'all' | 'filled' | 'partial' | 'nohire' | 'rejected';

const OUTCOMES: { key: OutcomeKey; label: string; match: (o: OutcomeKey) => boolean }[] = [
  { key: 'all', label: 'Every ended request', match: () => true },
  { key: 'filled', label: 'Filled', match: (o) => o === 'filled' },
  { key: 'partial', label: 'Partly filled', match: (o) => o === 'partial' },
  { key: 'nohire', label: 'Closed without a hire', match: (o) => o === 'nohire' },
  { key: 'rejected', label: 'Rejected', match: (o) => o === 'rejected' },
];

/** What actually came out of the request, measured against the headcount asked for. */
function outcomeOf(row: ClosedRow): { key: OutcomeKey; label: string; tone: Tone; filled: number } {
  if (row.request.status === 'rejected') return { key: 'rejected', label: 'Rejected', tone: 'risk', filled: 0 };
  const filled = row.positions.filter((p) => p.status === 'hired').length;
  const asked = row.request.quantity || row.positions.length;
  if (filled === 0) return { key: 'nohire', label: 'Closed without a hire', tone: 'neutral', filled };
  if (asked > 0 && filled >= asked) return { key: 'filled', label: 'Filled', tone: 'ok', filled };
  return { key: 'partial', label: 'Partly filled', tone: 'wait', filled };
}

export default async function ClosedPage({ searchParams }: { searchParams: Promise<{ fy?: string; outcome?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const tags = recentFyTags();
  const fy = tags.includes(params.fy ?? '') ? (params.fy as string) : tags[0];
  const outcome = OUTCOMES.find((o) => o.key === params.outcome) ?? OUTCOMES[0];

  const [allRows, retention] = await Promise.all([getClosed(actor, { fy }), listRetentionPolicies()]);
  const decorated = allRows.map((row) => ({ row, result: outcomeOf(row) }));
  const shown = decorated.filter((d) => outcome.match(d.result.key));

  const filledPositions = decorated.reduce((sum, d) => sum + d.result.filled, 0);
  const rejected = decorated.filter((d) => d.result.key === 'rejected').length;
  const durations = decorated
    .map((d) => {
      const endedAt = d.row.request.closed_at ?? d.row.ending?.at ?? null;
      const startedAt = d.row.request.submitted_at ?? d.row.request.created_at;
      const a = daysSince(startedAt);
      const b = daysSince(endedAt);
      return a !== null && b !== null ? b - a : null;
    })
    .filter((n): n is number => n !== null && n >= 0);
  const avgDays = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const holdDays = (category: string) => retention.find((p) => p.data_category === category)?.retention_days ?? null;

  return (
    <>
      <PageHead
        crumb={`Register · Outcomes · Fiscal year ${fiscalYearLabel(fy)}`}
        title="Closed & rejected"
        note="An ended requirement stays as evidence of a decision: who took it, when, on what reason. What is deleted on the clock is a person's data, never the account of what was done."
      />

      <div className="tools">
        <div className="fchips">
          {OUTCOMES.map((o) => (
            <Link
              key={o.key}
              href={`/closed?outcome=${o.key}&fy=${fy}`}
              className={`chip ${o.key === outcome.key ? 'on' : ''}`}
            >
              {o.label}
            </Link>
          ))}
        </div>
        <div className="tail">
          <form method="get" action="/closed">
            {outcome.key !== 'all' ? <input type="hidden" name="outcome" value={outcome.key} /> : null}
            <select
              className="select"
              name="fy"
              aria-label="Fiscal year"
              defaultValue={fy}
              style={{ minWidth: 148 }}
            >
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
          <Link href="/requests" className="btn sm ghost">
            <span className="tiny">The live register instead</span>
          </Link>
        </div>
      </div>

      <div className="statline">
        <div className="stat">
          <div className="v tnum">{decorated.length}</div>
          <div className="k">Ended in this year</div>
        </div>
        <div className="stat">
          <div className="v tnum">{filledPositions}</div>
          <div className="k">Positions filled</div>
        </div>
        <div className="stat">
          <div className="v tnum" style={{ color: rejected ? 'var(--risk)' : undefined }}>
            {rejected}
          </div>
          <div className="k">Rejected before hiring</div>
        </div>
        <div className="stat">
          <div className="v tnum">{avgDays === null ? '—' : `${avgDays}d`}</div>
          <div className="k">Submission to end, average</div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <Empty
            title={decorated.length === 0 ? 'Nothing has ended yet in this fiscal year' : 'No request matches this outcome'}
            note={
              decorated.length === 0
                ? 'Closing is a deliberate act with a reason, so an empty register here simply means every requirement is still open.'
                : 'Try another outcome filter, or widen the fiscal year.'
            }
          />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="reg">
            <thead>
              <tr>
                <th>Request</th>
                <th>Outcome</th>
                <th>Headcount</th>
                <th>Reason on record</th>
                <th>Ended</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {shown.map(({ row, result }) => (
                <tr key={row.request.id} className="reqrow">
                  <td>
                    <Link href={`/requests/${row.request.id}`} className="cell-main">
                      <span className="ttl">{row.request.title}</span>
                    </Link>
                    <div className="subrow">
                      <span className="mono">{row.request.number}</span>
                      <span>·</span>
                      <span>{row.facility?.name ?? 'Unassigned'}</span>
                      <span>·</span>
                      <span>raised by {row.raisedByName ?? 'a former account'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="pcell">
                      <RequestBadge status={row.request.status} />
                      <Badge tone={result.tone}>{result.label}</Badge>
                    </div>
                  </td>
                  <td>
                    <span className="tnum">
                      {result.filled} / {row.request.quantity || row.positions.length}
                    </span>
                    <div className="posmini" aria-hidden>
                      {row.positions.slice(0, 12).map((p) => (
                        <i
                          key={p.id}
                          className={
                            p.status === 'hired'
                              ? 'hired'
                              : ['position_closed', 'candidature_unsuccessful', 'draft'].includes(p.status)
                                ? 'dead'
                                : 'live'
                          }
                          title={`${p.position_number} · ${p.status.replace(/_/g, ' ')}`}
                        />
                      ))}
                    </div>
                    <div className="cell-id">
                      {row.positions.length} position(s) · {row.candidateCount} candidate(s)
                    </div>
                  </td>
                  <td>
                    {row.request.closure_reason || row.ending?.reason ? (
                      <div className="reason">{row.request.closure_reason ?? row.ending?.reason}</div>
                    ) : (
                      <span className="muted tiny">Reason sits in the record history only.</span>
                    )}
                  </td>
                  <td>
                    <div className="pcell">
                      <span>{fmtDate(row.request.closed_at ?? row.ending?.at ?? row.request.updated_at)}</span>
                      <span className="cell-id">
                        {row.ending?.by ? `by ${row.ending.by}` : 'decision not attributed'}
                      </span>
                      <span className="tiny muted">{fmtDuration(row.request.closed_at ?? row.ending?.at)}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link href={`/requests/${row.request.id}`} className="btn ghost sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="regfoot">
        <div>
          Who ended a request is read from the same trail the detail screen shows, so this register and the record can
          never disagree. A name that no longer has an account is written as “a former account” rather than blanked.
        </div>
        <div className="tnum">{shown.length} rows</div>
      </div>

      <div className="grid2" style={{ marginTop: 16, gap: 16 }}>
        <div className="card pad">
          <div className="section-head" style={{ margin: '0 0 10px' }}>
            <h2>What an ending deletes</h2>
            <span className="note">configured, not remembered</span>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <RetainLine
              label="Unsuccessful candidates"
              days={holdDays('candidate_unsuccessful')}
              note="Their data goes on the deletion clock once the decision is final and the grievance window has passed."
            />
            <RetainLine
              label="Resumes and photographs"
              days={holdDays('candidate_documents')}
              note="Destroyed with the candidate record they belong to. No file outlives the row that justified it."
            />
            <RetainLine
              label="The request itself"
              days={holdDays('vacancy_request')}
              note="Kept as hiring-demand evidence for the fiscal year, with no candidate data left inside it."
            />
          </div>
          <div className="tiny muted" style={{ marginTop: 12 }}>
            Periods are read live from the retention register, so changing one there changes what this screen promises.
          </div>
        </div>

        <div className="card pad">
          <div className="section-head" style={{ margin: '0 0 10px' }}>
            <h2>Reopened is not the same as never closed</h2>
          </div>
          <div className="sub" style={{ fontSize: 12.5 }}>
            A closed requirement does not come back to life under the same number. Raising it again creates a new
            request with its own trail, because two decisions made months apart for different reasons must not share a
            single history row.
          </div>
          <div style={{ marginTop: 14 }}>
            <Notice tone="info">
              Requests closed with a hire are the record payroll can later trace back to an approval. Requests closed
              without one are the evidence that the money was released rather than silently parked.
            </Notice>
          </div>
        </div>
      </div>
    </>
  );
}

function RetainLine({ label, days, note }: { label: string; days: number | null; note: string }) {
  return (
    <div className="howrow">
      <Badge tone={days === null ? 'neutral' : days <= 180 ? 'hold' : 'info'}>
        {days === null ? 'no period' : `${Math.round(days / 30)} mo`}
      </Badge>
      <span className="muted">
        <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{label}</b>
        <br />
        {note}
      </span>
    </div>
  );
}
