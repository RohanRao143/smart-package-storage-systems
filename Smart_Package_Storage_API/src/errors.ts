import type { ErrorCode } from './contracts/api.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const errors = {
  customerNotFound: () => new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found.'),
  lockerUnavailable: () => new ApiError(409, 'LOCKER_UNAVAILABLE', 'No compatible locker is currently available.'),
  exceedsCapacity: () => new ApiError(422, 'PACKAGE_EXCEEDS_CAPACITY', 'Package exceeds all locker capacity.'),
  invalidCode: () => new ApiError(403, 'INVALID_PICKUP_CODE', 'Locker ID or pickup code is invalid.'),
  alreadyCollected: () => new ApiError(409, 'PACKAGE_ALREADY_COLLECTED', 'Package has already been collected.'),
  insufficientBalance: () => new ApiError(422, 'INSUFFICIENT_WALLET_BALANCE', 'Wallet balance is insufficient.'),
  idempotencyRequired: () => new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key must be a UUID.'),
  idempotencyReused: () => new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used with a different request.'),
  validation: (message: string) => new ApiError(400, 'VALIDATION_ERROR', message),
};
