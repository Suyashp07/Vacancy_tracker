'use client';

import { useEffect, useState } from 'react';

/**
 * A ticking IST clock for the dashboard hero. Rendered as a client island so the
 * server snapshot stays static; the time is purely cosmetic context ("the numbers
 * are live"), never a data source. Hydration is guarded so the server's empty
 * span and the first client paint can't mismatch.
 */
export function LiveClock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="live-clock" suppressHydrationWarning>
      <i className="live-dot" aria-hidden />
      <span className="mono">{now ?? '--:--:--'}</span> IST
    </span>
  );
}
