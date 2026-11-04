'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, Lock, X } from 'lucide-react';
import { StatefulForm } from '@/components/stateful-form';
import { changePassword } from '@/server/actions';

export function ChangePasswordModal() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close with the Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const popup = (
    <>
      <div className="scrim on" onClick={() => setOpen(false)} aria-hidden="true" style={{ zIndex: 59 }} />
      <div className="modal on" role="dialog" aria-modal="true" aria-label="Change password" style={{ maxWidth: 440, zIndex: 60 }}>
        <div className="modal-head row between" style={{ alignItems: 'center', paddingBottom: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <Lock size={16} />
            <h3 style={{ margin: 0 }}>Change your password</h3>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="modal-body" style={{ paddingTop: 0 }}>
          <StatefulForm
            action={changePassword}
            label="Update password"
            resetOnSuccess
            intro="Choose a new password with at least 8 characters."
          >
            <div className="field">
              <label htmlFor="cp-pwd">New password</label>
              <input
                id="cp-pwd"
                name="password"
                type="password"
                className="input"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label htmlFor="cp-confirm">Confirm new password</label>
              <input
                id="cp-confirm"
                name="confirm_password"
                type="password"
                className="input"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          </StatefulForm>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn ghost sm"
        title="Change your account password"
        aria-label="Change password"
      >
        <KeyRound size={14} />
        <span>Password</span>
      </button>

      {/* The portal puts the popup on the page itself, so the top bar cannot trap it. */}
      {open && mounted ? createPortal(popup, document.body) : null}
    </>
  );
}
