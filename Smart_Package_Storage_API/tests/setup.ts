import { Client } from 'pg';

import { config as loadEnv } from 'dotenv';

loadEnv()

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for integration/concurrency tests.',
  );
}

export async function createTestClient(): Promise<Client> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  return client;
}

export async function resetDatabase(client: Client): Promise<void> {
  /*
   * IMPORTANT:
   *
   * This intentionally deletes application data instead of dropping
   * the entire schema.
   *
   * Keep this list synchronized with db/001_schema.sql.
   */
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

export async function closeClient(client: Client): Promise<void> {
  await client.end();
}