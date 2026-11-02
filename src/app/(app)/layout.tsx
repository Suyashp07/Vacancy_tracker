import Link from 'next/link';
import { LogOut, Scale } from 'lucide-react';
import { Nav } from '@/components/nav';
import { Notifications } from '@/components/notifications';
import { SessionIdleGuard } from '@/components/session-idle';
import { Avatar } from '@/components/ui';
import { APP_NAME, APP_SUBTITLE, ROLE_LABEL, navFor } from '@/lib/constants';
import { fiscalYearLabel, fiscalYearTag } from '@/lib/format';
import { requireActor, pendingAcknowledgement } from '@/server/session';
import { getNotifications, getOnHold, getTasks, unreadCount } from '@/server/policy';
import { signOut } from '@/server/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();

  const [tasks, held, notifications, unread, ack] = await Promise.all([
    getTasks(actor),
    getOnHold(actor),
    getNotifications(actor, 12),
    unreadCount(actor),
    pendingAcknowledgement(actor),
  ]);

  const today = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
  }).format(new Date());

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">YH</div>
          <div className="brand-name">{APP_NAME}</div>
          <div className="brand-sub">{APP_SUBTITLE}</div>
        </div>

        <Nav allowed={navFor(actor.role)} counts={{ my_actions: tasks.length, on_hold: held.length }} />

        <div className="side-foot">
          <div className="identity">
            <Avatar name={actor.name} />
            <div className="grow">
              <div className="identity-name">{actor.name}</div>
              <div className="identity-role">
                {ROLE_LABEL[actor.role]}
                {actor.role === 'Employee' ? ' · requester' : ''}
              </div>
            </div>
          </div>
          <form action={signOut}>
            <button type="submit" className="btn ghost sm signout" title="Sign out of this device">
              <LogOut size={14} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <div className="crumb">
              Fiscal year {fiscalYearLabel(fiscalYearTag(new Date()))} · India
            </div>
            <div className="row" style={{ gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{ROLE_LABEL[actor.role]} workspace</span>
              <span className="muted tiny">{today}</span>
            </div>
          </div>
          <div className="topbar-right">
            <Link href="/legal" className="btn ghost sm">
              <Scale size={15} />
              Policies
            </Link>
            <Notifications items={notifications} unread={unread} />
            <form action={signOut} className="topbar-signout">
              <button type="submit" className="btn ghost sm" title="Sign out" aria-label="Sign out">
                <LogOut size={15} />
              </button>
            </form>
          </div>
        </header>

        {ack ? (
          <Link href="/legal/acknowledge" className="ackbar">
            <Scale size={15} />
            <span>
              <b>{ack.title}</b> version {ack.version} applies to you and is not yet acknowledged. Hiring records stay
              read-only until you accept it.
            </span>
            <span className="badge warn">action needed</span>
          </Link>
        ) : null}

        <main className="content">{children}</main>
      </div>

      <SessionIdleGuard />
    </div>
  );
}
