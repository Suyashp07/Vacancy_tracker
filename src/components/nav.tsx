'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileClock, Inbox, LayoutDashboard, PauseCircle, ScrollText, ShieldCheck } from 'lucide-react';
import { NAV_ALL, type NavKey } from '@/lib/constants';

const NAV_ICON: Record<NavKey, typeof Inbox> = {
  dashboard: LayoutDashboard,
  requests: Inbox,
  my_actions: FileClock,
  on_hold: PauseCircle,
  closed: ScrollText,
  admin: ShieldCheck,
};

/**
 * Navigation is role-filtered before it is rendered - a person never sees a
 * queue they cannot act on, rather than seeing it and being refused.
 */
export function Nav({ allowed, counts }: { allowed: NavKey[]; counts: Partial<Record<NavKey, number>> }) {
  const pathname = usePathname();
  const items = NAV_ALL.filter((n) => allowed.includes(n.key));
  const primary = items.filter((n) => n.key !== 'admin');
  const governance = items.filter((n) => n.key === 'admin');

  const render = (n: (typeof NAV_ALL)[number]) => {
    const Icon = NAV_ICON[n.key];
    const active = n.key === 'dashboard' ? pathname === n.href : pathname.startsWith(n.href);
    const count = counts[n.key];
    return (
      <Link key={n.key} href={n.href} prefetch={true} className={`nav-item ${active ? 'active' : ''}`} title={n.hint}>
        <Icon size={16} />
        <span>{n.label}</span>
        {count ? <span className={`nav-count tnum ${n.key === 'my_actions' && count > 0 ? 'risk' : ''}`.trim()}>{count}</span> : null}
      </Link>
    );
  };

  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-label">Workspace</div>
      {primary.map(render)}
      {governance.length > 0 ? (
        <>
          <div className="nav-label">Governance</div>
          {governance.map(render)}
        </>
      ) : null}
    </nav>
  );
}
