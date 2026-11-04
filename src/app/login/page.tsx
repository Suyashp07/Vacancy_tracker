import { redirect } from 'next/navigation';
import { Lock, ShieldCheck } from 'lucide-react';
import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { getActor } from '@/server/session';
import { LoginForm, type DemoAccount } from '@/components/login-form';
import './login.css';

export const metadata = { title: 'Sign in' };

// Demo buttons only appear when SHOW_DEMO_LOGINS=true is set in your local .env file.
// On the live site leave it out, so the password is never shown to visitors.
const SHOW_DEMO =
  process.env.SHOW_DEMO_LOGINS === 'true' ||
  process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGINS === 'true' ||
  process.env.APP_ENV !== 'production';
const DEMO_PASSWORD = 'Yh-Dev-2026!';
const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'hr@yashhonda.test', label: 'HR Executive' },
  { email: 'hrhead@yashhonda.test', label: 'HR Head' },
  { email: 'owner@yashhonda.test', label: 'Owner' },
  { email: 'ceo@yashhonda.test', label: 'CEO' },
  { email: 'finance@yashhonda.test', label: 'Finance' },
  { email: 'employee@yashhonda.test', label: 'Employee' },
  { email: 'admin@yashhonda.test', label: 'Administrator' },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const actor = await getActor();
  if (actor) redirect('/dashboard');

  const { reason } = await searchParams;

  return (
    <div className="login">
      <aside className="login-side">
        <div className="brand">
          <div className="brand-mark">YH</div>
          <div className="brand-name">{APP_NAME}</div>
          <div className="brand-sub">{APP_SUBTITLE}</div>
        </div>

        <div className="login-copy">
          <h1>Track every vacancy from request to joining.</h1>
          <p>
            See which positions are open at each showroom, which decisions are waiting, and who has joined. Every
            approval is recorded with the person, the time and the reason.
          </p>
          <ul>
            <li>
              <ShieldCheck size={15} />
              <span>Candidate documents are private, and every time one is opened it is recorded.</span>
            </li>
            <li>
              <Lock size={15} />
              <span>Personal data is deleted automatically when its retention period ends.</span>
            </li>
          </ul>
        </div>

        <div className="tiny muted">Internal system. Access is monitored.</div>
      </aside>

      <main className="login-main">
        <LoginForm
          demoAccounts={SHOW_DEMO ? DEMO_ACCOUNTS : undefined}
          demoPassword={SHOW_DEMO ? DEMO_PASSWORD : undefined}
        />
        {reason === 'expired' ? (
          <div className="err-msg" style={{ marginTop: 12 }}>
            Your session ended. Please sign in again.
          </div>
        ) : null}
        {reason === 'denied' ? (
          <div className="err-msg" style={{ marginTop: 12 }}>
            You do not have permission to open that page.
          </div>
        ) : null}
      </main>
    </div>
  );
}
