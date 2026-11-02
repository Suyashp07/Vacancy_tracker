import { redirect } from 'next/navigation';
import { Lock, ShieldCheck } from 'lucide-react';
import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { getActor } from '@/server/session';
import { LoginForm, type DemoAccount } from '@/components/login-form';
import './login.css';

export const metadata = { title: 'Sign in' };

// Seeded demonstration accounts. Each button performs a real sign-in against the
// same action a manual login uses, so role-based visibility can be tested in one
// click. Password is shared across the seed (see supabase/seed.sql).
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

/**
 * Signing in is the only screen without the workspace shell. Nothing about a
 * record is visible here - not even counts - so the portal cannot be probed by
 * an unauthenticated crawl.
 */
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
          <h1>Every vacancy, from sanctioned need to confirmed joining, on one trail.</h1>
          <p>
            Positions are tracked per dealership. Candidates are tracked per position. Approvals are recorded with the
            person, the time and the reason - and nobody approves their own request.
          </p>
          <ul>
            <li>
              <ShieldCheck size={15} />
              <span>Candidate documents stay private. Opening a resume or photograph is logged, not merely allowed.</span>
            </li>
            <li>
              <Lock size={15} />
              <span>Personal data is collected under the DPDP notice and deleted on the retention clock.</span>
            </li>
          </ul>
        </div>

        <div className="tiny muted">Internal system. Access is monitored and audited.</div>
      </aside>

      <main className="login-main">
        <LoginForm demoAccounts={DEMO_ACCOUNTS} demoPassword={DEMO_PASSWORD} />
        {reason === 'expired' ? <div className="err-msg" style={{ marginTop: 12 }}>Your session ended. Sign in again.</div> : null}
        {reason === 'denied' ? (
          <div className="err-msg" style={{ marginTop: 12 }}>
            You do not have permission for that screen. The attempt was recorded.
          </div>
        ) : null}
      </main>
    </div>
  );
}

