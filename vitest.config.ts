import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The suite runs in node, against no database and no browser: what is worth
 * proving here is the state machine and the configuration it reads, both of
 * which are pure. Anything that needs Postgres is enforced by RLS and by the
 * transaction functions, and is checked by reading the migrations themselves.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
