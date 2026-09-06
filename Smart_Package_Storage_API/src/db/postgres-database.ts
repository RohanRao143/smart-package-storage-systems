import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { PostgresDatabase } from '../contracts/lifecycle.js';

export class PgDatabase implements PostgresDatabase {
  readonly pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async withinTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
