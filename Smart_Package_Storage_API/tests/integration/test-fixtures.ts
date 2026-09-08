import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

export const TEST_DAILY_RATE_CENTS = 100;

export function idempotencyKey(): string {
  return randomUUID();
}

export async function createCustomer(
  client: Client,
  overrides: {
    id?: string;
    name?: string;
    username?: string;
    email?: string;
    phoneNumber?: string;
    walletBalanceCents?: number;
  } = {},
) {
  const uniqueId = randomUUID().replaceAll('-', '');

  const username =
    overrides.username ??
    `test_${uniqueId.slice(0, 20)}`;

  const name =
    overrides.name ??
    `Test Customer ${uniqueId.slice(0, 8)}`;

  const email =
    overrides.email ??
    `${username}@example.test`;

  const phoneNumber =
    overrides.phoneNumber ??
    `+1555${uniqueId.slice(0, 7)}`;

  const walletBalanceCents =
    overrides.walletBalanceCents ?? 10_000;

  const columns = [
    'name',
    'username',
    'email',
    'phone_number',
    'wallet_balance_cents',
  ];

  const values: unknown[] = [
    name,
    username,
    email,
    phoneNumber,
    walletBalanceCents,
  ];

  if (overrides.id !== undefined) {
    columns.unshift('id');
    values.unshift(overrides.id);
  }

  const placeholders = values.map(
    (_, index) => `$${index + 1}`,
  );

  const result = await client.query(
    `
      INSERT INTO customers (
        ${columns.join(', ')}
      )
      VALUES (
        ${placeholders.join(', ')}
      )
      RETURNING *
    `,
    values,
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

  const size_rank = {
    SMALL: 1,
    MEDIUM: 2,
    LARGE: 3
  } as const;

  const dimensions = {
    SMALL: [20, 15, 10],
    MEDIUM: [40, 30, 20],
    LARGE: [80, 60, 40],
  } as const;

  const [
    defaultWidth,
    defaultHeight,
    defaultBreadth,
  ] = dimensions[size];

  const result = await client.query(
    `
      INSERT INTO lockers (
        size,
        size_rank,
        width_cm,
        height_cm,
        breadth_cm,
        max_weight_grams,
        fragile_support,
        is_occupied
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, false)
      RETURNING *
    `,
    [
      size,
      size_rank[size],
      overrides.widthCm ?? defaultWidth,
      overrides.heightCm ?? defaultHeight,
      overrides.breadthCm ?? defaultBreadth,
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

    weightGrams: 1_000,

    hasFragileItems: false,

    ...overrides,
  };
}