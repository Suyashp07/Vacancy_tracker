#!/usr/bin/env node
/**
 * Provision the Supabase project behind the hiring tracker, end to end.
 *
 *   $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'   # https://supabase.com/dashboard/account/tokens
 *   node scripts/provision-supabase.mjs
 *
 * What it does, in order:
 *   1. finds (or creates) a Supabase project for this app and waits for it to
 *      report healthy;
 *   2. applies supabase/migrations/0001..0009, then storage.sql, then seed.sql
 *      through the Management API, so no local Postgres or Docker is involved;
 *   3. reads the anon and service-role keys and writes .env.local;
 *   4. pushes the same values into the linked Vercel project as environment
 *      variables for production and preview, so `vercel deploy --prod` works
 *      immediately afterwards.
 *
 * It is safe to re-run: migrations are skipped when the schema is already
 * present, storage.sql is idempotent, and seed.sql refuses to load a second
 * copy of the demo register (pass --reseed to run its teardown first).
 *
 * Nothing here writes the access token anywhere; it is read from the
 * environment for the lifetime of this process only.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const API = 'https://api.supabase.com/v1';
const ROOT = resolve(import.meta.dirname, '..');
const SUPABASE_DIR = resolve(ROOT, 'supabase');
const VERCEL_SCOPE = 'swaniki';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const has = (name) => process.argv.includes(`--${name}`);

const say = (msg) => process.stdout.write(`${msg}\n`);
const step = (msg) => process.stdout.write(`\n==> ${msg}\n`);
const fail = (msg) => {
  process.stderr.write(`\nERROR: ${msg}\n`);
  process.exit(1);
};

const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
if (!token) {
  fail(
    'SUPABASE_ACCESS_TOKEN is not set. Create a personal access token at\n' +
      '   https://supabase.com/dashboard/account/tokens\n' +
      'then run:  $env:SUPABASE_ACCESS_TOKEN = (Read-Host -MaskInput "token")',
  );
}
if (!token.startsWith('sbp_')) {
  say('note: the token does not start with sbp_ - the Management API may reject it');
}

// ---------------------------------------------------------------------------
// Management API
// ---------------------------------------------------------------------------
async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const detail = json?.message ?? json?.error ?? text.slice(0, 400);
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}: ${detail}`);
  }
  return json;
}

/** Run a small read query and return its rows. */
const query = (ref, sql) =>
  api(`/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query: sql }) });

/**
 * Run a SQL script on the project database. The endpoint takes the whole
 * script as one simple query, which is what the dashboard SQL editor does, so
 * dollar-quoted functions and multi-row inserts behave as they always have.
 */
async function runSql(ref, file, label = file) {
  const path = resolve(SUPABASE_DIR, file);
  if (!existsSync(path)) fail(`missing SQL file: ${file}`);
  const query = readFileSync(path, 'utf8');
  try {
    await api(`/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });
    say(`    ok   ${label}`);
  } catch (e) {
    say(`    FAIL ${label}`);
    throw new Error(`${label}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. project
// ---------------------------------------------------------------------------
step('Locating the Supabase project');
let ref = arg('ref');
if (ref) {
  const found = await api(`/projects/${ref}`);
  say(`    using existing project ${ref} (${found.name})`);
} else {
  const projects = await api('/projects');
  const existing = projects.find((p) => /yash[- ]?honda/i.test(p.name ?? ''));
  if (existing) {
    ref = existing.ref ?? existing.id;
    say(`    found existing project ${ref} (${existing.name})`);
  } else {
    const orgs = await api('/organizations');
    const orgId = arg('org') ?? orgs[0]?.id;
    if (!orgId) fail('no Supabase organization is available for this token');
    const dbPassword = `Yh-${randomBytes(12).toString('base64url')}`;
    say(`    creating project "${arg('name') ?? 'yash-honda-hiring'}" in ${arg('region') ?? 'ap-south-1'}`);
    const created = await api('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: arg('name') ?? 'yash-honda-hiring',
        region: arg('region') ?? 'ap-south-1',
        organization_id: orgId,
        db_pass: dbPassword,
      }),
    });
    ref = created.ref ?? created.id;
    // The CLI cannot recover this password, so keep it out of the transcript.
    writeFileSync(resolve(ROOT, '.env.dbpassword'), `${ref} ${dbPassword}\n`, { mode: 0o600 });
    say(`    created project ${ref}; the database password is in .env.dbpassword`);
  }
}
if (!ref) fail('could not determine a project reference');

step('Waiting for the project to become healthy');
for (let attempt = 0; attempt < 180; attempt += 1) {
  const { status } = await api(`/projects/${ref}`);
  if (/ACTIVE_HEALTHY|HEALTHY/i.test(status)) {
    say(`    status: ${status}`);
    break;
  }
  if (attempt === 0) say(`    status: ${status} (this takes a couple of minutes)`);
  await new Promise((r) => setTimeout(r, 5000));
  if (attempt === 179) fail('the project never reported healthy - check the dashboard');
}

// ---------------------------------------------------------------------------
// 2. schema, storage, demo data
// ---------------------------------------------------------------------------
const migrations = readdirSync(resolve(SUPABASE_DIR, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

step('Checking what is already applied');
const [{ count: appTables }] = await query(ref, `select count(*)::int as count from pg_tables
  where schemaname = 'public'
    and tablename in ('vacancy_requests','positions','candidates','audit_events')`);
const loaded =
  Number(appTables) >= 4
    ? (await query(ref, `select exists (select 1 from public.vacancy_requests
                   where id = '22222222-2222-4222-8222-000000000001') as yes`))[0].yes
    : false;

step('Applying migrations');
const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
if (only) {
  // --only migrations/0004_config_seed.sql,storage.sql  -> replay exactly these
  for (const f of only) await runSql(ref, f, f);
} else if (Number(appTables) >= 4 && !has('force-migrations')) {
  say('    schema already present - skipping migrations (pass --force-migrations to replay)');
} else {
  for (const m of migrations) await runSql(ref, `migrations/${m}`, m);
}

if (!only) {
  step('Storage buckets and policies');
  await runSql(ref, 'storage.sql', 'storage.sql');

  step('Demo register');
  if (loaded && !has('reseed')) {
    say('    demo register already loaded - skipping (pass --reseed to replace it)');
  } else {
    if (loaded) await runSql(ref, 'seed_teardown.sql', 'seed_teardown.sql');
    await runSql(ref, 'seed.sql', 'seed.sql (1500+ lines, may take a moment)');
  }
}

// ---------------------------------------------------------------------------
// 3. keys and .env.local
// ---------------------------------------------------------------------------
step('Reading API keys');
// Two shapes exist depending on when the project was created and whether legacy
// keys are still enabled: /api-keys/legacy returns the key list on older
// accounts and merely {"enabled":true} on newer ones, while /api-keys returns a
// flat array whose entries carry name/id = anon|service_role and a "legacy" or
// "publishable"/"secret" type. Match on the name, accept either shape.
const pick = (list, role) =>
  (Array.isArray(list) ? list : [])
    .find((k) => (k.name ?? k.id) === role)?.api_key;

const legacy = await api(`/projects/${ref}/api-keys/legacy`).catch(() => []);
const keys = await api(`/projects/${ref}/api-keys`).catch(() => []);
const pool = [...(Array.isArray(legacy) ? legacy : []), ...(keys.api_keys ?? (Array.isArray(keys) ? keys : []))];
const anon = pick(pool, 'anon');
const serviceRole = pick(pool, 'service_role');
if (!anon || !serviceRole) {
  fail('could not read the anon/service-role keys; found: ' + pool.map((k) => k.name ?? k.id).join(', '));
}

const url = `https://${ref}.supabase.co`;
const env = [
  '# generated by scripts/provision-supabase.mjs - do not commit',
  `NEXT_PUBLIC_SUPABASE_URL=${url}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceRole}`,
  'SUPABASE_DOC_BUCKET=candidate-documents',
  'SUPABASE_EXPORT_BUCKET=report-exports',
  'DOCUMENT_URL_TTL_SECONDS=60',
  'APP_ENV=development',
  'TIMEZONE=Asia/Kolkata',
  '',
].join('\n');
writeFileSync(resolve(ROOT, '.env.local'), env);
say(`    wrote .env.local for ${url}`);

// ---------------------------------------------------------------------------
// 4. Vercel environment
// ---------------------------------------------------------------------------
if (!has('skip-vercel')) {
  step('Pushing environment variables to Vercel');
  if (!existsSync(resolve(ROOT, '.vercel', 'project.json'))) {
    fail('the repo is not linked to Vercel yet - run:  vercel link --scope swaniki --project yash-honda-hiring-tracker');
  }
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    SUPABASE_DOC_BUCKET: 'candidate-documents',
    SUPABASE_EXPORT_BUCKET: 'report-exports',
    DOCUMENT_URL_TTL_SECONDS: '60',
    TIMEZONE: 'Asia/Kolkata',
  };
  for (const [name, value] of Object.entries(values)) {
    for (const target of ['production', 'preview']) {
      spawnSync('vercel', ['env', 'rm', name, target, '--scope', VERCEL_SCOPE, '--yes'], {
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      const res = spawnSync('vercel', ['env', 'add', name, target, '--scope', VERCEL_SCOPE], {
        input: `${value}\n`,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
      const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
      if (res.status === 0 && !/error/i.test(out.split('\n').slice(-3).join(' '))) {
        say(`    ok   ${name} (${target})`);
      } else {
        say(`    FAIL ${name} (${target}): ${out.trim().split('\n').slice(-2).join(' ')}`);
      }
    }
  }
}

step('Done');
say(`    project   ${ref}`);
say(`    url       ${url}`);
say(`    logins    admin@yashhonda.test / owner@ / ceo@ / hr@ / hrhead@ / finance@ / employee@  (password Yh-Dev-2026!)`);
say('');
say('    next:  vercel deploy --prod --scope swaniki');
