import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import request from 'supertest';
import { Client } from 'pg';

import {
  createTestClient,
  resetDatabase,
} from '../setup.js';

import {
  createCustomer,
  createLocker,
  idempotencyKey,
} from './test-fixtures.js';

import { createApp } from '../../src/app.js';

import { PgDatabase } from '../../src/db/postgres-database.js';
import {
  PgCustomerRepository,
  PgIdempotencyRepository,
  PgLockerRepository,
  PgPackageRepository,
  PgPickupCodeRepository,
  PgStorageChargeRepository,
  PgWalletRechargeRepository,
} from '../../src/db/repositories.js';

import { PostgresLockerAllocationService } from '../../src/services/locker-allocation-service.js';
import { DefaultLockerService } from '../../src/services/locker-service.js';
import { DefaultPackageStorageService } from '../../src/services/package-storage-service.js';
import { DefaultPackageRetrievalService } from '../../src/services/package-retrieval-service.js';
import { SecurePickupCodeService } from '../../src/services/pickup-code-service.js';
import { ProgressiveStorageChargeService } from '../../src/services/storage-charge-service.js';
import { DefaultWalletService } from '../../src/services/wallet-service.js';

describe('HTTP API integration', () => {
  let client: Client;
let db: PgDatabase;
  let app: any;

  beforeAll(async () => {
    client = await createTestClient();
    db = new PgDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
    });


    const lockers =
      new PgLockerRepository();

    const customers =
      new PgCustomerRepository();

    const packages =
      new PgPackageRepository();

    const pickupCodes =
      new PgPickupCodeRepository();

    const idempotency =
      new PgIdempotencyRepository();

    const charges =
      new PgStorageChargeRepository();

    const walletRecharges =
      new PgWalletRechargeRepository();

    const codeService =
      new SecurePickupCodeService();

    const allocation =
      new PostgresLockerAllocationService(
        lockers,
      );

    app = createApp({
      lockers:
        new DefaultLockerService(
          db,
          lockers,
        ),

      storage:
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
        ),

      retrieval:
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
        ),

      wallet:
        new DefaultWalletService(
          db,
          customers,
          walletRecharges,
          idempotency,
        ),
    });
  });

  afterAll(async () => {
    await client.end();
    await client.end();
  });

  beforeEach(async () => {
    await resetDatabase(client);
  });

  it('creates a locker', async () => {
    const response =
      await request(app)
        .post('/api/v1/lockers')
        .send({
          size: 'SMALL',
          widthCm: 20,
          heightCm: 15,
          breadthCm: 10,
          maxWeightGrams: 5000,
          fragileSupport: true,
        });

    expect(response.status)
      .toBe(201);

    expect(response.body)
      .toHaveProperty('id');

    expect(response.body.size)
      .toBe('SMALL');

    expect(response.body.isOccupied)
      .toBe(false);
  });

  it('lists available lockers', async () => {
    await createLocker(client);

    const response =
      await request(app)
        .get('/api/v1/lockers')
        .query({ available: true });

    expect(response.status)
      .toBe(200);

    expect(response.body.data)
      .toHaveLength(1);

    expect(
      response.body.data[0].isOccupied,
    ).toBe(false);
  });

  it('rejects malformed locker creation requests', async () => {
    const response =
      await request(app)
        .post('/api/v1/lockers')
        .send({
          size: 'INVALID',
          widthCm: 0,
          heightCm: -1,
          breadthCm: 10,
          maxWeightGrams: 1000,
          fragileSupport: 'yes',
        });

    expect(response.status)
      .toBe(400);

    expect(response.body)
      .toHaveProperty('error');

    expect(response.body.error)
      .toHaveProperty('code');
  });

  it('requires Idempotency-Key for mutation endpoints', async () => {
    const response =
      await request(app)
        .post('/api/v1/wallet/recharge')
        .send({
          customerId:
            '11111111-1111-4111-8111-111111111111',
          amountCents: 100,
        });

    expect(response.status)
      .toBeGreaterThanOrEqual(400);
  });

  it('stores a package through the HTTP API', async () => {
    const storedBy =
      await createCustomer(client);

    const recipient =
      await createCustomer(client);

    await createLocker(client);

    const response =
      await request(app)
        .post('/api/v1/packages/store')
        .set(
          'Idempotency-Key',
          idempotencyKey(),
        )
        .send({
          storedByUsername:
            storedBy.username,
          recipientUsername:
            recipient.username,
          packageName:
            'HTTP Integration Test',
          widthCm: 10,
          heightCm: 10,
          breadthCm: 10,
          weightGrams: 1000,
          hasFragileItems: false,
        });

    expect(response.status)
      .toBe(201);

    expect(response.body)
      .toMatchObject({
        lockerSize: 'SMALL',
      });

    expect(response.body.pickupCode)
      .toMatch(/^\d{6}$/);
  });
});