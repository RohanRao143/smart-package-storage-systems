import type { Pool, PoolClient } from 'pg';
import type {
  Cents,
  Customer,
  Dimensions,
  Grams,
  IsoTimestamp,
  Locker,
  Milliseconds,
  PickupCode,
  StorageCharge,
  StoredPackage,
  UUID,
  IdempotencyOperation,
} from './domain.js';
import type {
  CreateLockerRequest,
  CreateLockerResponse,
  ListLockersQuery,
  LockerSummaryResponse,
  RetrievePackageRequest,
  RetrievePackageResponse,
  PickupQuoteResponse,
  RechargeWalletRequest,
  RechargeWalletResponse,
  StorePackageRequest,
  StorePackageResponse,
} from './api.js';

export interface RequestContext {
  readonly idempotencyKey: UUID;
  readonly requestHash: string;
  readonly requestedAt: IsoTimestamp;
}

export interface LockerCandidate extends Dimensions {
  readonly hasFragileItems: boolean;
  readonly weightGrams: Grams;
}

/** Finds the lowest-size compatible vacant locker and locks it for this transaction. */
export interface LockerAllocationService {
  findAndLockSuitableLocker(client: PoolClient, candidate: LockerCandidate): Promise<Locker | null>;
}

export interface PackageStorageService {
  /** Atomic lifecycle: validate -> allocate -> occupy -> create package/code -> return code. */
  storePackage(request: StorePackageRequest, context: RequestContext): Promise<StorePackageResponse>;
}

export interface PackageRetrievalService {
  /** Validates a code and provides a non-mutating current quote and wallet balance. */
  quotePickup(request: RetrievePackageRequest, requestedAt: IsoTimestamp): Promise<PickupQuoteResponse>;
  /** Atomic lifecycle: lock -> validate code -> charge -> collect -> consume code -> release. */
  retrievePackage(request: RetrievePackageRequest, context: RequestContext): Promise<RetrievePackageResponse>;
}

export interface WalletService {
  recharge(request: RechargeWalletRequest, context: RequestContext): Promise<RechargeWalletResponse>;
}

export interface LockerService {
  createLocker(request: CreateLockerRequest): Promise<CreateLockerResponse>;
  listLockers(query: ListLockersQuery): Promise<readonly LockerSummaryResponse[]>;
}

export interface StorageChargeQuote {
  readonly heldTimeMs: Milliseconds;
  readonly startedDays: number;
  readonly chargedAmountCents: Cents;
}

export interface StorageChargeService {
  calculateCharge(input: {
    readonly storedAt: IsoTimestamp;
    readonly collectedAt: IsoTimestamp;
    readonly baseDailyRateCents: Cents;
  }): StorageChargeQuote;
}

/** Raw pickup codes must be generated securely and never stored. */
export interface PickupCodeService {
  generate(): Promise<{ readonly rawCode: string; readonly hash: string }>;
  verify(rawCode: string, hash: string): Promise<boolean>;
}

export interface LockerRepository {
  create(client: PoolClient, input: CreateLockerRequest): Promise<Locker>;
  findAll(client: PoolClient): Promise<readonly Locker[]>;
  findAvailable(client: PoolClient): Promise<readonly Locker[]>;
  hasCompatibleCapacity(client: PoolClient, candidate: LockerCandidate): Promise<boolean>;
  findAndLockSuitable(client: PoolClient, candidate: LockerCandidate): Promise<Locker | null>;
  markOccupied(client: PoolClient, lockerId: UUID): Promise<void>;
  release(client: PoolClient, lockerId: UUID): Promise<void>;
  findByIdForUpdate(client: PoolClient, lockerId: UUID): Promise<Locker | null>;
}

export interface CustomerRepository {
  findByIdForUpdate(client: PoolClient, customerId: UUID): Promise<Customer | null>;
  debitWallet(client: PoolClient, customerId: UUID, amountCents: Cents): Promise<Customer>;
  creditWallet(client: PoolClient, customerId: UUID, amountCents: Cents): Promise<Customer>;
  recordCheckIn(client: PoolClient, customerId: UUID, checkedInAt: IsoTimestamp): Promise<void>;
  recordCollection(client: PoolClient, customerId: UUID): Promise<void>;
}

export interface PackageRepository {
  create(client: PoolClient, input: Omit<StoredPackage, 'id' | 'status' | 'collectedAt'>): Promise<StoredPackage>;
  findStoredByLockerForUpdate(client: PoolClient, lockerId: UUID): Promise<StoredPackage | null>;
  findLatestByLockerForUpdate(client: PoolClient, lockerId: UUID): Promise<StoredPackage | null>;
  markCollected(client: PoolClient, packageId: UUID, collectedAt: IsoTimestamp): Promise<StoredPackage>;
}

export interface PickupCodeRepository {
  create(client: PoolClient, input: Omit<PickupCode, 'id' | 'consumedAt' | 'createdAt'>): Promise<PickupCode>;
  findByPackageForUpdate(client: PoolClient, packageId: UUID): Promise<PickupCode | null>;
  consume(client: PoolClient, pickupCodeId: UUID, consumedAt: IsoTimestamp): Promise<void>;
}

export interface StorageChargeRepository {
  create(client: PoolClient, input: Omit<StorageCharge, 'id' | 'chargedAt'>): Promise<StorageCharge>;
}

export interface WalletRechargeRepository {
  create(client: PoolClient, input: { readonly customerId: UUID; readonly idempotencyKey: UUID; readonly amountCents: Cents }): Promise<void>;
}

export interface IdempotencyRepository {
  /** Serializes first-use requests for the same key before checking the record. */
  lock(client: PoolClient, context: RequestContext, operation: IdempotencyOperation): Promise<void>;
  /** Returns the previous result for a safe retry; a changed payload is rejected. */
  find<TResponse>(client: PoolClient, context: RequestContext, operation: IdempotencyOperation): Promise<IdempotencyResult<TResponse> | null>;
  save<TResponse>(client: PoolClient, context: RequestContext, operation: IdempotencyOperation, responseStatus: number, response: TResponse): Promise<void>;
}

export interface IdempotencyResult<TResponse> {
  readonly requestHash: string;
  readonly responseStatus: number;
  readonly response: TResponse;
}

export interface TransactionManager {
  withinTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T>;
}

/** Concrete adapter owns the pg pool and transaction lifecycle. */
export interface PostgresDatabase extends TransactionManager {
  readonly pool: Pool;
  close(): Promise<void>;
}
