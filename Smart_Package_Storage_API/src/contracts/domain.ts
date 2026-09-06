/** Branded values prevent accidentally mixing cents, dimensions, and weights. */
export type UUID = string;
export type IsoTimestamp = string;
export type Cents = number & { readonly __brand: 'Cents' };
export type Milliseconds = number & { readonly __brand: 'Milliseconds' };
export type Centimetres = number & { readonly __brand: 'Centimetres' };
export type Grams = number & { readonly __brand: 'Grams' };

export type LockerSize = 'SMALL' | 'MEDIUM' | 'LARGE';
export type PackageStatus = 'STORED' | 'COLLECTED';
export type ChargeStatus = 'PAID' | 'FAILED';
export type IdempotencyOperation = 'STORE_PACKAGE' | 'RETRIEVE_PACKAGE';

export interface Dimensions {
  readonly widthCm: Centimetres;
  readonly heightCm: Centimetres;
  readonly breadthCm: Centimetres;
}

export interface Locker extends Dimensions {
  readonly id: UUID;
  readonly size: LockerSize;
  readonly sizeRank: 1 | 2 | 3;
  readonly maxWeightGrams: Grams;
  readonly fragileSupport: boolean;
  readonly isOccupied: boolean;
  readonly createdAt: IsoTimestamp;
}

export interface Customer {
  readonly id: UUID;
  readonly name: string;
  readonly email: string;
  readonly phoneNumber: string;
  readonly walletBalanceCents: Cents;
  readonly currentPackages: number;
  readonly totalPackages: number;
  readonly lastCheckedInAt: IsoTimestamp | null;
}

export interface StoredPackage extends Dimensions {
  readonly id: UUID;
  readonly lockerId: UUID;
  readonly customerId: UUID;
  readonly status: PackageStatus;
  readonly storedAt: IsoTimestamp;
  readonly collectedAt: IsoTimestamp | null;
  readonly weightGrams: Grams;
  readonly hasFragileItems: boolean;
  /** Tariff snapshot captured at check-in, not the current configured tariff. */
  readonly baseDailyRateCents: Cents;
}

export interface PickupCode {
  readonly id: UUID;
  readonly packageId: UUID;
  readonly customerId: UUID;
  readonly lockerId: UUID;
  /** Never expose or log this value outside persistence and code verification. */
  readonly pickupCodeHash: string;
  readonly consumedAt: IsoTimestamp | null;
  readonly createdAt: IsoTimestamp;
}

export interface StorageCharge {
  readonly id: UUID;
  readonly packageId: UUID;
  readonly pickupCodeId: UUID;
  readonly chargedAmountCents: Cents;
  readonly packageHeldTimeMs: Milliseconds;
  readonly status: ChargeStatus;
  readonly chargedAt: IsoTimestamp;
}
