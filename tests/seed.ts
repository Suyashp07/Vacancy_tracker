/**
 * A reader for the SQL that configures this system.
 *
 * The workflow the interface runs on is not written in TypeScript: it is seeded
 * into workflow_steps and workflow_transitions by 0004_config_seed.sql, and the
 * rules module evaluates whatever those rows say. So the only way to test the
 * real configuration - rather than a copy of it that could drift - is to parse
 * the seed itself and evaluate it with the same pure rules the server uses.
 *
 * This parser understands exactly the shapes the seed files use: quoted
 * literals, array['..']::text[] and bare null/true/false/number tokens inside
 * VALUES lists. It is deliberately strict: an unexpected shape throws rather
 * than guessing, because a silently misread seed would make every test below
 * prove nothing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Cell = string | number | boolean | null | string[];

const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations');

export function migration(name: string): string {
  return readFileSync(resolve(MIGRATIONS, name), 'utf8');
}

function skipWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  return i;
}

/** A Postgres cast suffix, e.g. the "::text[]" that follows an array literal. */
function skipCast(s: string, i: number): number {
  const m = /^::[a-z_[\]0-9]+/i.exec(s.slice(i));
  return m ? i + m[0].length : i;
}

function readQuoted(s: string, i: number): { value: string; next: number } {
  let out = '';
  i += 1;
  while (i < s.length) {
    if (s[i] === "'") {
      if (s[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return { value: out, next: i + 1 };
    }
    out += s[i];
    i += 1;
  }
  throw new Error('unterminated string literal in seed data');
}

function readArray(s: string, i: number): { value: string[]; next: number } {
  i += 'array'.length; // matched case-insensitively by the caller
  if (s[i] !== '[') throw new Error('expected [ after array');
  i += 1;
  const items: string[] = [];
  i = skipWs(s, i);
  if (s[i] === ']') return { value: items, next: i + 1 };
  for (;;) {
    i = skipWs(s, i);
    if (s[i] !== "'") throw new Error('array items in the seed must be quoted literals');
    const q = readQuoted(s, i);
    items.push(q.value);
    i = skipWs(s, q.next);
    if (s[i] === ',') {
      i += 1;
      continue;
    }
    if (s[i] === ']') return { value: items, next: i + 1 };
    throw new Error(`unexpected token inside array literal: ${s.slice(i, i + 24)}`);
  }
}

function readRow(s: string, start: number): { values: Cell[]; next: number } {
  const out: Cell[] = [];
  let i = start + 1;
  for (;;) {
    i = skipWs(s, i);
    if (s[i] === ')') return { values: out, next: i + 1 };
    if (/^array/i.test(s.slice(i, i + 5))) {
      const a = readArray(s, i);
      out.push(a.value);
      i = skipCast(s, a.next);
    } else if (s[i] === "'") {
      const q = readQuoted(s, i);
      out.push(q.value);
      i = q.next;
    } else {
      const m = /^(null|true|false|-?\d+(?:\.\d+)?)/i.exec(s.slice(i));
      if (!m) throw new Error(`cannot parse seed token at: ${s.slice(i, i + 40)}`);
      const raw = m[1];
      out.push(
        /^null$/i.test(raw) ? null : /^true$/i.test(raw) ? true : /^false$/i.test(raw) ? false : Number(raw),
      );
      i += raw.length;
    }
    i = skipWs(s, i);
    if (s[i] === ',') {
      i += 1;
      continue;
    }
    if (s[i] === ')') return { values: out, next: i + 1 };
    throw new Error(`expected , or ) in seed row, found: ${s.slice(i, i + 24)}`);
  }
}

/** Every top-level (…) row inside a VALUES body. */
function readRows(rawBody: string): Cell[][] {
  // A -- comment inside a VALUES list is documentation about the row next to it,
  // not data, so it is removed before parsing. Literals are copied whole, which is
  // what keeps a dash inside a sentence from being read as a comment.
  let body = '';
  let i = 0;
  while (i < rawBody.length) {
    if (rawBody[i] === "'") {
      const q = readQuoted(rawBody, i);
      body += rawBody.slice(i, q.next);
      i = q.next;
      continue;
    }
    if (rawBody[i] === '-' && rawBody[i + 1] === '-') {
      while (i < rawBody.length && rawBody[i] !== '\n') i += 1;
      continue;
    }
    body += rawBody[i];
    i += 1;
  }

  const rows: Cell[][] = [];
  let at = 0;
  for (;;) {
    const open = body.indexOf('(', at);
    if (open === -1) return rows;
    const row = readRow(body, open);
    rows.push(row.values);
    at = row.next;
  }
}

export interface SeedTable {
  columns: string[];
  rows: Record<string, Cell>[];
}

/**
 * The three seeded configuration tables, keyed by workflow. The insert column
 * list is discarded in favour of the `as s(...)` / `as t(...)` alias list, which
 * is what actually labels the values.
 */
export function seededConfig(file = '0004_config_seed.sql'): Map<string, SeedTable> {
  const sql = migration(file);
  const out = new Map<string, SeedTable>();
  const pattern =
    /where key = '(\w+)'\)\s*insert into public\.(workflow_steps|workflow_transitions)\s*\(([\s\S]*?)\)\s*select[\s\S]*?\(\s*values([\s\S]*?)\)\s*as (\w)\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(sql))) {
    const [, workflowKey, table, , body, , aliasList] = m;
    const columns = aliasList
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const rows = readRows(body).map((values) => {
      if (values.length !== columns.length) {
        throw new Error(`${workflowKey}/${table}: row has ${values.length} values, alias list names ${columns.length}`);
      }
      return Object.fromEntries(columns.map((c, idx) => [c, values[idx]])) as Record<string, Cell>;
    });
    const existing = out.get(`${workflowKey}:${table}`);
    if (existing) existing.rows.push(...rows);
    else out.set(`${workflowKey}:${table}`, { columns, rows });
  }
  if (out.size !== 6) throw new Error(`expected six seeded config blocks, found ${out.size}`);
  return out;
}

/**
 * The VALUES list of a plain `insert into <table> (cols) values (...) on conflict`
 * statement: the body runs from "values" to the clause that ends it, because the
 * closing parenthesis sits on the last row rather than on its own line.
 */
function valuesBlock(sql: string, insertHead: string): { columns: string[]; rows: Cell[][] } {
  const head = new RegExp(`${insertHead}\\s*\\(([^)]*)\\)\\s*values`, 'i').exec(sql);
  if (!head) throw new Error(`seed block for ${insertHead} not found`);
  const rest = sql.slice(head.index + head[0].length);
  const end = rest.search(/\n\s*on conflict|\n\s*;/i);
  if (end === -1) throw new Error(`seed block for ${insertHead} never ends`);
  const columns = head[1]
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  return { columns, rows: readRows(rest.slice(0, end)) };
}

/** workflow_definitions rows: the key, its name and the entity it governs. */
export function seededWorkflows(file = '0004_config_seed.sql'): Record<string, Cell>[] {
  const { columns, rows } = valuesBlock(migration(file), 'insert into public\\.workflow_definitions');
  return rows.map((values) => Object.fromEntries(columns.map((c, idx) => [c, values[idx]])) as Record<string, Cell>);
}

/** field_key of every configured form field, per entity type. */
export function seededFieldDefinitions(file = '0004_config_seed.sql'): Map<string, string[]> {
  const { columns, rows } = valuesBlock(migration(file), 'insert into public\\.workflow_field_definitions');
  const entityAt = columns.indexOf('entity_type');
  const keyAt = columns.indexOf('field_key');
  const out = new Map<string, string[]>();
  for (const values of rows) {
    const entity = String(values[entityAt]);
    const key = String(values[keyAt]);
    out.set(entity, [...(out.get(entity) ?? []), key]);
  }
  return out;
}

/** Column names of a created table, from the schema migration. */
export function tableColumns(table: string, file = '0001_init.sql'): string[] {
  const sql = migration(file);
  const start = sql.search(new RegExp(`create table public\\.${table}\\s*\\(`, 'i'));
  if (start === -1) throw new Error(`table ${table} is not created in ${file}`);
  const open = sql.indexOf('(', start);
  let depth = 0;
  let end = open;
  for (; end < sql.length; end += 1) {
    if (sql[end] === '(') depth += 1;
    else if (sql[end] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = sql.slice(open + 1, end);
  const names: string[] = [];
  for (const line of body.split('\n')) {
    const m = /^\s+([a-z_][a-z0-9_]*)\s+[a-z]/i.exec(line);
    if (!m) continue;
    if (/^(constraint|primary|unique|foreign|check|exclude|like)$/.test(m[1])) continue;
    names.push(m[1]);
  }
  return names;
}
