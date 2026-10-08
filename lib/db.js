import { Pool } from 'pg';

// One pool per process. In development Next.js reloads modules on every edit,
// so the pool is cached on globalThis to avoid opening a new pool each time.
const globalForPool = globalThis;

export const pool =
  globalForPool._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost')
      ? false
      : { rejectUnauthorized: false },
    max: 5,
  });

if (!globalForPool._pgPool) globalForPool._pgPool = pool;

export async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

/**
 * Run `fn` inside a single transaction. Commits on success, rolls back on any
 * thrown error, and always returns the client to the pool.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Thrown for rule violations the user should see, as opposed to server faults. */
export class RuleError extends Error {}
