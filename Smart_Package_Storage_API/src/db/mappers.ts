import type { QueryResultRow } from 'pg';
import type { Customer, Locker, PickupCode, StorageCharge, StoredPackage } from '../contracts/domain.js';

const integer = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('Database returned an unsafe integer.');
  return parsed;
};
const timestamp = (value: unknown): string => new Date(value as string | Date).toISOString();

export const toLocker = (row: QueryResultRow): Locker => ({
  id: row.id,
  size: row.size,
  sizeRank: integer(row.size_rank) as 1 | 2 | 3,
  widthCm: integer(row.width_cm) as Locker['widthCm'],
  heightCm: integer(row.height_cm) as Locker['heightCm'],
  breadthCm: integer(row.breadth_cm) as Locker['breadthCm'],
  maxWeightGrams: integer(row.max_weight_grams) as Locker['maxWeightGrams'],
  fragileSupport: row.fragile_support,
  isOccupied: row.is_occupied,
  createdAt: timestamp(row.created_at),
});

export const toCustomer = (row: QueryResultRow): Customer => ({
  id: row.id,
  username: row.username,
  name: row.name,
  email: row.email,
  phoneNumber: row.phone_number,
  walletBalanceCents: integer(row.wallet_balance_cents) as Customer['walletBalanceCents'],
  currentPackages: integer(row.current_packages),
  totalPackages: integer(row.total_packages),
  lastCheckedInAt: row.last_checked_in_at ? timestamp(row.last_checked_in_at) : null,
});

export const toPackage = (row: QueryResultRow): StoredPackage => ({
  id: row.id,
  lockerId: row.locker_id,
  customerId: row.customer_id,
  storedBy: row.stored_by,
  receivedBy: row.received_by,
  status: row.status,
  storedAt: timestamp(row.stored_at),
  collectedAt: row.collected_at ? timestamp(row.collected_at) : null,
  widthCm: integer(row.width_cm) as StoredPackage['widthCm'],
  heightCm: integer(row.height_cm) as StoredPackage['heightCm'],
  breadthCm: integer(row.breadth_cm) as StoredPackage['breadthCm'],
  weightGrams: integer(row.weight_grams) as StoredPackage['weightGrams'],
  hasFragileItems: row.has_fragile_items,
  baseDailyRateCents: integer(row.base_daily_rate_cents) as StoredPackage['baseDailyRateCents'],
});

export const toPickupCode = (row: QueryResultRow): PickupCode => ({
  id: row.id,
  packageId: row.package_id,
  customerId: row.customer_id,
  lockerId: row.locker_id,
  pickupCodeHash: row.pickup_code_hash,
  consumedAt: row.consumed_at ? timestamp(row.consumed_at) : null,
  createdAt: timestamp(row.created_at),
});

export const toStorageCharge = (row: QueryResultRow): StorageCharge => ({
  id: row.id,
  packageId: row.package_id,
  pickupCodeId: row.pickup_code_id,
  chargedAmountCents: integer(row.charged_amount_cents) as StorageCharge['chargedAmountCents'],
  packageHeldTimeMs: integer(row.package_held_time_ms) as StorageCharge['packageHeldTimeMs'],
  status: row.status,
  chargedAt: timestamp(row.charged_at),
});
