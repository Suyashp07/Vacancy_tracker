'use client';

import { useRef, useState, useTransition } from 'react';
import { ArrowLeft, KeyRound, Loader2, Zap } from 'lucide-react';
import { signIn, requestPasswordReset } from '@/server/actions';

export interface DemoAccount {
  email: string;
  label: string;
}

export function LoginForm({
  demoAccounts,
  demoPassword,
}: {
  demoAccounts?: DemoAccount[];
  demoPassword?: string;
}) {
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  function submitLogin(form: FormData) {
    setMessage(null);
    start(async () => {
      const result = await signIn(form);
      if (result && !result.ok) {
        setMessage({ text: result.message, ok: false });
      }
    });
  }

  function submitReset(form: FormData) {
    setMessage(null);
    start(async () => {
      const result = await requestPasswordReset({ ok: false, message: '' }, form);
      setMessage({ text: result.message, ok: result.ok });
    });
  }

  function quickLogin(email: string) {
    if (!emailRef.current || !passRef.current || !formRef.current) return;
    emailRef.current.value = email;
    passRef.current.value = demoPassword ?? '';
    formRef.current.requestSubmit();
  }

  if (view === 'forgot') {
    return (
      <div className="card pad login-card">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <KeyRound size={18} />
          <h2 style={{ margin: 0 }}>Reset password</h2>
        </div>
        <div className="tiny muted" style={{ marginTop: 2 }}>
          Enter your registered work email. We will send you instructions to set a new password.
        </div>

        {message ? (
          <div className={message.ok ? 'ok-msg' : 'err-msg'}>{message.text}</div>
        ) : null}

        <form action={submitReset} className="col" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="reset-email" className="req">
              Work email
            </label>
            <input
              id="reset-email"
              name="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              placeholder="name@yashhonda.in"
            />
          </div>

          <button
            type="submit"
            className="btn primary"
            style={{ justifyContent: 'center', padding: '9px 13px' }}
            disabled={pending}
          >
            {pending ? <Loader2 size={15} className="pulse" /> : null}
            Send recovery link
          </button>
        </form>

        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setView('login');
              setMessage(null);
            }}
            style={{ padding: '6px 0' }}
          >
            <ArrowLeft size={13} />
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} className="card pad login-card" action={submitLogin}>
      <h2>Sign in</h2>
      <div className="tiny muted" style={{ marginTop: 2 }}>
        Sign in to your Yash Honda employee workspace.
      </div>

      {message ? <div className={message.ok ? 'ok-msg' : 'err-msg'}>{message.text}</div> : null}

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
        <div className="row between" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="password" className="req" style={{ margin: 0 }}>
            Password
          </label>
          <button
            type="button"
            onClick={() => {
              setView('forgot');
              setMessage(null);
            }}
            className="link tiny"
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          >
            Forgot password?
          </button>
        </div>
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

      <button
        type="submit"
        className="btn primary"
        style={{ justifyContent: 'center', padding: '9px 13px' }}
        disabled={pending}
      >
        {pending ? <Loader2 size={15} className="pulse" /> : null}
        Sign in
      </button>

      {demoAccounts && demoAccounts.length > 0 ? (
        <div className="demo-logins">
          <div className="demo-logins-head">
            <Zap size={13} />
            <span>Development quick logins</span>
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
            Password: <span className="mono">{demoPassword}</span> (development only)
          </div>
        </div>
      ) : null}

      <div className="hint" style={{ marginTop: 2 }}>
        Authorized personnel only. Contact your system administrator if you need your account configured.
      </div>
    </form>
  );
}
