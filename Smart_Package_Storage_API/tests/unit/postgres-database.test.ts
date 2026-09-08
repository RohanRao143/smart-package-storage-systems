import { describe, expect, it, vi } from 'vitest';

import { PgDatabase } from '../../src/db/postgres-database.js';

describe('PgDatabase', () => {
  it('commits successful transactions', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const release = vi.fn();

    const pool = {
      connect: vi.fn().mockResolvedValue({
        query,
        release,
      }),
      end: vi.fn(),
    };

    const db = new PgDatabase({
      connectionString: 'postgres://test',
    });

    (db as any).pool = pool;

    const result = await db.withinTransaction(
      async () => 'success',
    );

    expect(result).toBe('success');
    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('rolls back failed transactions', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const release = vi.fn();

    const pool = {
      connect: vi.fn().mockResolvedValue({
        query,
        release,
      }),
      end: vi.fn(),
    };

    const db = new PgDatabase({
      connectionString: 'postgres://test',
    });

    (db as any).pool = pool;

    await expect(
      db.withinTransaction(
        async () => {
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');

    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('releases connection after transaction failure', async () => {
    const release = vi.fn();

    const client = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
      release,
    };

    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };

    const db = new PgDatabase({
      connectionString: 'postgres://test',
    });

    (db as any).pool = pool;

    await expect(
      db.withinTransaction(async () => {
        throw new Error('failure');
      }),
    ).rejects.toThrow('failure');

    expect(release).toHaveBeenCalledOnce();
  });
});