import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { Client } from 'pg';

import { createTestClient, resetDatabase } from '../setup.js';
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

describe('PostgreSQL package storage integration', () => {
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

  afterEach(async () => {
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

    const allocation =
      new PostgresLockerAllocationService(lockers);

    const codeService =
      new SecurePickupCodeService();

    return new DefaultPackageStorageService(
      db,
      allocation,
      lockers,
      customers,
      packages,
      pickupCodes,
      codeService,
      idempotency,
      TEST_DAILY_RATE_CENTS as never,
    );
  }

  it('stores a package in the smallest compatible locker', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

    const small = await createLocker(client, {
      size: 'SMALL',
    });

    await createLocker(client, {
      size: 'MEDIUM',
    });

    const service = createService();

    const result = await service.storePackage(
      storeRequest(
        storedBy.username,
        recipient.username,
      ) as any,
      {
        idempotencyKey: idempotencyKey(),
        requestHash: 'integration-small',
        requestedAt: new Date().toISOString(),
      } as any,
    );

    expect(result.lockerId).toBe(small.id);
    expect(result.lockerSize).toBe('SMALL');
    expect(result.pickupCode).toMatch(/^\d{6}$/);
  });

  it('supports rotated dimensions', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

    const locker = await createLocker(client, {
      size: 'SMALL',
      widthCm: 10,
      heightCm: 15,
      breadthCm: 20,
    });

    const service = createService();

    const result = await service.storePackage(
      storeRequest(
        storedBy.username,
        recipient.username,
        {
          widthCm: 20,
          heightCm: 10,
          breadthCm: 15,
        },
      ) as any,
      {
        idempotencyKey: idempotencyKey(),
        requestHash: 'integration-rotation',
        requestedAt: new Date().toISOString(),
      } as any,
    );

    expect(result.lockerId).toBe(locker.id);
  });

  it('rejects a package that exceeds all locker capacity', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

    await createLocker(client, {
      size: 'SMALL',
      widthCm: 10,
      heightCm: 10,
      breadthCm: 10,
      maxWeightGrams: 1000,
    });

    const service = createService();

    await expect(
      service.storePackage(
        storeRequest(
          storedBy.username,
          recipient.username,
          {
            widthCm: 20,
            heightCm: 20,
            breadthCm: 20,
            weightGrams: 5000,
          },
        ) as any,
        {
          idempotencyKey: idempotencyKey(),
          requestHash: 'integration-too-large',
          requestedAt: new Date().toISOString(),
        } as any,
      ),
    ).rejects.toMatchObject({
      code: 'PACKAGE_EXCEEDS_CAPACITY',
    });
  });

  it('marks the selected locker occupied', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

    const locker = await createLocker(client);

    const service = createService();

    await service.storePackage(
      storeRequest(
        storedBy.username,
        recipient.username,
      ) as any,
      {
        idempotencyKey: idempotencyKey(),
        requestHash: 'integration-occupied',
        requestedAt: new Date().toISOString(),
      } as any,
    );

    const result = await client.query(
      `
        SELECT is_occupied
        FROM lockers
        WHERE id = $1
      `,
      [locker.id],
    );

    expect(result.rows[0].is_occupied).toBe(true);
  });

  it('persists only the pickup-code hash', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

    const service = createService();

    const result = await service.storePackage(
      storeRequest(
        storedBy.username,
        recipient.username,
      ) as any,
      {
        idempotencyKey: idempotencyKey(),
        requestHash: 'integration-hash',
        requestedAt: new Date().toISOString(),
      } as any,
    );

    const codeRows = await client.query(
      `
        SELECT pickup_code_hash
        FROM pickup_codes
      `,
    );

    expect(codeRows.rows).toHaveLength(1);
    expect(codeRows.rows[0].pickup_code_hash)
      .not.toBe(result.pickupCode);

    expect(codeRows.rows[0].pickup_code_hash)
      .toContain(':');
  });

  it('replays the same idempotent request without creating another package', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

    const key = idempotencyKey();

    const service = createService();

    const request = storeRequest(
      storedBy.username,
      recipient.username,
    );

    const context = {
      idempotencyKey: key,
      requestHash: 'same-request',
      requestedAt: new Date().toISOString(),
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

    const packageCount = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM packages
      `,
    );

    expect(packageCount.rows[0].count).toBe(1);
  });

  it('rejects idempotency key reuse with a different request', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

    const key = idempotencyKey();

    const service = createService();

    await service.storePackage(
      storeRequest(
        storedBy.username,
        recipient.username,
        { packageName: 'Original' },
      ) as any,
      {
        idempotencyKey: key,
        requestHash: 'hash-a',
        requestedAt: new Date().toISOString(),
      } as any,
    );

    await expect(
      service.storePackage(
        storeRequest(
          storedBy.username,
          recipient.username,
          { packageName: 'Changed' },
        ) as any,
        {
          idempotencyKey: key,
          requestHash: 'hash-b',
          requestedAt: new Date().toISOString(),
        } as any,
      ),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });
});