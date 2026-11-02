'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import type { ActionState } from '@/server/actions';

/**
 * The single shape every workflow mutation takes in the UI.
 *
 * A server action reference and its plain-data arguments are passed separately,
 * because a closure over server data cannot cross into a client component. The
 * action is awaited, its typed result is shown inline - never a generic
 * "success" toast, because the message states which state the record moved to.
 */

export type Runner = (...args: any[]) => Promise<ActionState>;

export interface ExtraField {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'select';
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  defaultValue?: string | number;
  placeholder?: string;
}

export function ActionForm({
  run,
  args = [],
  label,
  variant = 'primary',
  intro,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Recorded permanently and shown to everyone on this record.',
  requireReason = false,
  commentLabel = 'Comment',
  requireComment = false,
  fields = [],
  children,
  submitLabel,
  cancelLabel = 'Cancel',
  startOpen = false,
  successHref,
  keepOpen = false,
}: {
  run: Runner;
  args?: (string | number | boolean | null | undefined)[];
  label: string;
  variant?: 'primary' | 'dark' | 'danger' | 'default';
  intro?: React.ReactNode;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  requireReason?: boolean;
  commentLabel?: string;
  requireComment?: boolean;
  fields?: ExtraField[];
  children?: React.ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  startOpen?: boolean;
  successHref?: string;
  keepOpen?: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(startOpen);
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);

  function submit(form: FormData) {
    start(async () => {
      try {
        const result = await run(...args, form);
        setState(result);
        if (result.ok) {
          if (!keepOpen) setOpen(false);
          if (result.href) router.push(result.href);
          else if (successHref) router.push(successHref);
          else router.refresh();
        }
      } catch {
        setState({ ok: false, message: 'The change did not go through. Nothing was saved.' });
      }
    });
  }

  if (!open) {
    return (
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${variant === 'primary' ? 'primary' : variant}`}
          onClick={() => {
            setState(null);
            setOpen(true);
          }}
          disabled={pending}
        >
          {label}
        </button>
        {state?.message ? (
          <span className={state.ok ? 'ok-msg' : 'err-msg'}>{state.ok ? state.message : state.message}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="card pad" style={{ width: '100%', maxWidth: 560 }}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div className="cell-main">{label}</div>
          {intro ? <div className="tiny muted" style={{ marginTop: 4, maxWidth: 430 }}>{intro}</div> : null}
        </div>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} aria-label="Close">
          <ChevronDown size={14} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </div>

      <form action={submit}>
        <div className="col" style={{ marginTop: 12 }}>
          {fields.map((f) => (
            <div className="field" key={f.name}>
              <label htmlFor={`${uid}-${f.name}`} className={f.required ? 'req' : ''}>
                {f.label}
              </label>
              {f.type === 'select' ? (
                <select
                  id={`${uid}-${f.name}`}
                  name={f.name}
                  className="select"
                  defaultValue={f.defaultValue ?? ''}
                  required={f.required}
                >
                  <option value="">Choose…</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${uid}-${f.name}`}
                  name={f.name}
                  className="input"
                  type={f.type ?? 'text'}
                  defaultValue={f.defaultValue ?? ''}
                  placeholder={f.placeholder}
                  required={f.required}
                />
              )}
              {f.hint ? <span className="hint">{f.hint}</span> : null}
            </div>
          ))}

          {children}

          {requireReason || requireComment ? (
            <div className="field">
              <label htmlFor={`${uid}-note`} className={requireReason ? 'req' : ''}>
                {requireComment && !requireReason ? commentLabel : reasonLabel}
              </label>
              <textarea
                id={`${uid}-note`}
                name={requireComment && !requireReason ? 'comment' : 'reason'}
                className="textarea"
                placeholder={requireComment && !requireReason ? 'Optional note for the trail.' : reasonPlaceholder}
                required={requireReason}
              />
              <span className="hint">This text is kept after the record is closed.</span>
            </div>
          ) : null}

          {requireComment && requireReason ? (
            <div className="field">
              <label htmlFor={`${uid}-comment`}>{commentLabel}</label>
              <textarea id={`${uid}-comment`} name="comment" className="textarea" placeholder="Optional note for the trail." />
            </div>
          ) : null}

          {state && !state.ok ? <div className="err-msg">{state.message}</div> : null}
          {state?.ok && state.warning ? <div className="hint" style={{ color: 'var(--warn)' }}>{state.warning}</div> : null}

          <div className="row end" style={{ marginTop: 4 }}>
            <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
              {cancelLabel}
            </button>
            <button
              type="submit"
              className={`btn sm ${variant === 'default' ? '' : variant}`}
              disabled={pending}
            >
              {pending ? <Loader2 size={14} className="pulse" /> : <CheckCircle2 size={14} />}
              {submitLabel ?? label}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
