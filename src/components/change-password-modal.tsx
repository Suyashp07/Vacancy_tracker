'use client';

import { useState } from 'react';
import { KeyRound, Lock, X } from 'lucide-react';
import { StatefulForm } from '@/components/stateful-form';
import { changePassword } from '@/server/actions';

export function ChangePasswordModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn ghost sm"
        title="Change your account password"
        aria-label="Change Password"
      >
        <KeyRound size={14} />
        <span>Password</span>
      </button>

      {open ? (
        <>
          <div
            className="scrim on"
            onClick={() => setOpen(false)}
            aria-hidden="true"
            style={{ zIndex: 59 }}
          />
          <div className="modal on" role="dialog" aria-modal="true" style={{ maxWidth: 440, zIndex: 60 }}>
            <div
              className="modal-head row between"
              style={{ alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 }}
            >
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <Lock size={16} />
                <h3 style={{ margin: 0 }}>Change your password</h3>
              </div>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div className="modal-body" style={{ paddingTop: 0 }}>
              <StatefulForm
                action={changePassword}
                label="Update password"
                resetOnSuccess
                intro="Set a new private password for this device and future sign-ins. Minimum 8 characters."
              >
                <div className="field">
                  <label htmlFor="cp-pwd">New password</label>
                  <input
                    id="cp-pwd"
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
                  <label htmlFor="cp-confirm">Confirm new password</label>
                  <input
                    id="cp-confirm"
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
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
