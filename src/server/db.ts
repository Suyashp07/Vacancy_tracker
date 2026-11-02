import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill in the Supabase project values.`,
    );
  }
  return value;
}

/**
 * Session-bound client. Every ordinary read and write goes through this, so
 * Postgres row-level security evaluates as the signed-in person. This is the
 * only client a page handler may use.
 */
export async function db(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value, options } of cookiesToSet) {
          // Harden every auth cookie the library writes: unreadable by client JS
          // (httpOnly), transport-only in production (secure), sent top-level only
          // (lax), scoped to the whole site so chunking and deletion stay
          // consistent. The spread keeps the library's own expiry/maxAge, so a
          // sign-out (empty value + past expiry) still removes the cookie.
          store.set(name, value, {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: options.sameSite ?? 'lax',
            path: '/',
          });
        }
      },
    },
    global: { headers: { 'x-application-name': 'yash-honda-hiring-tracker' } },
  });
}

/**
 * Service-role client. Bypasses RLS, therefore its use is restricted to exactly
 * three jobs, each of which is deliberate and audited:
 *   1. appending to audit_events (write-only by design, never readable by the
 *      writer)
 *   2. Admin-facing accountability reads (audit log, retention register)
 *   3. the retention/deletion worker, which has no interactive session
 * Never use it to read business data for a normal screen.
 */
export function adminDb(): SupabaseClient {
  return createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Calls a Postgres function and returns its payload, throwing a typed error on
 * failure. Status changes go through SECURITY DEFINER functions in
 * 0005_transitions.sql rather than direct table writes, because a business
 * mutation, its status-history rows, its approval task and its audit entry must
 * either all happen or none of them do. PostgREST runs one function call in one
 * transaction; it cannot promise that across four REST requests.
 */
export async function call<T = unknown>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new TransitionError(error.message, error.code);
  return data as T;
}

export class TransitionError extends Error {
  readonly pgCode?: string;
  constructor(message: string, pgCode?: string) {
    super(message);
    this.name = 'TransitionError';
    this.pgCode = pgCode;
  }
}
