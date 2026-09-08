import {
  afterAll,
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
  PgStorageChargeRepository,
} from '../../src/db/repositories.js';

import { PostgresLockerAllocationService } from '../../src/services/locker-allocation-service.js';
import { DefaultPackageStorageService } from '../../src/services/package-storage-service.js';
import { DefaultPackageRetrievalService } from '../../src/services/package-retrieval-service.js';
import { ProgressiveStorageChargeService } from '../../src/services/storage-charge-service.js';
import { SecurePickupCodeService } from '../../src/services/pickup-code-service.js';

describe('PostgreSQL package retrieval integration', () => {
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

  function createServices() {
    const db = new PgDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
    });

    const lockers = new PgLockerRepository();
    const customers = new PgCustomerRepository();
    const packages = new PgPackageRepository();
    const pickupCodes = new PgPickupCodeRepository();
    const idempotency = new PgIdempotencyRepository();
    const charges = new PgStorageChargeRepository();

    const codeService =
      new SecurePickupCodeService();

    const allocation =
      new PostgresLockerAllocationService(lockers);

    const storage =
      new DefaultPackageStorageService(
        db,
        allocation,
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

    return {
      storage,
      retrieval,
    };
  }

  async function createStoredPackage() {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(client);

    await createLocker(client);

    const { storage, retrieval } = createServices();

    const storedAt =
      '2026-01-01T00:00:00.000Z';

    const stored = await storage.storePackage(
      storeRequest(
        storedBy.username,
        recipient.username,
      ) as any,
      {
        idempotencyKey: idempotencyKey(),
        requestHash: `store-${idempotencyKey()}`,
        requestedAt: storedAt,
      } as any,
    );

    return {
      storedBy,
      recipient,
      stored,
      retrieval,
    };
  }

  it('retrieves with the correct locker and pickup code', async () => {
    const {
      recipient,
      stored,
      retrieval,
    } = await createStoredPackage();

    const result =
      await retrieval.retrievePackage(
        {
          lockerId: stored.lockerId,
          pickupCode: stored.pickupCode,
          receivedByUsername: recipient.username,
        } as any,
        {
          idempotencyKey: idempotencyKey(),
          requestHash: 'retrieve-success',
          requestedAt:
            '2026-01-02T00:00:00.000Z',
        } as any,
      );

    expect(result.packageId)
      .toBe(stored.packageId);

    expect(result.chargedAmountCents)
      .toBe(100);

    expect(result.lockerReleased)
      .toBe(true);
  });

  it('rejects an invalid pickup code', async () => {
    const {
      recipient,
      stored,
      retrieval,
    } = await createStoredPackage();

    await expect(
      retrieval.retrievePackage(
        {
          lockerId: stored.lockerId,
          pickupCode: '000000',
          receivedByUsername: recipient.username,
        } as any,
        {
          idempotencyKey: idempotencyKey(),
          requestHash: 'retrieve-invalid-code',
          requestedAt:
            '2026-01-02T00:00:00.000Z',
        } as any,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_PICKUP_CODE',
    });
  });

  it('rejects the wrong locker ID', async () => {
    const {
      recipient,
      stored,
      retrieval,
    } = await createStoredPackage();

    const otherLocker = await createLocker(client);

    await expect(
      retrieval.retrievePackage(
        {
          lockerId: otherLocker.id,
          pickupCode: stored.pickupCode,
          receivedByUsername: recipient.username,
        } as any,
        {
          idempotencyKey: idempotencyKey(),
          requestHash: 'wrong-locker',
          requestedAt:
            '2026-01-02T00:00:00.000Z',
        } as any,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_PICKUP_CODE',
    });
  });

  it('prevents retrieval when wallet balance is insufficient', async () => {
    const storedBy = await createCustomer(client);
    const recipient = await createCustomer(
      client,
      { walletBalanceCents: 0 },
    );

    await createLocker(client);

    const { storage, retrieval } =
      createServices();

    const stored =
      await storage.storePackage(
        storeRequest(
          storedBy.username,
          recipient.username,
        ) as any,
        {
          idempotencyKey: idempotencyKey(),
          requestHash: 'store-low-balance',
          requestedAt:
            '2026-01-01T00:00:00.000Z',
        } as any,
      );

    await expect(
      retrieval.retrievePackage(
        {
          lockerId: stored.lockerId,
          pickupCode: stored.pickupCode,
          receivedByUsername: recipient.username,
        } as any,
        {
          idempotencyKey: idempotencyKey(),
          requestHash: 'retrieve-low-balance',
          requestedAt:
            '2026-01-02T00:00:00.000Z',
        } as any,
      ),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_WALLET_BALANCE',
    });

    const locker = await client.query(
      `
        SELECT is_occupied
        FROM lockers
        WHERE id = $1
      `,
      [stored.lockerId],
    );

    expect(locker.rows[0].is_occupied)
      .toBe(true);
  });

  it('cannot retrieve the same package twice', async () => {
    const {
      recipient,
      stored,
      retrieval,
    } = await createStoredPackage();

    await retrieval.retrievePackage(
      {
        lockerId: stored.lockerId,
        pickupCode: stored.pickupCode,
        receivedByUsername: recipient.username,
      } as any,
      {
        idempotencyKey: idempotencyKey(),
        requestHash: 'first-retrieval',
        requestedAt:
          '2026-01-02T00:00:00.000Z',
      } as any,
    );

    await expect(
      retrieval.retrievePackage(
        {
          lockerId: stored.lockerId,
          pickupCode: stored.pickupCode,
          receivedByUsername: recipient.username,
        } as any,
        {
          idempotencyKey: idempotencyKey(),
          requestHash: 'second-retrieval',
          requestedAt:
            '2026-01-03T00:00:00.000Z',
        } as any,
      ),
    ).rejects.toMatchObject({
      code: 'PACKAGE_ALREADY_COLLECTED',
    });
  });
});