'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { ActionState } from '@/server/actions';

/**
 * Long forms (raise a request, add a candidate, attach a document) use
 * useActionState so validation messages stay attached to the form instead of
 * replacing it. Workflow buttons use ActionForm instead - see action-form.tsx.
 */
export function StatefulForm({
  action,
  label,
  intro,
  children,
  successHref,
  variant = 'primary',
  resetOnSuccess = false,
  className = '',
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  label: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  successHref?: string;
  variant?: 'primary' | 'dark' | 'default';
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: '' });
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!state.ok || !state.message || handled.current === state.message) return;
    handled.current = state.message;
    if (resetOnSuccess) ref.current?.reset();
    if (state.href) router.push(state.href);
    else if (successHref) router.push(successHref);
    else router.refresh();
  }, [state, router, successHref, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={`col ${className}`.trim()} style={{ gap: 14 }}>
      {intro ? <div className="tiny muted">{intro}</div> : null}
      {children}
      <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="grow">
          {state.message ? (
            <div className={state.ok ? 'ok-msg' : 'err-msg'}>{state.message}</div>
          ) : null}
        </div>
        <button type="submit" className={`btn ${variant === 'default' ? '' : variant}`} disabled={pending}>
          {pending ? <Loader2 size={15} className="pulse" /> : null}
          {label}
        </button>
      </div>
    </form>
  );
}

/** A labelled input that always submits under the name the action reads. */
export function Field({
  name,
  label,
  type = 'text',
  required = false,
  hint,
  placeholder,
  defaultValue,
  rows,
  options,
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  hint?: React.ReactNode;
  placeholder?: string;
  defaultValue?: string | number | readonly string[];
  rows?: number;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="field">
      <label htmlFor={name} className={required ? 'req' : ''}>
        {label}
      </label>
      {options ? (
        <select id={name} name={name} className="select" defaultValue={defaultValue ?? ''} required={required}>
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : rows ? (
        <textarea
          id={name}
          name={name}
          className="textarea"
          rows={rows}
          defaultValue={defaultValue as string | undefined}
          placeholder={placeholder}
          required={required}
        />
      ) : (
        <input
          id={name}
          name={name}
          className="input"
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          min={min}
          max={max}
          step={step}
        />
      )}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
