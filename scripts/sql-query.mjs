#!/usr/bin/env node
/**
 * Run one SQL statement against a Supabase project through the Management API
 * and print the rows. Useful when the schema question is "what does the live
 * database actually say" rather than "what do the migration files say".
 *
 *   node scripts/sql-query.mjs --ref <PROJECT_REF> "select count(*) from public.positions"
 *   node scripts/sql-query.mjs --ref <PROJECT_REF> -f query.sql
 *
 * Requires SUPABASE_ACCESS_TOKEN in the environment. The project ref may also
 * be given as the first positional argument.
 */
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const take = (name, short) => {
  const i = argv.findIndex((a) => a === `--${name}` || (short && a === `-${short}`));
  if (i === -1) return undefined;
  const value = argv[i + 1];
  argv.splice(i, 2);
  return value;
};

const ref = take('ref') ?? argv.shift();
const file = take('file', 'f');
const sql = file ? readFileSync(file, 'utf8') : argv.join(' ');
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!ref || !sql || !token) {
  process.stderr.write('usage: node scripts/sql-query.mjs --ref <REF> "<sql>" | -f <file>\n');
  process.exit(1);
}

// Long or quote-heavy statements are better passed with -f: shells disagree
// about what a double quote inside a double-quoted argument means.
const body = JSON.stringify({ query: sql });
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body,
});
const text = await res.text();
if (!res.ok) {
  process.stderr.write(`${res.status}: ${text}\n`);
  process.exit(1);
}
try {
  const rows = JSON.parse(text);
  process.stdout.write(`${JSON.stringify(rows, null, 2).replace(/\\n/g, '\n')}\n`);
} catch {
  process.stdout.write(`${text}\n`);
}
