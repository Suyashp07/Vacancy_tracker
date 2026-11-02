/**
 * The presentation helpers that a report or an ageing rail depends on.
 *
 * Two of these have real consequences rather than cosmetic ones: the fiscal-year
 * tag decides which rows a period filter counts, and the IST boundary decides
 * whether a deadline shown on the server is the same day shown in a browser.
 */
import { describe, expect, it } from 'vitest';
import {
  daysSince,
  fmtCTCBand,
  fmtDate,
  fmtDuration,
  fmtINR,
  fiscalYearLabel,
  fiscalYearRange,
  fiscalYearTag,
  initials,
  pct,
  recentFyTags,
  slug,
} from '@/lib/format';

describe('fiscal year', () => {
  it('runs April to March, so the new year starts on 1 April and not on 1 January', () => {
    expect(fiscalYearTag(new Date('2026-03-31T18:00:00Z'))).toBe('2526');
    expect(fiscalYearTag(new Date('2026-04-01T18:00:00Z'))).toBe('2627');
    expect(fiscalYearLabel('2627')).toBe('Apr 2026 – Mar 2027');
  });

  it('assigns by Indian time, so the year turns at midnight in Pune rather than at midnight in UTC', () => {
    // IST is UTC+05:30, so 1 April begins in India at 18:30 UTC on 31 March.
    expect(fiscalYearTag(new Date('2026-03-31T18:29:00Z'))).toBe('2526'); // 23:59 in Pune
    expect(fiscalYearTag(new Date('2026-03-31T18:31:00Z'))).toBe('2627'); // 00:01 in Pune
    // A bare calendar date from a date column has no zone to shift it out of.
    expect(fiscalYearTag('2026-03-31')).toBe('2526');
  });

  it('keeps the closing hours of a fiscal year inside that year', () => {
    expect(fiscalYearTag(new Date('2027-03-31T18:29:00Z'))).toBe('2627'); // 23:59 IST, 31 Mar
    expect(fiscalYearTag(new Date('2027-04-01T00:00:00Z'))).toBe('2728'); // 05:30 IST, 1 Apr
  });

  it('spans the whole year inclusive of 31 March midnight', () => {
    const { from, to } = fiscalYearRange('2627');
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(to.getUTCFullYear()).toBe(2027);
    expect(to.getUTCMonth()).toBe(2);
    expect(to.getUTCDate()).toBe(31);
  });

  it('offers the current year and the one before it as the period control', () => {
    expect(recentFyTags(new Date('2026-10-16T06:00:00Z'))).toEqual(['2627', '2526']);
    expect(recentFyTags(new Date('2026-02-01T06:00:00Z'))).toEqual(['2526', '2425']);
  });

  it('falls back to now when no date is given', () => {
    expect(fiscalYearTag(null, new Date('2027-01-01T06:00:00Z'))).toBe('2627');
    expect(fiscalYearTag('not a date', new Date('2027-01-01T06:00:00Z'))).toBe('2627');
  });
});

describe('dates and durations', () => {
  it('renders an explicit day in Indian time and keeps the empty case readable', () => {
    expect(fmtDate(new Date('2026-10-16T18:30:00Z'))).toBe('17 Oct 2026');
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined, 'not yet')).toBe('not yet');
  });

  it('never counts a wait as negative and never invents a day', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    expect(daysSince(new Date('2026-10-06T12:00:00Z'), now)).toBe(10);
    expect(daysSince(new Date('2026-10-16T11:00:00Z'), now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
  });

  it('switches unit as the wait grows, so an ageing rail stays one token wide', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
    expect(fmtDuration(hoursAgo(0.001), now)).toBe('just now');
    expect(fmtDuration(hoursAgo(0.5), now)).toBe('30 min');
    expect(fmtDuration(hoursAgo(5), now)).toBe('5 h');
    expect(fmtDuration(daysAgo(1), now)).toBe('1 d');
    // Days give way to months at 60, months give way to years at 18 of them -
    // a vacancy that has run for a year and a half is reported as a year and a half.
    expect(fmtDuration(daysAgo(59), now)).toBe('59 d');
    expect(fmtDuration(daysAgo(61), now)).toBe('2 mo');
    expect(fmtDuration(daysAgo(200), now)).toBe('6 mo');
    expect(fmtDuration(daysAgo(539), now)).toBe('17 mo');
    expect(fmtDuration(daysAgo(540), now)).toBe('1.5 yr');
    expect(fmtDuration(null, now)).toBe('—');
  });
});

describe('money', () => {
  it('groups in the Indian system, because that is how a CTC is read here', () => {
    expect(fmtINR(100000)).toBe('₹1,00,000');
    expect(fmtINR(null)).toBe('—');
    expect(fmtINR('abc')).toBe('—');
  });

  it('shows a band with one symbol, a single side, or an honest absence', () => {
    // The symbol belongs on the figure the eye reaches first, not on both.
    expect(fmtCTCBand(26000, 34000)).toBe('₹26,000 – 34,000');
    expect(fmtCTCBand(100000, 250000)).toBe('₹1,00,000 – 2,50,000');
    expect(fmtCTCBand(34000, 34000)).toBe('₹34,000');
    expect(fmtCTCBand(null, 34000)).toBe('Up to ₹34,000');
    expect(fmtCTCBand(26000, null)).toBe('From ₹26,000');
    expect(fmtCTCBand(null, null)).toBe('Not stated');
    expect(fmtCTCBand('', '')).toBe('Not stated');
  });
});

describe('small helpers', () => {
  it('takes at most two initials, for an avatar that never overflows', () => {
    expect(initials('Ankur Prakash')).toBe('AP');
    expect(initials('ankur')).toBe('A');
    expect(initials('  ')).toBe('');
  });

  it('slugs a filename without leaving a name in the path', () => {
    expect(slug("Resume (Final)'26.pdf")).toBe('resume-final-26-pdf');
    expect(slug('Arun Kumar Sharma')).toBe('arun-kumar-sharma');
  });

  it('rounds a share and never divides by an empty denominator', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});
