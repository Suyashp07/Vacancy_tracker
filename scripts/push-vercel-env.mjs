#!/usr/bin/env node
/**
 * Push the variables in .env.local into the linked Vercel project.
 *
 *   node scripts/push-vercel-env.mjs                 # every key
 *   node scripts/push-vercel-env.mjs --only NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY
 *   node scripts/push-vercel-env.mjs --env production   # default is production + preview
 *
 * Each key is removed before it is added, so re-running is deterministic rather
 * than failing on "already exists". VERCEL_* entries the CLI writes itself are
 * left alone - they are not application configuration.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SCOPE = 'swaniki';
const WINDOWS = process.platform === 'win32';

const argList = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const only = argList('only')?.split(',').map((s) => s.trim().toUpperCase());
const targets = (argList('env') ?? 'production,preview').split(',').map((s) => s.trim());

const file = resolve(ROOT, '.env.local');
if (!existsSync(file)) {
  process.stderr.write('ERROR: no .env.local - write it first (see .env.example)\n');
  process.exit(1);
}

const vars = readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const eq = l.indexOf('=');
    return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
  })
  .filter(([k]) => !k.startsWith('VERCEL_'))
  .filter(([k]) => (only ? only.includes(k) : true));

if (!vars.length) {
  process.stderr.write('ERROR: nothing to push\n');
  process.exit(1);
}

let failures = 0;
for (const [name, value] of vars) {
  // NEXT_PUBLIC_* is inlined into the client bundle at build time, so it must be
  // stored as a readable Config value, never a Secret. Passing --value plus
  // --type and --yes keeps the add fully non-interactive; without --value the
  // CLI pops an arrow-key "looks like a credential" prompt that stdin cannot
  // answer, which is how a push used to fail silently.
  const type = name.startsWith('NEXT_PUBLIC_') ? 'config' : 'secret';
  for (const env of targets) {
    spawnSync('vercel', ['env', 'rm', name, env, '--scope', SCOPE, '--yes'], {
      stdio: 'ignore',
      shell: WINDOWS,
    });
    const res = spawnSync(
      'vercel',
      ['env', 'add', name, env, '--type', type, '--value', value, '--force', '--yes', '--scope', SCOPE],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: WINDOWS },
    );
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    const ok = res.status === 0 && !/^.*error.*$/im.test(out);
    if (!ok) failures += 1;
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${name} (${env}, ${type})${ok ? '' : `: ${out.trim().split('\n').slice(-2).join(' ')}`}\n`);
  }
}

process.stdout.write(`\npushed ${vars.length} variables to ${targets.join(' + ')}\n`);
if (failures) process.exit(1);
