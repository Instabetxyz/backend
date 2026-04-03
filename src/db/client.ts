import { Pool, PoolClient } from 'pg';
import { config } from '../config';

const pool = new Pool({
  connectionString: config.db.url,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

export const db = {
  /**
   * Run a single query against the pool.
   */
  query: pool.query.bind(pool),

  /**
   * Acquire a client for multi-statement transactions.
   * Always call client.release() in a finally block.
   */
  connect: (): Promise<PoolClient> => pool.connect(),

  /**
   * Convenience wrapper for a transaction block.
   * Automatically commits or rolls back.
   */
  transaction: async <T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> => {
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
  },

  /**
   * Drain the pool — call on graceful shutdown.
   */
  end: () => pool.end(),
};