import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { Client } from 'pg';

import {
  createTestClient,
  resetDatabase,
} from '../setup.js';

import {
  createCustomer,
  createLocker,
  idempotencyKey,
  storeRequest,
} from '../integration/test-fixtures.js';

import { PgDatabase } from '../../src/db/postgres-database.js';

import {
  PgCustomerRepository,
  PgIdempotencyRepository,
  PgLockerRepository,
  PgPackageRepository,
  PgPickupCodeRepository,
} from '../../src/db/repositories.js';

import { PostgresLockerAllocationService } from '../../src/services/locker-allocation-service.js';
import { DefaultPackageStorageService } from '../../src/services/package-storage-service.js';
import { SecurePickupCodeService } from '../../src/services/pickup-code-service.js';

describe('Concurrent package storage', () => {
  let client: Client;
let db: PgDatabase;

  beforeAll(async () => {
    client = await createTestClient();
   db = new PgDatabase({
    connectionString: process.env.TEST_DATABASE_URL!,
   });
  });

  afterAll(async () => {
    await client.end();
    await client.end();
  });

  beforeEach(async () => {
    await resetDatabase(client);
  });

  function createService() {
    const db = new PgDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
    });

    const lockers = new PgLockerRepository();
    const customers = new PgCustomerRepository();
    const packages = new PgPackageRepository();
    const pickupCodes = new PgPickupCodeRepository();
    const idempotency = new PgIdempotencyRepository();

    return new DefaultPackageStorageService(
      db,
      new PostgresLockerAllocationService(lockers),
      lockers,
      customers,
      packages,
      pickupCodes,
      new SecurePickupCodeService(),
      idempotency,
      100 as never,
    );
  }

  it('never allocates the same locker twice', async () => {
    const numberOfRequests = 10;

    const users = await Promise.all(
      Array.from(
        { length: numberOfRequests * 2 },
        () => createCustomer(client),
      ),
    );

    const storedByUsers = users.slice(
      0,
      numberOfRequests,
    );

    const recipients = users.slice(
      numberOfRequests,
    );

    for (let i = 0; i < numberOfRequests; i++) {
      await createLocker(client);
    }

    const operations = Array.from(
      { length: numberOfRequests },
      (_, i) => {
        const service = createService();

        return service.storePackage(
          storeRequest(
            storedByUsers[i].username,
            recipients[i].username,
            {
              packageName: `Concurrent ${i}`,
            },
          ) as any,
          {
            idempotencyKey: idempotencyKey(),
            requestHash: `concurrent-${i}`,
            requestedAt:
              '2026-01-01T00:00:00.000Z',
          } as any,
        );
      },
    );

    const results =
      await Promise.allSettled(operations);

    const successful = results.filter(
      result => result.status === 'fulfilled',
    );

    expect(successful).toHaveLength(
      numberOfRequests,
    );

    const lockerIds = successful.map(
      result =>
        (result as PromiseFulfilledResult<any>)
          .value.lockerId,
    );

    expect(
      new Set(lockerIds).size,
    ).toBe(numberOfRequests);

    const occupied = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM lockers
      WHERE is_occupied = true
    `);

    expect(
      occupied.rows[0].count,
    ).toBe(numberOfRequests);

    const duplicateAssignments =
      await client.query(`
        SELECT locker_id, COUNT(*)::int AS count
        FROM packages
        WHERE status = 'STORED'
        GROUP BY locker_id
        HAVING COUNT(*) > 1
      `);

    expect(
      duplicateAssignments.rows,
    ).toHaveLength(0);
  });

  it('handles contention when fewer lockers exist than requests', async () => {
    const lockerCount = 3;
    const requestCount = 10;

    const users = await Promise.all(
      Array.from(
        { length: requestCount * 2 },
        () => createCustomer(client),
      ),
    );

    for (let i = 0; i < lockerCount; i++) {
      await createLocker(client);
    }

    const operations = Array.from(
      { length: requestCount },
      (_, i) => {
        const service = createService();

        return service.storePackage(
          storeRequest(
            users[i].username,
            users[i + requestCount].username,
            {
              packageName: `Contention ${i}`,
            },
          ) as any,
          {
            idempotencyKey: idempotencyKey(),
            requestHash: `contention-${i}`,
            requestedAt:
              '2026-01-01T00:00:00.000Z',
          } as any,
        );
      },
    );

    const results =
      await Promise.allSettled(operations);

    const successful = results.filter(
      result => result.status === 'fulfilled',
    );

    const rejected = results.filter(
      result => result.status === 'rejected',
    );

    expect(successful).toHaveLength(lockerCount);

    expect(rejected).toHaveLength(
      requestCount - lockerCount,
    );

    const lockerIds = successful.map(
      result =>
        (result as PromiseFulfilledResult<any>)
          .value.lockerId,
    );

    expect(
      new Set(lockerIds).size,
    ).toBe(lockerCount);
  });
});