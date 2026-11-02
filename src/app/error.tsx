'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';

/**
 * Root error boundary. After a redeploy, an already-open tab can hold superseded
 * /_next/static chunks; soft-navigating into a new server payload then throws a
 * minified client error (e.g. "e[o] is not a function"). The cure is a fresh load
 * of the current build, so we detect that class of error and reload exactly once
 * (guarded by sessionStorage so a genuine bug can never cause a reload loop).
 */
const RELOAD_FLAG = 'yh-reloaded-once';

const STALE_BUILD =
  /dynamically imported module|loading chunk|chunk .* (failed|error)|error loading|failed to fetch module|cannot find (?:module|export|namespace)|mismatched asset|unexpected token .?<|is not a function|undefined is not an object/i;

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const message = String(error?.message ?? '');
    let reloadOnce = false;
    try {
      reloadOnce = STALE_BUILD.test(message) && !sessionStorage.getItem(RELOAD_FLAG);
      if (reloadOnce) sessionStorage.setItem(RELOAD_FLAG, '1');
    } catch {
      // sessionStorage unavailable (e.g. blocked) — fall through to manual recovery.
    }
    if (reloadOnce) {
      // Cache-busting full reload pulls the current document + chunk hashes.
      window.location.reload();
      return;
    }
    // A successful render since the last auto-reload clears the guard.
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* ignore */
    }
  }, [error]);

  const digest = error?.digest;

  return (
    <main className="stage" style={{ display: 'grid', placeItems: 'center', padding: 'clamp(24px,6vw,64px)' }}>
      <div className="card" style={{ maxWidth: 460, width: '100%', padding: 'clamp(22px,4vw,32px)' }}>
        <div className="row" style={{ gap: 10, marginBottom: 14 }}>
          <span
            className="badge"
            style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, padding: 0, background: 'var(--warn-soft)', color: 'var(--warn)' }}
          >
            <TriangleAlert size={18} />
          </span>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)' }}>Something didn’t load right</h1>
        </div>
        <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          This is usually a leftover page from an earlier version of the site. Reloading will fetch the current
          version and take you back where you were.
        </p>
        {digest ? (
          <p className="tiny muted mono" style={{ marginTop: 12, letterSpacing: 0 }}>
            Ref {digest}
          </p>
        ) : null}
        <div className="row" style={{ gap: 10, marginTop: 20 }}>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <button type="button" className="btn ghost" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
