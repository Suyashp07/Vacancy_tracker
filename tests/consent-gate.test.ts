/**
 * The consent gate, checked where it is actually enforced.
 *
 * The shell promises a signed-in person that hiring records stay read-only until
 * the current notice is accepted. That promise lives in Postgres, in
 * 0009_consent_gate.sql, because a banner can be ignored by an API call. These
 * tests read the migration and hold it against the application's own mirror of
 * the rule, so the two cannot drift into a promise the database does not keep.
 */
import { describe, expect, it } from 'vitest';
import { CONSENT_GATE_KEYS, CONSENT_GATED_TABLES } from '@/lib/constants';
import { migration } from './seed';

const sql = migration('0009_consent_gate.sql');
const normalised = sql.replace(/\s+/g, ' ');

/** Which tables the guard trigger is attached to. */
function gatedTables(): string[] {
  const list = /foreach t in array array\[(.*?)\] loop/i.exec(normalised);
  if (!list) throw new Error('the consent guard attaches to no tables - has the migration been rewritten?');
  return [...list[1].matchAll(/'([a-z_]+)'/gi)].map((m) => m[1]);
}

describe('has_pending_ack()', () => {
  it('asks only about the notices the application also asks about', () => {
    const keys = [...normalised.matchAll(/d\.key in \((.*?)\)/gi)].flatMap((m) => [
      ...[...m[1].matchAll(/'([a-z_]+)'/gi)].map((k) => k[1]),
    ]);
    expect(keys.sort()).toEqual([...CONSENT_GATE_KEYS].sort());
  });

  it('counts only published versions, so a draft can never block a hiring decision', () => {
    expect(normalised).toMatch(/from public\.legal_documents d where d\.status = 'published'/i);
  });

  it('matches an acceptance to that exact document row and that exact account', () => {
    expect(normalised).toMatch(/a\.legal_document_id = d\.id/i);
    expect(normalised).toMatch(/a\.user_id = p_actor/i);
  });

  it('is definer-owned and readable by any signed-in account, because the answer must be its own', () => {
    expect(normalised).toMatch(/create or replace function public\.has_pending_ack\(p_actor uuid\)[\s\S]{0,200}security definer/i);
    expect(normalised).toMatch(/grant execute on function public\.has_pending_ack\(uuid\) to authenticated/i);
  });
});

describe('guard_unacknowledged_write()', () => {
  it('blocks the five tables a person can touch while deciding about a human being', () => {
    expect(gatedTables().sort()).toEqual([...CONSENT_GATED_TABLES].sort());
  });

  it('leaves the accountability tables alone, since publishing the notice is what starts the obligation', () => {
    const tables = gatedTables();
    for (const untouchable of ['audit_events', 'legal_documents', 'legal_document_acks', 'retention_policies', 'dsr_requests']) {
      expect(tables, `${untouchable} must not be gated`).not.toContain(untouchable);
    }
  });

  it('fires before the write, on every row, for inserts and updates alike', () => {
    // The trigger is created from a format() template, so the assertion is on the
    // template: %s is the table name twice and %I the identifier.
    expect(normalised).toMatch(
      /'create trigger trg_%s_ack_gate before insert or update on public\.%I[\s\S]{0,80}?for each row execute function public\.guard_unacknowledged_write\(\)'/i,
    );
    expect(normalised).toMatch(/drop trigger if exists trg_%s_ack_gate/i);
  });

  it('refuses a change rather than silently dropping it, and the refusal is a validation the UI can show', () => {
    expect(normalised).toMatch(/raise exception\s*'validation: accept the current privacy notice/i);
    expect(normalised).toMatch(/errcode = '42501'/i);
  });

  it('lets a write through when there is no interactive account at all, which is the retention worker', () => {
    expect(normalised).toMatch(/if v_actor is null then\s*return new;/i);
    // ...and it reads that identity from the same setting every audit row uses.
    expect(normalised).toMatch(/current_setting\('app\.user_id', true\)/i);
  });
});

describe('the application mirror of the gate', () => {
  it('names the same documents and the same tables, in code as well as in SQL', () => {
    expect(CONSENT_GATE_KEYS).toEqual(['privacy_policy', 'terms_of_use']);
    expect(CONSENT_GATED_TABLES).toEqual([
      'vacancy_requests',
      'positions',
      'candidates',
      'candidate_documents',
      'comments',
    ]);
  });

  it('seeds both notices, so the gate is real on a fresh database rather than theoretical', () => {
    const seed = migration('0004_config_seed.sql').replace(/\s+/g, ' ');
    for (const key of CONSENT_GATE_KEYS) {
      expect(seed, `${key} is not seeded as a legal document`).toContain(`('${key}',`);
    }
  });
});
