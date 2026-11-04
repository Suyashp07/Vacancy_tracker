import Link from 'next/link';
import { FileText, ImageIcon, Info, Paperclip, ShieldCheck } from 'lucide-react';
import {
  CANDIDATE_LABEL,
  CANDIDATE_TONE,
  POSITION_LABEL,
  POSITION_TONE,
  REQUEST_LABEL,
  REQUEST_TONE,
  type CandidateStatus,
  type PositionStatus,
  type RequestStatus,
  type Tone,
} from '@/lib/constants';
import { fmtDateTime, initials } from '@/lib/format';

/**
 * Design-system atoms. Every class here is defined in globals.css, ported from
 * the prototype that was signed off, so components never invent styling and the
 * tokens stay the single source of visual truth.
 */

/** Tone is the domain concept; the badge class is its presentation. */
const TONE_CLASS: Record<Tone, string> = {
  neutral: '',
  info: 'info',
  progress: 'info',
  wait: 'warn',
  ok: 'ok',
  risk: 'risk',
  hold: 'hold',
};

const TONE_VAR: Record<Tone, string> = {
  neutral: 'ink-2',
  info: 'accent',
  progress: 'accent',
  wait: 'warn',
  ok: 'ok',
  risk: 'risk',
  hold: 'warn',
};

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
  className = '',
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`badge ${TONE_CLASS[tone]} ${className}`.trim()}>
      {dot ? <i className="dot" /> : null}
      {children}
    </span>
  );
}

export function RequestBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge tone={REQUEST_TONE[status] ?? 'neutral'} dot>
      {REQUEST_LABEL[status] ?? status}
    </Badge>
  );
}

export function PositionBadge({ status }: { status: PositionStatus }) {
  return (
    <Badge tone={POSITION_TONE[status] ?? 'neutral'} dot>
      {POSITION_LABEL[status] ?? status}
    </Badge>
  );
}

export function CandidateBadge({ status }: { status: CandidateStatus }) {
  return (
    <Badge tone={CANDIDATE_TONE[status] ?? 'neutral'} dot>
      {CANDIDATE_LABEL[status] ?? status}
    </Badge>
  );
}

export function Card({
  children,
  pad = false,
  lift = false,
  className = '',
  reveal,
}: {
  children: React.ReactNode;
  pad?: boolean;
  lift?: boolean;
  className?: string;
  reveal?: number;
}) {
  return (
    <section
      className={`card ${pad ? 'pad' : ''} ${lift ? 'lift' : ''} ${reveal ? `reveal d${reveal}` : ''} ${className}`.trim()}
    >
      {children}
    </section>
  );
}

export function SectionHead({
  title,
  note,
  right,
}: {
  title: string;
  note?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {note ? <span className="note">{note}</span> : null}
      {right ? <div className="right row">{right}</div> : null}
    </div>
  );
}

export function Notice({
  tone = 'risk',
  children,
}: {
  tone?: 'risk' | 'info' | 'warn' | 'ok';
  children: React.ReactNode;
}) {
  const Icon = tone === 'info' ? Info : tone === 'ok' ? ShieldCheck : FileText;
  return (
    <div className={`notice ${tone === 'risk' ? '' : tone}`.trim()}>
      <Icon size={16} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, note }: { title: string; note?: string }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {note ? <div className="muted">{note}</div> : null}
    </div>
  );
}

/**
 * Ageing drawn against the stage SLA. Four clocks exist in this product (total,
 * stage, active-minus-hold, hold); a queue names which one it is showing.
 */
export function AgeCell({ days, sla = 21 }: { days: number | null; sla?: number }) {
  if (days === null) return <span className="muted tiny">no clock</span>;
  const tone: Tone = days >= sla * 2 ? 'risk' : days >= sla ? 'wait' : 'ok';
  const ratio = Math.min(1, days / Math.max(sla, 1));
  return (
    <span className="age" style={{ color: `var(--${TONE_VAR[tone]})` }}>
      <span className="bar">
        <i style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <span className="tnum">{Math.round(days)}d</span>
    </span>
  );
}

export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) {
  return (
    <span className={`avatar ${size === 'lg' ? 'lg' : ''}`.trim()} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** The KPI tile from the dashboard strip. */
export function Stat({
  label,
  value,
  unit,
  foot,
  tone = 'neutral',
  hint,
  wide = false,
  reveal,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  foot?: React.ReactNode;
  tone?: Tone;
  hint?: string;
  wide?: boolean;
  reveal?: number;
}) {
  return (
    <div className={`metric ${wide ? 'wide' : ''} ${reveal ? `reveal d${reveal}` : ''}`.trim()} title={hint}>
      <div className="mname">
        {label}
        {tone !== 'neutral' ? <i className="dot" style={{ background: `var(--${TONE_VAR[tone]})` }} /> : null}
      </div>
      <div className="mnum tnum">
        {value}
        {unit ? <span className="munit">{unit}</span> : null}
      </div>
      {foot ? <div className="mfoot">{foot}</div> : null}
    </div>
  );
}

export function KeyValue({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="muted">{k}</span>
      <span className="sub">{v}</span>
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  base,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  base: string;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${base}?tab=${t.key}`}
          prefetch={true}
          className={`tab ${t.key === active ? 'on' : ''}`.trim()}
          role="tab"
          aria-selected={t.key === active}
        >
          {t.label}
          {typeof t.count === 'number' ? <span className="n tnum">{t.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

/** Small paperclip/shield glyph set used by document rows and privacy notes. */
export function DocIcon({ exception = false }: { exception?: boolean }) {
  return exception ? <Info size={15} /> : <Paperclip size={15} />;
}

export function PhotoPlaceholder() {
  return <ImageIcon size={15} />;
}

/** Title block for a screen: what this page is, and the actions on it. */
export function PageHead({
  crumb,
  title,
  note,
  right,
}: {
  crumb?: string;
  title: string;
  note?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="pagehead">
      <div>
        {crumb ? <div className="crumb">{crumb}</div> : null}
        <h2>{title}</h2>
        {note ? <div className="note">{note}</div> : null}
      </div>
      {right ? <div className="right row">{right}</div> : null}
    </div>
  );
}

export interface TimelineEntry {
  key: string;
  when: string;
  what: React.ReactNode;
  who?: string | null;
  role?: string | null;
  note?: React.ReactNode;
  variant?: 'key' | 'decision' | 'hold' | 'riskev' | '';
}

/**
 * The audit-visible trail for one record. Only non-sensitive events belong here;
 * the Admin audit register is a separate, append-only view.
 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <Empty title="No movements yet" note="Every status change will appear here with its author and time." />;
  return (
    <div className="timeline">
      {entries.map((e) => (
        <div key={e.key} className={`tl-item ${e.variant ?? ''}`.trim()}>
          <div className="tl-what">{e.what}</div>
          <div className="tl-meta">
            <span className="mono">{fmtDateTime(e.when)}</span>
            {e.who ? <span>{e.who}</span> : null}
            {e.role ? <span className="muted">{e.role}</span> : null}
          </div>
          {e.note ? <div className="tl-note">{e.note}</div> : null}
        </div>
      ))}
    </div>
  );
}

