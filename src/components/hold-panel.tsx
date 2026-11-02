'use client';

import { useState, useTransition } from 'react';
import { Loader2, PauseCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { holdRequestPositions } from '@/server/actions';

/**
 * A hold stops the ageing clock, which makes it the most abused action in any
 * hiring system. So it takes an explicit position selection, a mandatory reason
 * shown to everyone, and an expected review date that puts it back on a queue.
 */
export function HoldPanel({
  requestId,
  positions,
}: {
  requestId: string;
  positions: { id: string; label: string; number: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(positions.map((p) => p.id));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (positions.length === 0) return null;

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  if (!open) {
    return (
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn dark" onClick={() => setOpen(true)}>
          <PauseCircle size={15} />
          Place on hold
        </button>
        <span className="tiny muted">
          {positions.length} open position(s) can be held. The reason is visible to every role.
        </span>
      </div>
    );
  }

  return (
    <div className="card pad" style={{ width: '100%', maxWidth: 620 }}>
      <form
        action={(form) => {
          start(async () => {
            const result = await holdRequestPositions(requestId, selected, form);
            if (result.ok) {
              setOpen(false);
              setError(null);
              router.refresh();
            } else {
              setError(result.message);
            }
          });
        }}
      >
        <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="cell-main">Place positions on hold</div>
            <div className="tiny muted" style={{ marginTop: 4, maxWidth: 460 }}>
              The hold date is recorded, the ageing clock stops, and the reason travels with the position everywhere it
              is shown.
            </div>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>

        <div className="col" style={{ marginTop: 12, gap: 12 }}>
          <div className="col" style={{ gap: 4 }}>
            <span className="upper">Which positions</span>
            {positions.map((p) => (
              <label key={p.id} className="checkline" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                <span>
                  <span className="mono">{p.number}</span> · {p.label}
                </span>
              </label>
            ))}
            {selected.length === 0 ? <span className="hint">Pick at least one position.</span> : null}
          </div>

          <div className="fgrid">
            <div className="field">
              <label htmlFor={`hold-start-${requestId}`} className="req">
                Held from
              </label>
              <input id={`hold-start-${requestId}`} name="hold_start_date" type="date" className="input" required />
            </div>
            <div className="field">
              <label htmlFor={`hold-end-${requestId}`}>Expected review date</label>
              <input id={`hold-end-${requestId}`} name="hold_end_date_expected" type="date" className="input" />
              <span className="hint">Leave empty and the hold stays open-ended, which is visible on the On Hold screen.</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor={`hold-reason-${requestId}`} className="req">
              Reason for the hold
            </label>
            <textarea
              id={`hold-reason-${requestId}`}
              name="reason"
              className="textarea"
              rows={3}
              required
              placeholder="Budget frozen pending Q2 review. Line 3 commissioning slipped to March."
            />
            <span className="hint">Mandatory, permanent, and shown to everyone who opens the position.</span>
          </div>

          {error ? <div className="err-msg">{error}</div> : null}

          <div className="row end">
            <button type="submit" className="btn sm dark" disabled={pending || selected.length === 0}>
              {pending ? <Loader2 size={14} className="pulse" /> : <PauseCircle size={14} />}
              Hold {selected.length} position(s)
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
