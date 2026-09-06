import { describe, expect, it, vi } from 'vitest';
import { PgLockerRepository } from '../src/db/repositories.js';

describe('PgLockerRepository allocation query', () => {
  it('uses rotation-aware dimensions, smallest-first ordering, and SKIP LOCKED', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await new PgLockerRepository().findAndLockSuitable({ query } as never, { widthCm: 30, heightCm: 20, breadthCm: 10, weightGrams: 1_000, hasFragileItems: true } as never);
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('ORDER BY size_rank, id');
    expect(sql).toContain('unnest(ARRAY[width_cm, height_cm, breadth_cm])');
    expect(sql).toContain('fragile_support = true');
  });
});
