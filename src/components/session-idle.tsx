'use client';

import { useEffect, useRef, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { signOut } from '@/server/actions';

/**
 * Idle-session guard. The access token auto-refreshes while the workspace is in
 * use, but an unattended tab should lock rather than sit open on a shared HR
 * machine. After IDLE_WARN_MS of no activity a modal appears; if nobody responds
 * within LOCK_GRACE_MS the session is signed out. "Stay signed in" re-runs the
 * server render (router.refresh) so the Supabase session and token are re-validated.
 * Last-activity is stored in localStorage so the timer is shared across tabs.
 */
const IDLE_WARN_MS = 15 * 60 * 1000; // warn after 15 minutes idle
const LOCK_GRACE_MS = 60 * 1000; // lock 60 seconds after the warning
const KEY = 'yih-last-activity';

export function SessionIdleGuard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [secs, setSecs] = useState(Math.round(LOCK_GRACE_MS / 1000));
  const modalOpen = useRef(false);

  // Track activity and open the warning when idle crosses the threshold.
  useEffect(() => {
    const bump = () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* storage blocked — fall back to in-memory only */
      }
    };
    let last = Date.now();
    const touch = () => {
      if (modalOpen.current) return; // once warned, only the buttons can reset
      if (Date.now() - last < 800) return; // throttle writes
      last = Date.now();
      bump();
    };
    bump();
    const evts: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'];
    evts.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const id = setInterval(() => {
      if (modalOpen.current) return;
      let since = Number(0);
      try {
        since = Number(localStorage.getItem(KEY) ?? Date.now());
      } catch {
        since = last;
      }
      if (Date.now() - since >= IDLE_WARN_MS) {
        modalOpen.current = true;
        setOpen(true);
      }
    }, 1000);

    return () => {
      clearInterval(id);
      evts.forEach((e) => window.removeEventListener(e, touch));
    };
  }, []);

  // Countdown to automatic lock while the modal is visible.
  useEffect(() => {
    if (!open) return;
    let left = Math.round(LOCK_GRACE_MS / 1000);
    setSecs(left);
    const iv = setInterval(() => {
      left -= 1;
      setSecs(Math.max(0, left));
      if (left <= 0) {
        clearInterval(iv);
        startTransition(() => {
          void signOut();
        });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [open]);

  if (!open) return null;

  const staySignedIn = () => {
    modalOpen.current = false;
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
    router.refresh(); // re-validate the session server-side and refresh the token
  };

  const signOutNow = () =>
    startTransition(() => {
      void signOut();
    });

  return (
    <div className="idle-scrim" role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="idle-modal">
        <span className="idle-badge" aria-hidden>
          <ShieldAlert size={20} />
        </span>
        <h2 id="idle-title">Still there?</h2>
        <p>
          For the privacy of the hiring records on this screen, your session locks itself when it is left unattended.
        </p>
        <p className="idle-count">
          Locking automatically in <strong>{secs}s</strong>
        </p>
        <div className="idle-actions">
          <button type="button" className="btn primary" onClick={staySignedIn}>
            Stay signed in
          </button>
          <button type="button" className="btn ghost" onClick={signOutNow}>
            Sign out now
          </button>
        </div>
      </div>
    </div>
  );
}
