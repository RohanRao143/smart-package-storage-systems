import { Client, Pool } from 'pg';
import { config as loadEnv } from 'dotenv';

loadEnv();

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for PostgreSQL tests.',
  );
}

export async function createTestClient(): Promise<Client> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  return client;
}

export function createTestPool(): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 20,
  });
}

export async function resetDatabase(
  client: Client,
): Promise<void> {
  await client.query(`
    TRUNCATE TABLE
      idempotency_records,
      storage_charges,
      pickup_codes,
      packages,
      wallet_recharges,
      lockers,
      customers
    RESTART IDENTITY CASCADE
  `);
}
