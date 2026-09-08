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
  idempotencyKey,
} from '../integration/test-fixtures.js';

import { PgDatabase } from '../../src/db/postgres-database.js';
import {
  PgCustomerRepository,
  PgIdempotencyRepository,
  PgWalletRechargeRepository,
} from '../../src/db/repositories.js';

import { DefaultWalletService } from '../../src/services/wallet-service.js';

describe('Concurrent wallet operations', () => {
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

  it('does not lose concurrent wallet updates', async () => {
    const customer =
      await createCustomer(client, {
        walletBalanceCents: 0,
      });

    const db = new PgDatabase({
      connectionString: process.env.TEST_DATABASE_URL!,
    });

    const customers =
      new PgCustomerRepository();

    const recharges =
      new PgWalletRechargeRepository();

    const idempotency =
      new PgIdempotencyRepository();

    const service =
      new DefaultWalletService(
        db,
        customers,
        recharges,
        idempotency,
      );

    const rechargeCount = 20;
    const amount = 100;

    const operations =
      Array.from(
        { length: rechargeCount },
        (_, i) =>
          service.recharge(
            {
              customerId: customer.id,
              amountCents: amount,
            } as any,
            {
              idempotencyKey: idempotencyKey(),
              requestHash:
                `wallet-${i}`,
              requestedAt:
                '2026-01-01T00:00:00.000Z',
            } as any,
          ),
      );

    const results =
      await Promise.all(operations);

    expect(results).toHaveLength(
      rechargeCount,
    );

    const result =
      await client.query(
        `
          SELECT wallet_balance_cents
          FROM customers
          WHERE id = $1
        `,
        [customer.id],
      );

    expect(
      Number(result.rows[0].wallet_balance_cents),
    ).toBe(
      rechargeCount * amount,
    );
  });
});