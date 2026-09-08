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
  PgStorageChargeRepository,
} from '../../src/db/repositories.js';

import { PostgresLockerAllocationService } from '../../src/services/locker-allocation-service.js';
import { DefaultPackageStorageService } from '../../src/services/package-storage-service.js';
import { DefaultPackageRetrievalService } from '../../src/services/package-retrieval-service.js';
import { ProgressiveStorageChargeService } from '../../src/services/storage-charge-service.js';
import { SecurePickupCodeService } from '../../src/services/pickup-code-service.js';

describe('Concurrent package retrieval', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createTestClient();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await resetDatabase(client);
  });

  it('allows only one concurrent retrieval to collect the package', async () => {
    const owner = await createCustomer(
      client,
      { walletBalanceCents: 100_000 },
    );

    const receiver = owner;

    await createLocker(client);

    const db = new PgDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
    });

    const lockers = new PgLockerRepository();
    const customers = new PgCustomerRepository();
    const packages = new PgPackageRepository();
    const pickupCodes = new PgPickupCodeRepository();
    const idempotency =
      new PgIdempotencyRepository();
    const charges =
      new PgStorageChargeRepository();

    const codeService =
      new SecurePickupCodeService();

    const storage =
      new DefaultPackageStorageService(
        db,
        new PostgresLockerAllocationService(lockers),
        lockers,
        customers,
        packages,
        pickupCodes,
        codeService,
        idempotency,
        100 as never,
      );

    const retrieval =
      new DefaultPackageRetrievalService(
        db,
        lockers,
        customers,
        packages,
        pickupCodes,
        codeService,
        charges,
        new ProgressiveStorageChargeService(),
        idempotency,
      );

    const stored =
      await storage.storePackage(
        storeRequest(
          owner.username,
          owner.username,
        ) as any,
        {
          idempotencyKey: idempotencyKey(),
          requestHash: 'store-concurrent-retrieve',
          requestedAt:
            '2026-01-01T00:00:00.000Z',
        } as any,
      );

    const operations =
      Array.from({ length: 5 }, (_, i) =>
        retrieval.retrievePackage(
          {
            lockerId: stored.lockerId,
            pickupCode: stored.pickupCode,
            receivedByUsername:
              receiver.username,
          } as any,
          {
            idempotencyKey: idempotencyKey(),
            requestHash:
              `retrieve-concurrent-${i}`,
            requestedAt:
              '2026-01-02T00:00:00.000Z',
          } as any,
        ),
      );

    const results =
      await Promise.allSettled(operations);

    const successful =
      results.filter(
        result => result.status === 'fulfilled',
      );

    const failed =
      results.filter(
        result => result.status === 'rejected',
      );

    expect(successful.length).toBe(1);
    expect(failed.length).toBe(4);

    const packageResult =
      await client.query(
        `
          SELECT status
          FROM packages
          WHERE id = $1
        `,
        [stored.packageId],
      );

    expect(packageResult.rows[0].status)
      .toBe('COLLECTED');

    const lockerResult =
      await client.query(
        `
          SELECT is_occupied
          FROM lockers
          WHERE id = $1
        `,
        [stored.lockerId],
      );

    expect(lockerResult.rows[0].is_occupied)
      .toBe(false);

    const chargesResult =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM storage_charges
          WHERE package_id = $1
        `,
        [stored.packageId],
      );

    expect(chargesResult.rows[0].count)
      .toBe(1);
  });
});