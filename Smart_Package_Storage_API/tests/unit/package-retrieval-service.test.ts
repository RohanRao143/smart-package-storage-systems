import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultPackageRetrievalService } from '../../src/services/package-retrieval-service.js';

const client = {} as any;

const db = {
  withinTransaction: vi.fn(async (callback: any) =>
    callback(client),
  ),
};

const lockers = {
  findByIdForUpdate: vi.fn(),
  release: vi.fn(),
};

const customers = {
  findByIdForUpdate: vi.fn(),
  findByUsernameForUpdate: vi.fn(),
  debitWallet: vi.fn(),
  recordCollection: vi.fn(),
};

const packages = {
  findStoredByLockerForUpdate: vi.fn(),
  findLatestByLockerForUpdate: vi.fn(),
  markCollected: vi.fn(),
};

const pickupCodes = {
  findByPackageForUpdate: vi.fn(),
  consume: vi.fn(),
};

const codeService = {
  verify: vi.fn(),
};

const charges = {
  create: vi.fn(),
};

const pricing = {
  calculateCharge: vi.fn(),
};

const idempotency = {
  lock: vi.fn(),
  find: vi.fn(),
  save: vi.fn(),
};

const service = new DefaultPackageRetrievalService(
  db as any,
  lockers as any,
  customers as any,
  packages as any,
  pickupCodes as any,
  codeService as any,
  charges as any,
  pricing as any,
  idempotency as any,
);

const context = {
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  requestHash: 'hash',
  requestedAt: '2026-01-02T00:00:00.000Z',
};

const request = {
  lockerId: '44444444-4444-4444-8444-444444444444',
  pickupCode: '123456',
  receivedByUsername: 'customer01',
};

const activePackage = {
  id: '55555555-5555-4555-8555-555555555555',
  lockerId: request.lockerId,
  customerId: '33333333-3333-4333-8333-333333333333',
  storedAt: '2026-01-01T00:00:00.000Z',
  baseDailyRateCents: 100,
};

const locker = {
  id: request.lockerId,
};

const owner = {
  id: activePackage.customerId,
};

const receiver = {
  id: '66666666-6666-4666-8666-666666666666',
  walletBalanceCents: 1000,
};

const pickupCode = {
  id: '77777777-7777-4777-8777-777777777777',
  consumedAt: null,
  pickupCodeHash: 'salt:hash',
};

describe('DefaultPackageRetrievalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    packages.findStoredByLockerForUpdate
      .mockResolvedValue(activePackage);

    lockers.findByIdForUpdate
      .mockResolvedValue(locker);

    customers.findByIdForUpdate
      .mockResolvedValue(owner);

    customers.findByUsernameForUpdate
      .mockResolvedValue(receiver);

    pickupCodes.findByPackageForUpdate
      .mockResolvedValue(pickupCode);

    codeService.verify
      .mockResolvedValue(true);

    pricing.calculateCharge
      .mockReturnValue({
        heldTimeMs: 86_400_000,
        startedDays: 1,
        chargedAmountCents: 100,
      });

    customers.debitWallet
      .mockResolvedValue({
        ...receiver,
        walletBalanceCents: 900,
      });
  });

  it('successfully retrieves a package', async () => {
    const result = await service.retrievePackage(
      request as any,
      context as any,
    );

    expect(result).toEqual({
      packageId: activePackage.id,
      collectedAt: context.requestedAt,
      heldTimeMs: 86_400_000,
      chargedAmountCents: 100,
      walletBalanceCents: 900,
      lockerReleased: true,
    });

    expect(customers.debitWallet)
      .toHaveBeenCalled();

    expect(charges.create)
      .toHaveBeenCalled();

    expect(packages.markCollected)
      .toHaveBeenCalled();

    expect(pickupCodes.consume)
      .toHaveBeenCalled();

    expect(customers.recordCollection)
      .toHaveBeenCalled();

    expect(lockers.release)
      .toHaveBeenCalled();

    expect(idempotency.save)
      .toHaveBeenCalled();
  });

  it('rejects invalid pickup code', async () => {
    codeService.verify.mockResolvedValue(false);

    await expect(
      service.retrievePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_PICKUP_CODE',
    });

    expect(customers.debitWallet).not.toHaveBeenCalled();
    expect(packages.markCollected).not.toHaveBeenCalled();
    expect(lockers.release).not.toHaveBeenCalled();
  });

  it('rejects consumed pickup code', async () => {
    pickupCodes.findByPackageForUpdate.mockResolvedValue({
      ...pickupCode,
      consumedAt: '2026-01-02T00:00:00.000Z',
    });

    await expect(
      service.retrievePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_PICKUP_CODE',
    });
  });

  it('rejects insufficient wallet balance', async () => {
    customers.findByUsernameForUpdate
      .mockResolvedValue({
        ...receiver,
        walletBalanceCents: 99,
      });

    await expect(
      service.retrievePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_WALLET_BALANCE',
    });

    expect(customers.debitWallet).not.toHaveBeenCalled();
    expect(charges.create).not.toHaveBeenCalled();
    expect(packages.markCollected).not.toHaveBeenCalled();
    expect(pickupCodes.consume).not.toHaveBeenCalled();
    expect(lockers.release).not.toHaveBeenCalled();
  });

  it('returns the original result for an idempotent retry', async () => {
    const response = {
      packageId: activePackage.id,
      collectedAt: context.requestedAt,
      heldTimeMs: 100,
      chargedAmountCents: 100,
      walletBalanceCents: 900,
      lockerReleased: true,
    };

    idempotency.find.mockResolvedValue({
      requestHash: context.requestHash,
      responseStatus: 200,
      response,
    });

    await expect(
      service.retrievePackage(
        request as any,
        context as any,
      ),
    ).resolves.toEqual(response);

    expect(customers.debitWallet).not.toHaveBeenCalled();
    expect(lockers.release).not.toHaveBeenCalled();
  });

  it('rejects reused idempotency key with changed payload', async () => {
    idempotency.find.mockResolvedValue({
      requestHash: 'different',
      responseStatus: 200,
      response: {},
    });

    await expect(
      service.retrievePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('rejects already collected package', async () => {
    packages.findStoredByLockerForUpdate
      .mockResolvedValue(null);

    packages.findLatestByLockerForUpdate
      .mockResolvedValue({
        status: 'COLLECTED',
      });

    await expect(
      service.retrievePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'PACKAGE_ALREADY_COLLECTED',
    });
  });

  it('rejects unknown locker/package combination', async () => {
    packages.findStoredByLockerForUpdate
      .mockResolvedValue(null);

    packages.findLatestByLockerForUpdate
      .mockResolvedValue(null);

    await expect(
      service.retrievePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_PICKUP_CODE',
    });
  });
});