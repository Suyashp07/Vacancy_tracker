import Link from 'next/link';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { completePasswordReset } from '@/server/actions';
import { StatefulForm } from '@/components/stateful-form';
import '@/app/login/login.css';

export const metadata = { title: 'Set new password' };
export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <div className="login">
      <aside className="login-side">
        <div className="brand">
          <div className="brand-mark">YH</div>
          <div className="brand-name">{APP_NAME}</div>
          <div className="brand-sub">{APP_SUBTITLE}</div>
        </div>

        <div className="login-copy">
          <h1>Secure Account Setup</h1>
          <p>
            Choose a private, strong password for your work account. Your password is encrypted and never visible to any
            administrator.
          </p>
          <ul>
            <li>
              <ShieldCheck size={15} />
              <span>Minimum 8 characters with a mix of letters and numbers.</span>
            </li>
          </ul>
        </div>

        <div className="tiny muted">Internal system. Access is monitored and audited.</div>
      </aside>

      <main className="login-main">
        <div className="card pad login-card">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <KeyRound size={18} />
            <h2 style={{ margin: 0 }}>Set your password</h2>
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            Enter your new private password below to access your workspace.
          </div>

          <StatefulForm
            action={completePasswordReset}
            label="Save password and sign in"
            resetOnSuccess
            successHref="/dashboard"
          >
            <div className="field">
              <label htmlFor="rp-pwd" className="req">
                New password
              </label>
              <input
                id="rp-pwd"
                name="password"
                type="password"
                className="input"
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label htmlFor="rp-confirm" className="req">
                Confirm new password
              </label>
              <input
                id="rp-confirm"
                name="confirm_password"
                type="password"
                className="input"
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          </StatefulForm>

          <div style={{ marginTop: 8 }}>
            <Link href="/login" className="row tiny muted" style={{ gap: 4 }}>
              <ArrowLeft size={13} />
              Back to sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

