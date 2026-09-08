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
} from './test-fixtures.js';

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

describe('PostgreSQL idempotency', () => {
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

  it('stores exactly one package for a repeated key', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

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

    const service =
      new DefaultPackageStorageService(
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

    const key = idempotencyKey();

    const request = storeRequest(
      storedBy.username,
      recipient.username,
    );

    const context = {
      idempotencyKey: key,
      requestHash: 'same',
      requestedAt:
        '2026-01-01T00:00:00.000Z',
    };

    const first = await service.storePackage(
      request as any,
      context as any,
    );

    const second = await service.storePackage(
      request as any,
      context as any,
    );

    expect(second).toEqual(first);

    const result = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM packages
      `,
    );

    expect(result.rows[0].count).toBe(1);

    const idempotencyRows =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM idempotency_records
        `,
      );

    expect(idempotencyRows.rows[0].count)
      .toBe(1);
  });

  it('rejects same key with a different request hash', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

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

    const service =
      new DefaultPackageStorageService(
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

    const key = idempotencyKey();

    await service.storePackage(
      storeRequest(
        storedBy.username,
        recipient.username,
      ) as any,
      {
        idempotencyKey: key,
        requestHash: 'hash-one',
        requestedAt:
          '2026-01-01T00:00:00.000Z',
      } as any,
    );

    await expect(
      service.storePackage(
        storeRequest(
          storedBy.username,
          recipient.username,
          {
            packageName: 'DIFFERENT',
          },
        ) as any,
        {
          idempotencyKey: key,
          requestHash: 'hash-two',
          requestedAt:
            '2026-01-01T00:00:00.000Z',
        } as any,
      ),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });
});