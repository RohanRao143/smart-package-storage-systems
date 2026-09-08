import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

export const TEST_DAILY_RATE_CENTS = 100;

export async function createCustomer(
  client: Client,
  overrides: {
    username?: string;
    walletBalanceCents?: number;
  } = {},
) {
  const username =
    overrides.username ??
    `test_${randomUUID().replaceAll('-', '').slice(0, 20)}`;

  const walletBalanceCents =
    overrides.walletBalanceCents ?? 10_000;

  const result = await client.query(
    `
      INSERT INTO customers (
        username,
        wallet_balance_cents
      )
      VALUES ($1, $2)
      RETURNING *
    `,
    [username, walletBalanceCents],
  );

  return result.rows[0];
}

export async function createLocker(
  client: Client,
  overrides: {
    size?: 'SMALL' | 'MEDIUM' | 'LARGE';
    widthCm?: number;
    heightCm?: number;
    breadthCm?: number;
    maxWeightGrams?: number;
    fragileSupport?: boolean;
  } = {},
) {
  const size = overrides.size ?? 'SMALL';

  const dimensions = {
    SMALL: [20, 15, 10],
    MEDIUM: [40, 30, 20],
    LARGE: [80, 60, 40],
  } as const;

  const [widthCm, heightCm, breadthCm] =
    dimensions[size];

  const result = await client.query(
    `
      INSERT INTO lockers (
        size,
        width_cm,
        height_cm,
        breadth_cm,
        max_weight_grams,
        fragile_support,
        is_occupied
      )
      VALUES ($1, $2, $3, $4, $5, $6, false)
      RETURNING *
    `,
    [
      size,
      overrides.widthCm ?? widthCm,
      overrides.heightCm ?? heightCm,
      overrides.breadthCm ?? breadthCm,
      overrides.maxWeightGrams ?? 5_000,
      overrides.fragileSupport ?? true,
    ],
  );

  return result.rows[0];
}

export function storeRequest(
  storedByUsername: string,
  recipientUsername: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    storedByUsername,
    recipientUsername,
    packageName: 'Integration Test Package',
    widthCm: 10,
    heightCm: 10,
    breadthCm: 10,
    weightGrams: 1000,
    hasFragileItems: false,
    ...overrides,
  };
}

export function idempotencyKey(): string {
  return randomUUID();
}