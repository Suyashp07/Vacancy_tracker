/**
 * Presentation helpers. Every date is formatted with an explicit Asia/Kolkata
 * time zone and UTC-safe parsing so that a value rendered on the server and
 * re-rendered in the browser cannot drift a day.
 */
import { FY_START_MONTH } from './constants';

export const IST_TIME_ZONE = 'Asia/Kolkata';

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: IST_TIME_ZONE,
});

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: IST_TIME_ZONE,
});

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "16 Oct 2026" */
export function fmtDate(value: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : fallback;
}

/** "16 Oct 2026, 4:20 pm IST" */
export function fmtDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? `${dateTimeFmt.format(d)} IST` : fallback;
}

/** Whole calendar days between a timestamp and "now" (IST day boundary). */
export function daysSince(value: string | Date | null | undefined, now: Date = new Date()): number | null {
  const d = toDate(value);
  if (!d) return null;
  const ms = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** "4 d" / "18 h" / "just now" - compact waiting duration for SLA rails. */
export function fmtDuration(value: string | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return '—';
  const ms = Math.max(0, now.getTime() - d.getTime());
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} d`;
  const months = Math.floor(days / 30);
  if (months < 18) return `${months} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}

/** Indian currency, no decimals - rupees are the unit of discourse here. */
const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function fmtINR(value: number | string | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? inrFmt.format(n) : fallback;
}

/** "₹26,000 – 34,000" / "₹34,000" / "Not stated" */
export function fmtCTCBand(min: number | string | null | undefined, max: number | string | null | undefined): string {
  const lo = min === null || min === undefined || min === '' ? null : Number(min);
  const hi = max === null || max === undefined || max === '' ? null : Number(max);
  if (lo === null && hi === null) return 'Not stated';
  if (hi !== null && lo === null) return `Up to ${fmtINR(hi)}`;
  if (lo !== null && hi === null) return `From ${fmtINR(lo)}`;
  if (lo === hi) return fmtINR(lo);
  // One symbol, on the lower figure where the eye starts reading the band.
  return `${fmtINR(lo)} – ${fmtINR(hi).replace(/^[^\d]+/, '')}`;
}

/** Fiscal-year tag for a date: Apr 2026 - Mar 2027 is "2627". */
export function fiscalYearTag(value: string | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(value) ?? now;
  const ist = new Date(d.toLocaleString('en-US', { timeZone: IST_TIME_ZONE }));
  const startYear = ist.getMonth() >= FY_START_MONTH ? ist.getFullYear() : ist.getFullYear() - 1;
  return `${String(startYear % 100).padStart(2, '0')}${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** "Apr 2026 – Mar 2027" for the period control. */
export function fiscalYearLabel(tag: string): string {
  const start = 2000 + Number(tag.slice(0, 2));
  const end = start + 1;
  return `Apr ${start} – Mar ${end}`;
}

/** The fiscal years offered as a period filter: the current one and the last. */
export function recentFyTags(now: Date = new Date()): string[] {
  const start = 2000 + Number(fiscalYearTag(null, now).slice(0, 2));
  const y = (n: number) => String(n % 100).padStart(2, '0');
  return [`${y(start)}${y(start + 1)}`, `${y(start - 1)}${y(start)}`];
}

export function fiscalYearRange(tag: string): { from: Date; to: Date } {
  const start = 2000 + Number(tag.slice(0, 2));
  return { from: new Date(Date.UTC(start, 3, 1)), to: new Date(Date.UTC(start + 1, 2, 31, 23, 59, 59)) };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Comma-free slug for filenames; never leaks a candidate name into a path. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}
