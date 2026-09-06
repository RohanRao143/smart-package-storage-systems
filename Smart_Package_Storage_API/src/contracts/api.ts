import type { Cents, IsoTimestamp, LockerSize, Milliseconds, UUID } from './domain.js';

export interface CreateLockerRequest {
  readonly size: LockerSize;
  readonly widthCm: number;
  readonly heightCm: number;
  readonly breadthCm: number;
  readonly maxWeightGrams: number;
  readonly fragileSupport: boolean;
}

export interface CreateLockerResponse {
  readonly id: UUID;
  readonly size: LockerSize;
  readonly isOccupied: false;
}

export interface ListLockersQuery {
  readonly available?: boolean;
}

export interface LockerSummaryResponse {
  readonly id: UUID;
  readonly size: LockerSize;
  readonly isOccupied: boolean;
  readonly fragileSupport: boolean;
}

export interface StorePackageRequest {
  readonly customerId: UUID;
  readonly widthCm: number;
  readonly heightCm: number;
  readonly breadthCm: number;
  readonly weightGrams: number;
  readonly hasFragileItems: boolean;
}

export interface StorePackageResponse {
  readonly packageId: UUID;
  readonly lockerId: UUID;
  readonly lockerSize: LockerSize;
  /** Returned once to the trusted delivery workflow; never persisted raw. */
  readonly pickupCode: string;
  readonly storedAt: IsoTimestamp;
}

export interface RetrievePackageRequest {
  readonly lockerId: UUID;
  readonly pickupCode: string;
}

/** A non-mutating validation and price quote for a locker pickup. */
export interface PickupQuoteResponse {
  readonly packageId: UUID;
  readonly lockerId: UUID;
  readonly heldTimeMs: Milliseconds;
  readonly calculatedChargesCents: Cents;
  readonly walletBalanceCents: Cents;
  readonly pickupConfirmed: true;
}

export interface ConfirmPickupRequest extends RetrievePackageRequest {
  /** Explicit acknowledgement that the prior pickup quote was reviewed. */
  readonly pickupConfirmed: true;
}

export interface RechargeWalletRequest {
  readonly customerId: UUID;
  readonly amountCents: Cents;
}

export interface RechargeWalletResponse {
  readonly customerId: UUID;
  readonly rechargedAmountCents: Cents;
  readonly walletBalanceCents: Cents;
}

export interface RetrievePackageResponse {
  readonly packageId: UUID;
  readonly collectedAt: IsoTimestamp;
  readonly heldTimeMs: Milliseconds;
  readonly chargedAmountCents: Cents;
  readonly walletBalanceCents: Cents;
  readonly lockerReleased: true;
}

export type ErrorCode =
  | 'CUSTOMER_NOT_FOUND'
  | 'LOCKER_UNAVAILABLE'
  | 'PACKAGE_EXCEEDS_CAPACITY'
  | 'INVALID_PICKUP_CODE'
  | 'PACKAGE_ALREADY_COLLECTED'
  | 'INSUFFICIENT_WALLET_BALANCE'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'VALIDATION_ERROR';

export interface ErrorResponse {
  readonly error: { readonly code: ErrorCode; readonly message: string };
}
