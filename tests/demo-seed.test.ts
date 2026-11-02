/**
 * Checks on the demo register in supabase/seed.sql.
 *
 * That file cannot be executed in this environment - there is no database to
 * load it into - which would normally mean it goes to production unverified. So
 * these tests read it as data and hold it against the live schema: every column
 * name, every enum label, every foreign key, and the invariants the database
 * itself would enforce (status cascades, document gates, hold overlays, task
 * shapes, unbroken status chains). A demo that fails one of these is a demo that
 * shows a reviewer an impossible screen, which is worse than no demo at all.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seededConfig } from './seed';

const ROOT = resolve(process.cwd(), 'supabase');
const SEED = readFileSync(resolve(ROOT, 'seed.sql'), 'utf8');
const MIGRATIONS = readdirSync(resolve(ROOT, 'migrations'))
  .filter((f: string) => f.endsWith('.sql'))
  .sort()
  .map((f: string) => readFileSync(resolve(ROOT, 'migrations', f), 'utf8'));

// ---------------------------------------------------------------------------
// a tolerant reader for VALUES lists: expressions we do not model (subselects,
// now() - interval '..', typed literals) become opaque instead of throwing,
// because the point is to check the literals that ARE static.
// ---------------------------------------------------------------------------
type Cell = string | number | boolean | null | { expr: string };
const EXPR = (c: Cell): c is { expr: string } => typeof c === 'object' && c !== null && 'expr' in c;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Skip whitespace and -- comments. */
function ws(s: string, i: number): number {
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (s[i] === '-' && s[i + 1] === '-') {
      while (i < s.length && s[i] !== '\n') i += 1;
      continue;
    }
    return i;
  }
}

/** Index just past the closing quote of the literal that starts at `open`. */
function skipLiteral(s: string, open: number): number {
  let i = open + 1;
  while (i < s.length) {
    if (s[i] === "'") {
      if (s[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  throw new Error('unterminated string literal in seed data');
}

/** Read one cell, from the current index to the next top-level , or ). */
function readCell(s: string, start: number): { value: Cell; next: number } {
  let i = ws(s, start);
  let depth = 0;
  const from = i;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") {
      i += 1;
      while (i < s.length) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      if (depth === 0) break;
      depth -= 1;
    } else if (ch === ',' && depth === 0) break;
    i += 1;
  }
  const raw = s.slice(from, i).trim();
  return { value: classify(raw), next: i };
}

function classify(raw: string): Cell {
  if (/^null$/i.test(raw)) return null;
  if (/^true$/i.test(raw)) return true;
  if (/^false$/i.test(raw)) return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  // A single quoted literal, with an optional cast: 'Resume' or 'x'::inet. A
  // literal holding an escaped quote is left as an expression rather than
  // half-parsed, because silently misreading it would make a check prove nothing.
  const m = /^'([\s\S]*)'(?:::[\w_[\]]+)?$/.exec(raw);
  if (m && !raw.slice(1, -1).includes("''")) return m[1];
  return { expr: raw };
}

/** Every `( ... )` row inside a VALUES body. */
function readRows(body: string): Cell[][] {
  // Comments are annotations on the row beside them, not data. Dropping them
  // first means a stray apostrophe or bracket in prose cannot be misread.
  let clean = '';
  for (let i = 0; i < body.length; ) {
    if (body[i] === "'") {
      const close = skipLiteral(body, i);
      clean += body.slice(i, close);
      i = close;
      continue;
    }
    if (body[i] === '-' && body[i + 1] === '-') {
      while (i < body.length && body[i] !== '\n') i += 1;
      continue;
    }
    clean += body[i];
    i += 1;
  }
  body = clean;

  const rows: Cell[][] = [];
  let i = 0;
  for (;;) {
    const open = body.indexOf('(', i);
    if (open === -1) return rows;
    // Skip a paren that opens a subselect rather than a row.
    const head = body.slice(open + 1, ws(body, open + 1) + 40).trimStart();
    if (/^select\b/i.test(head) || /^case\b/i.test(head)) {
      const close = findClose(body, open);
      i = close + 1;
      continue;
    }
    const values: Cell[] = [];
    let j = open + 1;
    for (;;) {
      const cell = readCell(body, j);
      values.push(cell.value);
      j = ws(body, cell.next);
      if (body[j] === ',') {
        j += 1;
        continue;
      }
      if (body[j] === ')') {
        j += 1;
        break;
      }
      throw new Error(`cannot read past cell in seed row: ${body.slice(j, j + 60)}`);
    }
    rows.push(values);
    i = j;
  }
}

function findClose(s: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < s.length) {
    if (s[i] === "'") {
      i += 1;
      while (i < s.length && s[i] !== "'") i += 1;
    } else if (s[i] === '(') depth += 1;
    else if (s[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  throw new Error('unbalanced parenthesis in seed');
}

export interface SeedInsert {
  table: string;
  columns: string[];
  rows: Record<string, Cell>[];
}

const inserts: SeedInsert[] = [];
{
  const head = /insert\s+into\s+public\.(\w+)\s*\(([^)]*)\)\s*values/gi;
  let m: RegExpExecArray | null;
  while ((m = head.exec(SEED))) {
    const table = m[1];
    const bodyStart = m.index + m[0].length;
    // The VALUES list ends at a top-level `on conflict` or the statement's ';'.
    let i = bodyStart;
    let depth = 0;
    let end = -1;
    while (i < SEED.length) {
      const ch = SEED[i];
      if (ch === "'") {
        i += 1;
        while (i < SEED.length) {
          if (SEED[i] === "'") {
            if (SEED[i + 1] === "'") {
              i += 2;
              continue;
            }
            break;
          }
          i += 1;
        }
      } else if (ch === '-' && SEED[i + 1] === '-') {
        // A comment line is prose: it can hold a semicolon or an unbalanced
        // quote, and neither means anything to the statement.
        while (i < SEED.length && SEED[i] !== '\n') i += 1;
      } else if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      else if (ch === ';' && depth === 0) {
        end = i;
        break;
      } else if (depth === 0 && /^on\s+conflict\b/i.test(SEED.slice(i, i + 12))) {
        end = i;
        break;
      }
      i += 1;
    }
    if (end === -1) throw new Error(`insert into ${table} has no terminator`);
    const columns = m[2]
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const rows = readRows(SEED.slice(bodyStart, end)).map((values) => {
      if (values.length !== columns.length) {
        throw new Error(
          `${table}: a row has ${values.length} values for ${columns.length} columns (${columns.join(', ')})`,
        );
      }
      return Object.fromEntries(columns.map((c, idx) => [c, values[idx]])) as Record<string, Cell>;
    });
    inserts.push({ table: m[1], columns, rows });
  }
}

function block(table: string): SeedInsert {
  const found = inserts.find((i) => i.table === table);
  if (!found) throw new Error(`the demo seed never inserts into ${table}`);
  return found;
}

// ---------------------------------------------------------------------------
// schema facts, read from the migrations rather than restated here
// ---------------------------------------------------------------------------
function tableBody(table: string): string {
  for (const sql of MIGRATIONS) {
    const start = sql.search(new RegExp(`create table public\\.${table}\\s*\\(`, 'i'));
    if (start !== -1) {
      const open = sql.indexOf('(', start);
      const close = findClose(sql, open);
      return sql.slice(open + 1, close);
    }
  }
  throw new Error(`table ${table} is not created by any migration`);
}

function columnsOf(table: string): Set<string> {
  const names = new Set<string>();
  for (const line of tableBody(table).split('\n')) {
    const m = /^\s+([a-z_][a-z0-9_]*)\s+[a-z]/i.exec(line);
    if (!m) continue;
    if (/^(constraint|primary|unique|foreign|check|exclude|like|create)$/.test(m[1])) continue;
    names.add(m[1]);
  }
  for (const sql of MIGRATIONS) {
    const added = new RegExp(`alter\\s+table\\s+(?:only\\s+)?public\\.${table}\\s+add\\s+column\\s+([a-z_][a-z0-9_]*)`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = added.exec(sql))) names.add(m[1]);
  }
  return names;
}

/** enum name -> labels, from every create type statement. */
const ENUMS = new Map<string, string[]>();
for (const sql of MIGRATIONS) {
  const t = /create\s+type\s+public\.(\w+)\s+as\s+enum\s*\(([\s\S]*?)\);/gi;
  let m: RegExpExecArray | null;
  while ((m = t.exec(sql))) {
    const labels = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    ENUMS.set(m[1], labels);
  }
}

/** Columns of a table typed as one of the enums, and their enum name. */
function enumColumnsOf(table: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of tableBody(table).split('\n')) {
    const m = /^\s+([a-z_][a-z0-9_]*)\s+public\.(\w+)\b/i.exec(line);
    if (m && ENUMS.has(m[2])) out.set(m[1], m[2]);
  }
  return out;
}

/** `check (col in ('a','b'))` constraints declared on a table. */
function checkListsOf(table: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const body = tableBody(table);
  for (const m of body.matchAll(/check\s*\(\s*([a-z_][a-z0-9_]*)\s+(?:not\s+)?in\s*\(([^)]*)\)/gi)) {
    out.set(m[1], [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. the seed is well-formed SQL for this schema
// ---------------------------------------------------------------------------
describe('demo seed against the schema', () => {
  it('inserts into tables that exist, with columns that exist', () => {
    for (const ins of inserts) {
      const known = columnsOf(ins.table);
      for (const col of ins.columns) {
        expect(known.has(col), `${ins.table}.${col} is not a column of the table`).toBe(true);
      }
    }
  });

  it('names every column at most once and gives every row the same width', () => {
    for (const ins of inserts) {
      expect(new Set(ins.columns).size, `${ins.table} repeats a column`).toBe(ins.columns.length);
      const widths = new Set(
        ins.rows.map((r) => Object.keys(r).length),
      );
      expect(widths.size, `${ins.table} rows differ in width`).toBe(1);
    }
  });

  it('uses only labels its enum type declares', () => {
    const offenders: string[] = [];
    for (const ins of inserts) {
      const cols = enumColumnsOf(ins.table);
      for (const [rowIdx, row] of ins.rows.entries()) {
        for (const [col, enumName] of cols) {
          const value = row[col];
          if (value === undefined || EXPR(value) || value === null) continue;
          if (!ENUMS.get(enumName)!.includes(String(value))) {
            offenders.push(`${ins.table} row ${rowIdx}: ${col} = ${String(value)} is not a ${enumName}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('respects the check (col in (...)) constraints', () => {
    const offenders: string[] = [];
    for (const ins of inserts) {
      const lists = checkListsOf(ins.table);
      for (const [rowIdx, row] of ins.rows.entries()) {
        for (const [col, allowed] of lists) {
          const value = row[col];
          if (value === undefined || EXPR(value) || value === null) continue;
          if (!allowed.includes(String(value))) {
            offenders.push(`${ins.table} row ${rowIdx}: ${col} = ${String(value)} not in (${allowed.join(', ')})`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('references rows that the seed actually creates', () => {
    const ids = new Map<string, Set<string>>();
    for (const ins of inserts) {
      if (!ins.columns.includes('id')) continue;
      ids.set(
        ins.table,
        new Set(ins.rows.map((r) => String(r.id)).filter((v) => UUID.test(v))),
      );
    }
    // Accounts live in auth.users, which the seed fills before anything else;
    // public.users carries the same ids, so that is the set to test against.
    ids.set('users', new Set(block('users').rows.map((r) => String(r.id))));

    const BY_TABLE: Record<string, string> = {
      request_id: 'vacancy_requests',
      parent_request_id: 'vacancy_requests',
      position_id: 'positions',
      candidate_id: 'candidates',
      document_id: 'candidate_documents',
      task_id: 'approval_tasks',
      user_id: 'users',
      legal_document_id: 'legal_documents',
      recipient_id: 'users',
      handler_id: 'users',
      actor_id: 'users',
      actor_user_id: 'users',
      assigned_user_id: 'users',
    };

    const broken: string[] = [];
    for (const ins of inserts) {
      for (const [rowIdx, row] of ins.rows.entries()) {
        for (const [col, value] of Object.entries(row)) {
          if (EXPR(value) || value === null || typeof value !== 'string') continue;
          if (!UUID.test(value)) continue;
          let target: string | undefined;
          if (BY_TABLE[col]) target = BY_TABLE[col];
          else if (col.endsWith('_by')) target = 'users';
          else if (col === 'entity_id') target = entityFamily(row);
          if (!target || !ids.has(target)) continue;
          if (!ids.get(target)!.has(value)) {
            broken.push(`${ins.table} row ${rowIdx}: ${col} -> ${value} is not a ${target} id in the seed`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('only points at facilities that the configuration seeds', () => {
    // The codes the live configuration actually inserts, taken from inside that
    // insert statement so no other quoted string in the file can count as one.
    const seededFacilities = MIGRATIONS.map((sql) => {
      const at = sql.search(/insert into public\.facilities\s*\(/i);
      if (at === -1) return '';
      return sql.slice(at, sql.search(/\n\s*(on conflict|;)/i) === -1 ? at + 4000 : sql.length);
    }).join('\n');
    const configCodes = new Set(
      [...seededFacilities.matchAll(/^\s*\('([A-Z][A-Z0-9-]*)',/gm)].map((m) => m[1]),
    );
    expect(configCodes.size, 'the facility seed was not found at all').toBeGreaterThan(5);

    const used = [...SEED.matchAll(/public\.facilities where code = '([A-Z0-9-]+)'/g)].map((m) => m[1]);
    for (const code of new Set(used)) {
      expect(configCodes.has(code), `facility ${code} is used by the demo but not seeded`).toBe(true);
    }
    // Six distinct sites is the point of the demo: scope filtering needs them.
    expect(new Set(used).size).toBeGreaterThanOrEqual(6);
  });
});

/** The table an entity_id points at, from the sibling entity_type. */
function entityFamily(row: Record<string, Cell>): string | undefined {
  const kind = row.entity_type;
  if (typeof kind !== 'string') return undefined;
  const map: Record<string, string> = {
    vacancy_request: 'vacancy_requests',
    position: 'positions',
    candidate: 'candidates',
    candidate_document: 'candidate_documents',
  };
  return map[kind];
}

// ---------------------------------------------------------------------------
// 2. the register tells a coherent story
// ---------------------------------------------------------------------------
describe('demo register coherence', () => {
  const requests = block('vacancy_requests').rows;
  const positions = block('positions').rows;
  const candidates = block('candidates').rows;
  const docs = block('candidate_documents').rows;
  const tasks = block('approval_tasks').rows;

  it('covers every stage the workflow can be in', () => {
    const requestStates = new Set(requests.map((r) => r.status));
    const positionStates = new Set(positions.map((p) => p.status));
    const candidateStates = new Set(candidates.map((c) => c.status));
    for (const s of ['draft', 'submitted_for_vacancy_approval', 'approved', 'returned_for_information', 'rejected', 'closed']) {
      expect(requestStates.has(s), `no demo request sits in ${s}`).toBe(true);
    }
    for (const s of ['awaiting_vacancy_approval', 'sourcing', 'hold', 'sent_for_candidate_approval', 'approved_for_joining', 'hired', 'position_closed', 'draft']) {
      expect(positionStates.has(s), `no demo position sits in ${s}`).toBe(true);
    }
    for (const s of ['draft', 'submitted_for_recruitment_approval', 'approved_for_joining', 'hired', 'candidature_unsuccessful', 'rejected', 'returned_for_modifications']) {
      expect(candidateStates.has(s), `no demo candidate sits in ${s}`).toBe(true);
    }
  });

  it('spans two fiscal years so the period control has a choice', () => {
    const years = new Set(requests.map((r) => String(r.number).split('-')[1]));
    expect(years.size).toBe(2);
    for (const y of years) expect(y).toMatch(/^\d{4}$/);
  });

  it('gives every request the number of positions it asked for', () => {
    // create_request always fans quantity out into position rows, draft included,
    // so a demo request without its positions would open on an empty pipeline.
    for (const r of requests) {
      const mine = positions.filter((p) => p.request_id === r.id);
      expect(String(mine.length), `${r.number}: quantity ${r.quantity} but ${mine.length} position rows`).toBe(
        String(r.quantity),
      );
      const numbers = new Set(mine.map((p) => String(p.position_number)));
      expect(numbers.size, `${r.number}: two positions share a number`).toBe(mine.length);
      for (const p of mine) {
        expect(String(p.position_number), `${r.number}: a position has no number`).not.toMatch(/^\s*$/);
        expect(String(p.position_number).startsWith(`${r.number}-P`), `${p.position_number} does not belong to ${r.number}`).toBe(true);
      }
    }
  });

  it('keeps a request decision and its positions in step, the way the transition cascade does', () => {
    const offenders: string[] = [];
    for (const request of requests) {
      const mine = positions.filter((p) => p.request_id === request.id);
      expect(mine.length, `${request.number} has no positions`).toBeGreaterThan(0);
      for (const p of mine) {
        const ps = String(p.status);
        switch (request.status) {
          case 'draft':
          case 'returned_for_information':
            if (ps !== 'draft') offenders.push(`${request.number} is ${request.status} but ${p.position_number} is ${ps}`);
            break;
          case 'submitted_for_vacancy_approval':
            if (ps !== 'awaiting_vacancy_approval') offenders.push(`${request.number} is ${request.status} but ${p.position_number} is ${ps}`);
            break;
          case 'rejected':
          case 'closed':
            if (ps !== 'position_closed' && ps !== 'hired') offenders.push(`${request.number} is ${request.status} but ${p.position_number} is ${ps}`);
            break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('only calls a position hired when exactly one candidate joined and the date is recorded', () => {
    for (const p of positions.filter((x) => x.status === 'hired')) {
      const hired = candidates.filter((c) => c.position_id === p.id && c.status === 'hired');
      expect(hired.length, `${p.position_number} is hired with ${hired.length} hired candidates`).toBe(1);
      expect(EXPR(p.hired_at) || p.hired_at !== null, `${p.position_number} is hired without hired_at`).toBe(true);
      expect(hired[0].actual_joining_date, 'the joined candidate has no joining date').toBeDefined();
    }
  });

  it('wears the hold overlay only while held', () => {
    for (const p of positions) {
      const held = p.status === 'hold';
      expect(p.previous_status_before_hold === null || p.previous_status_before_hold === undefined, `${p.position_number}: overlay set on a ${p.status} position`).toBe(!held);
      if (held) {
        expect(String(p.hold_reason ?? '').length, `${p.position_number} is held without a reason`).toBeGreaterThan(20);
        expect(p.hold_start_date, `${p.position_number} is held without a start date`).not.toBeNull();
      }
    }
  });

  it('lets a candidate into the approval flow only with both mandatory documents, or on a recorded exception', () => {
    const gated = ['submitted_for_recruitment_approval', 'approved_for_joining', 'hired'];
    for (const c of candidates.filter((x) => gated.includes(String(x.status)))) {
      const mine = docs.filter((d) => d.candidate_id === c.id);
      const types = new Set(mine.map((d) => String(d.document_type)));
      const excused = mine.some((d) => d.is_exception === true);
      const missing = ['Resume', 'Photograph'].filter((t) => !types.has(t));
      expect(
        missing.length === 0 || excused,
        `${c.full_name} sits in ${c.status} without ${missing.join(', ')} and without an exception`,
      ).toBe(true);
    }
  });

  it('matches each pending task to the state its subject is really in', () => {
    const byId = new Map(requests.map((r) => [r.id, r]));
    const posById = new Map(positions.map((p) => [p.id, p]));
    const candById = new Map(candidates.map((c) => [c.id, c]));
    const EXPECT: Record<string, string[]> = {
      vacancy_approval: ['submitted_for_vacancy_approval'],
      candidate_approval: ['submitted_for_recruitment_approval'],
      joining_confirmation: ['approved_for_joining'],
      hold_review: ['hold'],
      clarification: ['returned_for_information'],
      budget_review: ['submitted_for_vacancy_approval'],
    };
    const offenders: string[] = [];
    for (const t of tasks.filter((x) => x.status === 'pending')) {
      const type = String(t.task_type);
      if (type === 'vacancy_approval' || type === 'clarification' || type === 'budget_review') {
        const r = byId.get(String(t.entity_id));
        if (r && !EXPECT[type].includes(String(r.status))) offenders.push(`${type} pending but ${r.number} is ${r.status}`);
      }
      if (type === 'candidate_approval' || type === 'joining_confirmation') {
        const c = candById.get(String(t.entity_id));
        if (c && !EXPECT[type].includes(String(c.status))) offenders.push(`${type} pending but ${c.full_name} is ${c.status}`);
      }
      if (type === 'hold_review') {
        const p = posById.get(String(t.entity_id));
        if (p && p.status !== 'hold') offenders.push(`hold_review pending but ${p.position_number} is ${p.status}`);
      }
      expect(t.acted_at, `${type} is pending but already acted`).toBeNull();
    }
    expect(offenders).toEqual([]);
  });

  it('records who acted and how on every closed task', () => {
    for (const t of tasks.filter((x) => x.status !== 'pending')) {
      expect(t.acted_at, `${t.task_type} is ${t.status} without acted_at`).not.toBeNull();
      if (t.status === 'acted' || t.status === 'cancelled') {
        expect(t.action, `${t.task_type} ${t.status} without an action`).not.toBeNull();
        expect(t.acted_by, `${t.task_type} ${t.status} without an actor`).not.toBeNull();
      }
    }
  });

  it('assigns each task to a role or a named person, never to neither', () => {
    for (const t of tasks) {
      expect(
        t.assigned_role !== null || t.assigned_user_id !== null,
        `task for ${t.entity_type} is unassigned`,
      ).toBe(true);
    }
  });

  it('leaves exactly one account standing at the consent gate', () => {
    // The acknowledgements are written as one cross join, so the gate is defined
    // by the single account that join excludes.
    const stmt = /insert into public\.legal_document_acks[\s\S]*?on conflict[^;]*;/i.exec(SEED);
    expect(stmt, 'the seed never acknowledges any account').not.toBeNull();
    const excluded = [...stmt![0].matchAll(/u\.email\s*(?:<>|!=)\s*'([^']+)'/g)].map((x) => x[1]);
    expect(excluded.length, 'the gate should exclude exactly one account').toBe(1);
    const gate = block('users').rows.filter((u) => String(u.email) === excluded[0]);
    expect(gate.length).toBe(1);
    expect(gate[0].role, 'the gated account should be the Employee, who can raise a request').toBe('Employee');
    expect(block('users').rows.length).toBeGreaterThan(1);
    // Every notice the gate checks must actually be published, and the demo may
    // not invent a document key the configuration does not declare.
    const declared = new Set<string>();
    for (const sql of MIGRATIONS) {
      const at = sql.search(/insert into public\.legal_documents\s*\(/i);
      if (at === -1) continue;
      const rest = sql.slice(at);
      const region = rest.slice(0, rest.search(/\non conflict/i) === -1 ? rest.length : rest.search(/\non conflict/i));
      for (const m of region.matchAll(/^\s*\('([a-z_0-9]+)'\s*,/gm)) declared.add(m[1]);
    }
    expect(declared.size, 'no legal documents are declared by the configuration').toBeGreaterThan(2);
    const publish = /update public\.legal_documents\s+set status = 'published'[\s\S]*?and key in \(([^)]*)\)/i.exec(SEED);
    expect(publish, 'the seed never publishes the notices').not.toBeNull();
    const published = [...publish![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    for (const key of published) {
      expect(declared.has(key), `${key} is published by the demo but declared nowhere`).toBe(true);
    }
    expect(published).toContain('privacy_policy');
    expect(published.length).toBe(declared.size);
  });

  it('writes audit rows with an action the interface can categorise', () => {
    const kinds = new Set(['vacancy_request', 'position', 'candidate', 'document', 'auth', 'access', 'legal', 'user', 'dsr', 'retention']);
    for (const a of block('audit_events').rows) {
      const [kind, ...rest] = String(a.action).split('.');
      expect(kinds.has(kind), `audit action ${a.action} falls outside the register's categories`).toBe(true);
      expect(rest.length, `audit action ${a.action} has no verb`).toBeGreaterThan(0);
    }
  });

  it('shows refusals as well as successes, which is the point of the register', () => {
    const results = block('audit_events').rows.map((a) => String(a.result));
    expect(results.filter((r) => r === 'denied').length).toBeGreaterThan(1);
    expect(results).toContain('validation_error');
    expect(results).toContain('conflict');
    expect(results).toContain('failure');
    expect(results.filter((r) => r === 'success').length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// 3. the authored history is a walk the configured workflow would actually allow
// ---------------------------------------------------------------------------
describe('demo status history', () => {
  const edges = new Map<string, Set<string>>();
  {
    const config = seededConfig();
    for (const [key, table] of config) {
      if (!key.endsWith(':workflow_transitions')) continue;
      const workflow = key.split(':')[0];
      const set = edges.get(workflow) ?? new Set<string>();
      for (const row of table.rows) {
        set.add(`${row.from_status}->${row.to_status}`);
      }
      edges.set(workflow, set);
    }
  }

  // The transition table describes only the moves a person takes. The server
  // also changes a position by itself, and those edges exist nowhere in the
  // configuration: attaching the first candidate makes a sourcing position
  // "we have somebody" (0006_candidates.sql), and resuming a hold restores the
  // stage the hold was taken from (resume_position, 0005_transitions.sql).
  const AUTOMATIC = new Set(['sourcing->candidate_available']);

  const CASES: { table: string; workflow: string; fk: string; live: SeedInsert; statusCol: string }[] = [
    { table: 'vacancy_request_status_history', workflow: 'vacancy_request_default', fk: 'request_id', live: block('vacancy_requests'), statusCol: 'status' },
    { table: 'position_status_history', workflow: 'position_default', fk: 'position_id', live: block('positions'), statusCol: 'status' },
    { table: 'candidate_status_history', workflow: 'candidate_default', fk: 'candidate_id', live: block('candidates'), statusCol: 'status' },
  ];

  it('knows the three configured workflows', () => {
    for (const c of CASES) {
      expect(edges.has(c.workflow), `no configured transitions for ${c.workflow}`).toBe(true);
    }
  });

  for (const c of CASES) {
    it(`chains ${c.table} without gaps, and ends where the record now sits`, () => {
      const history = block(c.table).rows;
      const current = new Map(c.live.rows.map((r) => [String(r.id), String(r.status)]));
      const allowed = edges.get(c.workflow)!;
      const grouped = new Map<string, Record<string, Cell>[]>();
      for (const h of history) {
        const key = String(h[c.fk]);
        grouped.set(key, [...(grouped.get(key) ?? []), h]);
      }
      for (const [id, chain] of grouped) {
        const label = c.live.rows.find((r) => String(r.id) === id);
        const name = String(label?.number ?? label?.position_number ?? label?.full_name ?? id);
        expect(chain[0].from_status, `${name}: history should start at draft`).toBe('draft');
        // resume_position is a dedicated RPC that puts a held position back into
        // the stage it was held from, which the transition table cannot express as
        // one edge. Allow only a status this record genuinely came out of.
        const seenTo = new Set<string>();
        for (const [i, step] of chain.entries()) {
          if (i > 0) {
            expect(
              String(chain[i - 1].to_status) === String(step.from_status),
              `${name}: history jumps from ${chain[i - 1].to_status} to ${step.from_status}`,
            ).toBe(true);
          }
          const edge = `${step.from_status}->${step.to_status}`;
          const serverMade =
            c.workflow === 'position_default' &&
            (AUTOMATIC.has(edge) ||
              // a resume only ever returns to a stage this record had reached
              (String(step.from_status) === 'hold' && seenTo.has(String(step.to_status))));
          expect(
            serverMade || allowed.has(edge),
            `${name}: ${step.from_status} -> ${step.to_status} is not a transition the workflow defines`,
          ).toBe(true);
          seenTo.add(String(step.to_status));
        }
        expect(String(chain[chain.length - 1].to_status), `${name}: history does not end at its live status`).toBe(
          current.get(id),
        );
      }
      // Anything that has moved at all must have history, or the timeline on the
      // detail screen shows a record that appeared out of nowhere.
      for (const row of c.live.rows) {
        if (String(row.status) === 'draft') continue;
        expect(grouped.has(String(row.id)), `${name(row)} has status ${row.status} and no history`).toBe(true);
      }
    });
  }
});

function name(row: Record<string, Cell>): string {
  return String(row.number ?? row.position_number ?? row.full_name ?? row.id);
}
