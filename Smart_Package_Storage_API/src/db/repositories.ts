import type { PoolClient, QueryResultRow } from 'pg';
import type { CreateLockerRequest } from '../contracts/api.js';
import type { Customer, IdempotencyOperation, Locker, PickupCode, StorageCharge, StoredPackage, UUID } from '../contracts/domain.js';
import type { CustomerRepository, IdempotencyRepository, IdempotencyResult, LockerCandidate, LockerRepository, PackageRepository, PickupCodeRepository, RequestContext, StorageChargeRepository, WalletRechargeRepository } from '../contracts/lifecycle.js';
import { toCustomer, toLocker, toPackage, toPickupCode, toStorageCharge } from './mappers.js';

const one = <T extends QueryResultRow>(rows: readonly T[]): T => {
  const row = rows[0];
  if (!row) throw new Error('Expected a database row.');
  return row;
};
const lockerRank: Record<CreateLockerRequest['size'], 1 | 2 | 3> = { SMALL: 1, MEDIUM: 2, LARGE: 3 };

export class PgLockerRepository implements LockerRepository {
  async create(client: PoolClient, input: CreateLockerRequest): Promise<Locker> {
    const r = await client.query('INSERT INTO lockers (size, size_rank, width_cm, height_cm, breadth_cm, max_weight_grams, fragile_support) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [
      input.size,
      lockerRank[input.size],
      input.widthCm,
      input.heightCm,
      input.breadthCm,
      input.maxWeightGrams,
      input.fragileSupport
    ]);
    return toLocker(one(r.rows));
  }

  async findAvailable(client: PoolClient): Promise<readonly Locker[]> {
    const r = await client.query('SELECT * FROM lockers WHERE is_occupied = false ORDER BY size_rank, id');
    return r.rows.map(toLocker);
  }

  async findAll(client: PoolClient): Promise<readonly Locker[]> {
    const r = await client.query('SELECT * FROM lockers ORDER BY size_rank, id');
    return r.rows.map(toLocker);
  }

  async hasCompatibleCapacity(client: PoolClient, candidate: LockerCandidate): Promise<boolean> {
    const r = await client.query(`SELECT EXISTS(SELECT 1 FROM lockers
      WHERE max_weight_grams >= $1 AND ($2 = false OR fragile_support = true)
      AND ARRAY(SELECT x FROM unnest(ARRAY[width_cm, height_cm, breadth_cm]) AS x ORDER BY x)
          >= ARRAY(SELECT x FROM unnest(ARRAY[$3::integer, $4::integer, $5::integer]) AS x ORDER BY x)) AS exists`,
      [
        candidate.weightGrams,
        candidate.hasFragileItems,
        candidate.widthCm,
        candidate.heightCm,
        candidate.breadthCm
      ]);

    return r.rows[0]?.exists === true;
  }

  async findAndLockSuitable(client: PoolClient, candidate: LockerCandidate): Promise<Locker | null> {
    // Sorted-dimension comparison permits rotation; SKIP LOCKED prevents competing stores from sharing a locker.
    const r = await client.query(`SELECT * FROM lockers
      WHERE is_occupied = false AND max_weight_grams >= $1 AND ($2 = false OR fragile_support = true)
      AND ARRAY(SELECT x FROM unnest(ARRAY[width_cm, height_cm, breadth_cm]) AS x ORDER BY x)
          >= ARRAY(SELECT x FROM unnest(ARRAY[$3::integer, $4::integer, $5::integer]) AS x ORDER BY x)
      ORDER BY size_rank, id FOR UPDATE SKIP LOCKED LIMIT 1`, [
      candidate.weightGrams,
      candidate.hasFragileItems,
      candidate.widthCm,
      candidate.heightCm,
      candidate.breadthCm
    ]);

    return r.rows[0] ? toLocker(r.rows[0]) : null;
  }

  async markOccupied(client: PoolClient, lockerId: UUID): Promise<void> {
    await client.query('UPDATE lockers SET is_occupied = true WHERE id = $1', [lockerId]);
  }

  async release(client: PoolClient, lockerId: UUID): Promise<void> {
    await client.query('UPDATE lockers SET is_occupied = false WHERE id = $1', [lockerId]);
  }

  async findByIdForUpdate(client: PoolClient, lockerId: UUID): Promise<Locker | null> {
    const r = await client.query('SELECT * FROM lockers WHERE id = $1 FOR UPDATE', [lockerId]);
    return r.rows[0] ? toLocker(r.rows[0]) : null;
  }
}

export class PgCustomerRepository implements CustomerRepository {
  async findByIdForUpdate(client: PoolClient, id: UUID): Promise<Customer | null> {
    const r = await client.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [id]);
    return r.rows[0] ? toCustomer(r.rows[0]) : null;
  }

  async debitWallet(client: PoolClient, id: UUID, amount: Customer['walletBalanceCents']): Promise<Customer> {
    const r = await client.query('UPDATE customers SET wallet_balance_cents = wallet_balance_cents - $2, updated_at = now() WHERE id = $1 AND wallet_balance_cents >= $2 RETURNING *', [id, amount]);
    return toCustomer(one(r.rows));
  }

  async creditWallet(client: PoolClient, id: UUID, amount: Customer['walletBalanceCents']): Promise<Customer> {
    const r = await client.query('UPDATE customers SET wallet_balance_cents = wallet_balance_cents + $2, updated_at = now() WHERE id = $1 RETURNING *', [id, amount]);
    return toCustomer(one(r.rows));
  }

  async recordCheckIn(client: PoolClient, id: UUID, checkedInAt: string): Promise<void> {
    await client.query('UPDATE customers SET current_packages = current_packages + 1, total_packages = total_packages + 1, last_checked_in_at = $2, updated_at = now() WHERE id = $1', [id, checkedInAt]);
  }

  async recordCollection(client: PoolClient, id: UUID): Promise<void> {
    await client.query('UPDATE customers SET current_packages = current_packages - 1, updated_at = now() WHERE id = $1 AND current_packages > 0', [id]);
  }
}

export class PgPackageRepository implements PackageRepository {
  async create(client: PoolClient, p: Omit<StoredPackage, 'id' | 'status' | 'collectedAt'>): Promise<StoredPackage> {
    const r = await client.query('INSERT INTO packages (locker_id, customer_id, stored_at, width_cm, height_cm, breadth_cm, weight_grams, has_fragile_items, base_daily_rate_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [
      p.lockerId,
      p.customerId,
      p.storedAt,
      p.widthCm,
      p.heightCm,
      p.breadthCm,
      p.weightGrams,
      p.hasFragileItems,
      p.baseDailyRateCents
    ]);
    return toPackage(one(r.rows));
  }

  async findStoredByLockerForUpdate(client: PoolClient, lockerId: UUID): Promise<StoredPackage | null> {
    const r = await client.query("SELECT * FROM packages WHERE locker_id = $1 AND status = 'STORED' FOR UPDATE", [lockerId]);
    return r.rows[0] ? toPackage(r.rows[0]) : null;
  }

  async findLatestByLockerForUpdate(client: PoolClient, lockerId: UUID): Promise<StoredPackage | null> {
    const r = await client.query('SELECT * FROM packages WHERE locker_id = $1 ORDER BY stored_at DESC LIMIT 1 FOR UPDATE', [lockerId]);
    return r.rows[0] ? toPackage(r.rows[0]) : null;
  }

  async markCollected(client: PoolClient, id: UUID, collectedAt: string): Promise<StoredPackage> {
    const r = await client.query("UPDATE packages SET status = 'COLLECTED', collected_at = $2 WHERE id = $1 AND status = 'STORED' RETURNING *", [id, collectedAt]);
    return toPackage(one(r.rows));
  }
}

export class PgPickupCodeRepository implements PickupCodeRepository {
  async create(client: PoolClient, p: Omit<PickupCode, 'id' | 'consumedAt' | 'createdAt'>): Promise<PickupCode> {
    const r = await client.query('INSERT INTO pickup_codes (package_id, customer_id, locker_id, pickup_code_hash) VALUES ($1,$2,$3,$4) RETURNING *', [
      p.packageId,
      p.customerId,
      p.lockerId,
      p.pickupCodeHash
    ]);
    return toPickupCode(one(r.rows));
  }
  
  async findByPackageForUpdate(client: PoolClient, packageId: UUID): Promise<PickupCode | null> {
    const r = await client.query('SELECT * FROM pickup_codes WHERE package_id = $1 FOR UPDATE', [packageId]);
    return r.rows[0] ? toPickupCode(r.rows[0]) : null;
  }

  async consume(client: PoolClient, id: UUID, consumedAt: string): Promise<void> {
    await client.query('UPDATE pickup_codes SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL', [id, consumedAt]);
  }
}

export class PgStorageChargeRepository implements StorageChargeRepository {
  async create(client: PoolClient, c: Omit<StorageCharge, 'id' | 'chargedAt'>): Promise<StorageCharge> {
    const r = await client.query('INSERT INTO storage_charges (package_id, pickup_code_id, charged_amount_cents, package_held_time_ms, status) VALUES ($1,$2,$3,$4,$5) RETURNING *', [
      c.packageId,
      c.pickupCodeId,
      c.chargedAmountCents,
      c.packageHeldTimeMs,
      c.status
    ]);
    return toStorageCharge(one(r.rows));
  }
}

export class PgWalletRechargeRepository implements WalletRechargeRepository {
  async create(client: PoolClient, input: { readonly customerId: UUID; readonly idempotencyKey: UUID; readonly amountCents: Customer['walletBalanceCents'] }): Promise<void> {
    await client.query('INSERT INTO wallet_recharges (customer_id, idempotency_key, amount_cents) VALUES ($1, $2, $3)', [input.customerId, input.idempotencyKey, input.amountCents]);
  }
}

export class PgIdempotencyRepository implements IdempotencyRepository {
  async lock(client: PoolClient, context: RequestContext, operation: IdempotencyOperation): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `${operation}:${context.idempotencyKey}`
    ]);
  }
  
  async find<T>(client: PoolClient, context: RequestContext, operation: IdempotencyOperation): Promise<IdempotencyResult<T> | null> {
    const r = await client.query('SELECT request_hash, response_status, response_body FROM idempotency_records WHERE operation = $1 AND idempotency_key = $2 FOR UPDATE', [
      operation,
      context.idempotencyKey
    ]);
    if (!r.rows[0])
      return null;
    return {
      requestHash: r.rows[0].request_hash,
      responseStatus: Number(r.rows[0].response_status),
      response: r.rows[0].response_body as T
    };
  }

  async save<T>(client: PoolClient, context: RequestContext, operation: IdempotencyOperation, status: number, response: T): Promise<void> {
    await client.query('INSERT INTO idempotency_records (operation, idempotency_key, request_hash, response_status, response_body) VALUES ($1,$2,$3,$4,$5::jsonb)', [
      operation,
      context.idempotencyKey,
      context.requestHash,
      status,
      JSON.stringify(response)
    ]);
  }
}
