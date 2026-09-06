import { createApp } from './app.js';
import { PgDatabase } from './db/postgres-database.js';
import { PgCustomerRepository, PgIdempotencyRepository, PgLockerRepository, PgPackageRepository, PgPickupCodeRepository, PgStorageChargeRepository, PgWalletRechargeRepository } from './db/repositories.js';
import { PostgresLockerAllocationService } from './services/locker-allocation-service.js';
import { DefaultLockerService } from './services/locker-service.js';
import { DefaultPackageRetrievalService } from './services/package-retrieval-service.js';
import { DefaultPackageStorageService } from './services/package-storage-service.js';
import { SecurePickupCodeService } from './services/pickup-code-service.js';
import { ProgressiveStorageChargeService } from './services/storage-charge-service.js';
import { DefaultWalletService } from './services/wallet-service.js';
import { config as loadEnv } from 'dotenv';

loadEnv();

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const connectionString = process.env.DATABASE_URL;
const dailyRate = Number.parseInt(process.env.DEFAULT_DAILY_RATE_CENTS ?? '', 10);
if (!connectionString) throw new Error('DATABASE_URL is required.');
if (!Number.isSafeInteger(dailyRate) || dailyRate < 0) throw new Error('DEFAULT_DAILY_RATE_CENTS must be a non-negative integer.');

const db = new PgDatabase({ connectionString });

// Repositories
const lockers = new PgLockerRepository();
const customers = new PgCustomerRepository();
const packages = new PgPackageRepository();
const pickupCodes = new PgPickupCodeRepository();
const idempotency = new PgIdempotencyRepository();
const storageCharge = new PgStorageChargeRepository();
const walletRecharges = new PgWalletRechargeRepository();


const codeService = new SecurePickupCodeService();
const lockerAllocationService = new PostgresLockerAllocationService(lockers);
const storageChargeService = new ProgressiveStorageChargeService();


const app = createApp({
  lockers: new DefaultLockerService(
    db,
    lockers
  ),
  storage: new DefaultPackageStorageService(
    db,
    lockerAllocationService,
    lockers,
    customers,
    packages,
    pickupCodes,
    codeService,
    idempotency,
    dailyRate as never
  ),
  retrieval: new DefaultPackageRetrievalService(
    db,
    lockers,
    customers,
    packages,
    pickupCodes,
    codeService,
    storageCharge,
    storageChargeService,
    idempotency
  ),
  wallet: new DefaultWalletService(db, customers, walletRecharges, idempotency),
});

app.listen(port, () => {
  console.info(`Smart Package Storage API listening on port ${port}`);
});
