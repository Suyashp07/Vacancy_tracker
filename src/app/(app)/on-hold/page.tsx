import Link from 'next/link';
import { PauseCircle } from 'lucide-react';
import './on-hold.css';
import { ActionForm } from '@/components/action-form';
import { Badge, Empty, PageHead, PositionBadge } from '@/components/ui';
import { can, POSITION_LABEL, type Tone } from '@/lib/constants';
import { daysSince, fmtDate } from '@/lib/format';
import { getOnHold, type OnHoldRow } from '@/server/policy';
import { requireActor } from '@/server/session';
import { resume } from '@/server/actions';

export const metadata = { title: 'On Hold' };
export const dynamic = 'force-dynamic';

/** The review window the database writes onto a hold_review task. */
const REVIEW_DAYS = 30;

export default async function OnHoldPage() {
  const actor = await requireActor();
  const rows = await getOnHold(actor);
  const mayReview = can(actor.role, 'review_hold');

  const pastReview = rows.filter((r) => r.reviewOverdue).length;
  const longest = rows.reduce((max, r) => Math.max(max, Math.round(r.ageing.hold)), 0);
  const totalPausedDays = rows.reduce((sum, r) => sum + Math.round(r.ageing.hold), 0);

  return (
    <>
      <PageHead
        crumb="Register · Paused on purpose"
        title="On Hold"
        note="A position stops moving when budget, a reorganisation or a season says so. The stage clock stops with it, the calendar clock does not, and the pause itself gets a review date."
        right={
          rows.length > 0 ? (
            <Link href="/my-actions?filter=overdue" className="btn">
              Hold reviews waiting
            </Link>
          ) : null
        }
      />

      <div className="statline">
        <div className="stat">
          <div className="v tnum">{rows.length}</div>
          <div className="k">Positions paused</div>
        </div>
        <div className="stat">
          <div className="v tnum" style={{ color: pastReview ? 'var(--risk)' : undefined }}>
            {pastReview}
          </div>
          <div className="k">Past their review date</div>
        </div>
        <div className="stat">
          <div className="v tnum">{longest}d</div>
          <div className="k">Longest single pause</div>
        </div>
        <div className="stat">
          <div className="v tnum">{totalPausedDays}d</div>
          <div className="k">Pause days, all combined</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <Empty
            title="Nothing is paused"
            note="A hold is placed on a specific position, never on a whole request, and always with a reason attached."
          />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="reg">
            <thead>
              <tr>
                <th>Position</th>
                <th>Why it is paused</th>
                <th>Paused by</th>
                <th>Pause clock</th>
                <th>Review due</th>
                <th aria-label="Resume" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <HoldRow key={row.position.id} row={row} mayReview={mayReview} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="regfoot">
        <div>
          {mayReview
            ? 'Resuming restores the exact stage the position was holding at - the workflow does not guess where to put it back.'
            : 'Your role can see the paused positions in scope, but resuming one is a decision for HR, the HR Head, the Owner or the CEO.'}
        </div>
        <div className="tnum">{rows.length} rows</div>
      </div>

      <div className="grid2" style={{ marginTop: 16, gap: 16 }}>
        <div className="card pad">
          <div className="section-head" style={{ margin: '0 0 10px' }}>
            <h2>What a hold does to the clocks</h2>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <ClockLine
              k="Stage clock"
              v="Frozen at the day the pause was placed. A position that had waited 9 days keeps those 9 days and no more."
              tone="hold"
            />
            <ClockLine k="Calendar clock" v="Keeps running. Total age from creation is still reported, because the business feels it." tone="neutral" />
            <ClockLine k="Review clock" v={`Starts on the pause date and expires after ${REVIEW_DAYS} days - that is the date in the column above.`} tone="wait" />
            <ClockLine k="Requirement" v="Unchanged. A hold never reduces the headcount asked for, and never cancels it either." tone="info" />
          </div>
        </div>

        <div className="card pad">
          <div className="section-head" style={{ margin: '0 0 10px' }}>
            <h2>Leaving it paused is also a decision</h2>
            <span className="note">no silent expiry</span>
          </div>
          <div className="sub" style={{ fontSize: 12.5 }}>
            Nothing resumes on its own and nothing is dropped for being paused too long. When the review date passes,
            the hold stays on this register and the review task stays in the queue of whoever placed it, so an
            abandoned pause is visible instead of quietly becoming a closed position.
          </div>
          <div className="notice info" style={{ marginTop: 14 }}>
            <PauseCircle size={16} />
            <div>
              A hold is not a rejection. Closing a position without a hire is a separate action with its own reason, and
              it is the one that starts the deletion clock on any candidate data attached to it.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function HoldRow({ row, mayReview }: { row: OnHoldRow; mayReview: boolean }) {
  const held = Math.round(row.ageing.hold);
  const ratio = Math.min(1, held / REVIEW_DAYS);
  const since = daysSince(row.heldAt);

  return (
    <tr className="reqrow">
      <td>
        <Link href={`/requests/${row.requestId}`} className="cell-main">
          <span className="ttl">{row.position.label}</span>
        </Link>
        <div className="subrow">
          <span className="mono">{row.position.position_number}</span>
          <span>·</span>
          <span className="mono">{row.requestNumber}</span>
          <span>·</span>
          <span>{row.facilityName}</span>
        </div>
        <div className="subrow" style={{ marginTop: 5 }}>
          <span>Was</span>
          {row.returnsTo ? <PositionBadge status={row.returnsTo} /> : <Badge tone="neutral">stage not recorded</Badge>}
        </div>
      </td>
      <td>
        {row.position.hold_reason ? (
          <div className="reason">{row.position.hold_reason}</div>
        ) : (
          <span className="muted tiny">No reason was recorded on this pause.</span>
        )}
      </td>
      <td>
        <div className="pcell">
          <span>{row.heldBy ?? <span className="muted">Record not readable</span>}</span>
          <span className="cell-id">{fmtDate(row.heldAt)}</span>
          {since !== null ? <span className="tiny muted">{since} day(s) ago</span> : null}
        </div>
      </td>
      <td className="nowrap">
        <span className="tnum" style={{ fontSize: 13 }}>
          {held}d paused
        </span>
        <div className="pausebar" aria-hidden>
          <i style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <div className="tiny muted" style={{ marginTop: 3 }}>
          {Math.round(row.ageing.total)}d of calendar time · {Math.round(row.ageing.stage)}d at the stage before
        </div>
      </td>
      <td>
        {row.reviewDue ? (
          <div className="pcell">
            <span className={row.reviewOverdue ? '' : 'muted'}>{fmtDate(row.reviewDue)}</span>
            {row.reviewOverdue ? <Badge tone="risk">review overdue</Badge> : <Badge tone="ok">within window</Badge>}
          </div>
        ) : (
          <span className="muted tiny">No review date</span>
        )}
      </td>
      <td style={{ textAlign: 'right' }}>
        {mayReview ? (
          <ActionForm
            run={resume}
            args={[row.position.id, row.requestId]}
            label="Resume"
            variant="default"
            requireComment
            commentLabel="Why it is back on"
            intro={`Goes back to ${row.returnsTo ? POSITION_LABEL[row.returnsTo] : 'the stage it was held at'} and closes the review task. The reason for the pause stays in the history.`}
          />
        ) : (
          <Link href={`/requests/${row.requestId}`} className="btn ghost sm">
            Open the record
          </Link>
        )}
      </td>
    </tr>
  );
}

function ClockLine({ k, v, tone }: { k: string; v: string; tone: Tone }) {
  return (
    <div className="howrow">
      <Badge tone={tone}>{k}</Badge>
      <span className="muted">{v}</span>
    </div>
  );
}
