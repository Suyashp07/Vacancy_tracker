'use client';

import { useRef, useState, useTransition } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { signIn } from '@/server/actions';

export interface DemoAccount {
  email: string;
  label: string;
}

/**
 * Login is a client form on purpose: a wrong password must stay on the page with
 * its message rather than reloading it, and the failure is recorded as a
 * denied-access signal by the action.
 *
 * When demo accounts are supplied, each becomes a one-click button: it fills the
 * email + shared password and submits through the exact same action as a manual
 * sign-in, so there is no second code path that could bypass the audit signal.
 */
export function LoginForm({
  demoAccounts,
  demoPassword,
}: {
  demoAccounts?: DemoAccount[];
  demoPassword?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  function submit(form: FormData) {
    start(async () => {
      const result = await signIn(form);
      // on success the action redirects and nothing below runs
      if (result && !result.ok) setMessage(result.message);
    });
  }

  function quickLogin(email: string) {
    if (!emailRef.current || !passRef.current || !formRef.current) return;
    emailRef.current.value = email;
    passRef.current.value = demoPassword ?? '';
    formRef.current.requestSubmit();
  }

  return (
    <form ref={formRef} className="card pad login-card" action={submit}>
      <h2>Sign in</h2>
      <div className="tiny muted" style={{ marginTop: 4 }}>
        Use the work account issued to you by the system administrator.
      </div>

      {message ? <div className="err-msg">{message}</div> : null}

      <div className="field">
        <label htmlFor="email" className="req">
          Work email
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          className="input"
          type="email"
          autoComplete="username"
          required
          placeholder="name@yashhonda.in"
        />
      </div>

      <div className="field">
        <label htmlFor="password" className="req">
          Password
        </label>
        <input
          ref={passRef}
          id="password"
          name="password"
          className="input"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>

      <button type="submit" className="btn primary" style={{ justifyContent: 'center', padding: '9px 13px' }} disabled={pending}>
        {pending ? <Loader2 size={15} className="pulse" /> : null}
        Sign in
      </button>

      {demoAccounts && demoAccounts.length > 0 ? (
        <div className="demo-logins">
          <div className="demo-logins-head">
            <Zap size={13} />
            <span>One-click demo logins</span>
          </div>
          <div className="demo-logins-grid">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                className="demo-login-btn"
                onClick={() => quickLogin(account.email)}
                disabled={pending}
                title={`Sign in as ${account.label}`}
              >
                <span className="demo-login-role">{account.label}</span>
                <span className="demo-login-email">{account.email}</span>
              </button>
            ))}
          </div>
          <div className="demo-logins-foot">
            Shared password <span className="mono">{demoPassword}</span> · seeded demo data, safe to explore.
          </div>
        </div>
      ) : null}

      <div className="hint">
        Accounts are created by an Admin. There is no self-registration and no password recovery email in this release -
        ask an Admin to reset it.
      </div>
    </form>
  );
}
