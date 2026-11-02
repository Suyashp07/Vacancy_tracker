'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { MetricTile } from '@/server/policy';

/**
 * A metric is a question, not just a number: every tile opens the exact rows
 * behind it, so "14 on hold" is never something a manager has to take on trust.
 */
export function MetricsGrid({ tiles }: { tiles: MetricTile[] }) {
  const [open, setOpen] = useState<MetricTile | null>(null);
  const interesting = ['risk', 'wait', 'hold'];

  return (
    <>
      <div className="metrics">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`metric ${t.value === 0 ? 'zero' : ''}`}
            onClick={() => setOpen(t)}
            title={t.hint}
          >
            <div className="mname">
              {t.label}
              {t.value > 0 && t.rows.some((r) => interesting.includes(r.tone)) ? (
                <i className="dot" style={{ background: 'var(--risk)' }} />
              ) : null}
            </div>
            <div className="mnum tnum">
              {t.value}
              <span className="munit">{t.value === 1 ? t.unit.replace(/s$/, '') : t.unit}</span>
            </div>
            <div className="mfoot">{t.rows.length > 0 ? 'Tap to see which ones' : t.hint}</div>
          </button>
        ))}
      </div>

      <div className={`scrim ${open ? 'on' : ''}`} onClick={() => setOpen(null)} aria-hidden />
      <aside className={`drawer ${open ? 'on' : ''}`} aria-hidden={!open}>
        <div className="drawer-head">
          <div className="grow">
            <h3>{open?.label}</h3>
            <div className="tiny muted">{open?.hint}</div>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setOpen(null)} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="drawer-body">
          {!open || open.rows.length === 0 ? (
            <div className="empty">
              <b>Nothing in this bucket</b>
              <div className="muted">The count is zero for the records you can see.</div>
            </div>
          ) : (
            <div className="col">
              {open.rows.map((r) => (
                <Link key={`${r.kind}-${r.ref}-${r.detail}`} href={r.href} className="drillrow">
                  <div className="row between">
                    <span className="cell-id">{r.ref}</span>
                    <span className="tiny muted">{r.ageDays === null ? '' : `${Math.round(r.ageDays)}d old`}</span>
                  </div>
                  <div className="cell-main" style={{ fontSize: 13, marginTop: 2 }}>
                    {r.detail}
                  </div>
                  <div className="tiny muted">{r.facilityName}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="drawer-foot">
          <button type="button" className="btn" onClick={() => setOpen(null)}>
            Close
          </button>
        </div>
      </aside>
    </>
  );
}
