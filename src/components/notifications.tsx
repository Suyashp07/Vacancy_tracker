'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, Loader2 } from 'lucide-react';
import { markNotificationsRead } from '@/server/actions';
import type { NotificationRow } from '@/server/policy';

/**
 * In-app notifications only - the portal sends no email in version 1, so this
 * panel is the delivery mechanism and "read" is a recorded state, not a guess.
 */
export function Notifications({ items, unread }: { items: NotificationRow[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function markAll() {
    const ids = items.filter((i) => !i.read_at).map((i) => i.id);
    if (ids.length === 0) return;
    start(async () => {
      await markNotificationsRead(ids);
      router.refresh();
    });
  }

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${unread} unread notifications`}
      >
        <Bell size={16} />
        {unread > 0 ? <span className="nav-count risk tnum">{unread}</span> : null}
      </button>

      {open ? (
        <div className="card lift" style={{ position: 'absolute', right: 0, top: 38, width: 366, zIndex: 45, overflow: 'hidden' }}>
          <div className="row between" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line-soft)' }}>
            <b style={{ fontWeight: 500, fontSize: 13 }}>Notifications</b>
            <button type="button" className="btn ghost sm" onClick={markAll} disabled={pending || unread === 0}>
              {pending ? <Loader2 size={13} className="pulse" /> : <Check size={13} />}
              Mark all read
            </button>
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div className="empty">
                <b>Nothing waiting</b>
                <div className="muted">You will see a note here when a decision lands on your desk.</div>
              </div>
            ) : (
              items.map((n) => (
                <Link key={n.id} href={n.link ?? '#'} className={`ddrow ${n.read_at ? '' : 'unread'}`} onClick={() => setOpen(false)}>
                  <div className="row between" style={{ gap: 8 }}>
                    <span className="cell-main" style={{ fontSize: 12.8 }}>
                      {n.title}
                    </span>
                    {n.severity === 'high' ? <span className="badge risk">urgent</span> : null}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {n.body}
                  </div>
                  <div className="tiny mono muted" style={{ marginTop: 4 }}>
                    {new Date(n.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
