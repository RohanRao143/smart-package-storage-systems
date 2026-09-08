import { describe, expect, it, vi, beforeEach } from 'vitest';

import { DefaultPackageStorageService } from '../../src/services/package-storage-service.js';
import { ApiError } from '../../src/errors.js';

const client = {} as any;

const db = {
  withinTransaction: vi.fn(async (callback: any) =>
    callback(client),
  ),
};

const lockers = {
  markOccupied: vi.fn(),
  hasCompatibleCapacity: vi.fn(),
};

const customers = {
  findByUsernameForUpdate: vi.fn(),
  recordCheckIn: vi.fn(),
};

const packages = {
  create: vi.fn(),
  findStoredByLockerForUpdate: vi.fn(),
};

const pickupCodes = {
  create: vi.fn(),
};

const allocation = {
  findAndLockSuitableLocker: vi.fn(),
};

const codeService = {
  generate: vi.fn(),
};

const idempotency = {
  lock: vi.fn(),
  find: vi.fn(),
  save: vi.fn(),
};

const service = new DefaultPackageStorageService(
  db as any,
  allocation as any,
  lockers as any,
  customers as any,
  packages as any,
  pickupCodes as any,
  codeService as any,
  idempotency as any,
  100 as any,
);

const context = {
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  requestHash: 'hash',
  requestedAt: '2026-01-01T00:00:00.000Z',
};

const request = {
  storedByUsername: 'agent01',
  recipientUsername: 'customer01',
  packageName: 'Laptop',
  widthCm: 20,
  heightCm: 15,
  breadthCm: 10,
  weightGrams: 1000,
  hasFragileItems: false,
};

const storedBy = {
  id: '22222222-2222-4222-8222-222222222222',
};

const recipient = {
  id: '33333333-3333-4333-8333-333333333333',
};

const locker = {
  id: '44444444-4444-4444-8444-444444444444',
  size: 'SMALL',
};

const storedPackage = {
  id: '55555555-5555-4555-8555-555555555555',
  lockerId: locker.id,
  storedAt: context.requestedAt,
};

describe('DefaultPackageStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    customers.findByUsernameForUpdate
      .mockResolvedValueOnce(storedBy)
      .mockResolvedValueOnce(recipient);

    allocation.findAndLockSuitableLocker
      .mockResolvedValue(locker);

    packages.create.mockResolvedValue(storedPackage);

    packages.findStoredByLockerForUpdate
      .mockResolvedValue(storedPackage);

    codeService.generate.mockResolvedValue({
      rawCode: '123456',
      hash: 'salt:hash',
    });
  });

  it('stores a package and returns pickup code', async () => {
    const result = await service.storePackage(
      request as any,
      context as any,
    );

    expect(result).toEqual({
      packageId: storedPackage.id,
      lockerId: locker.id,
      lockerSize: locker.size,
      pickupCode: '123456',
      storedAt: context.requestedAt,
    });

    expect(lockers.markOccupied)
      .toHaveBeenCalledWith(client, locker.id);

    expect(pickupCodes.create)
      .toHaveBeenCalled();

    expect(customers.recordCheckIn)
      .toHaveBeenCalledWith(
        client,
        recipient.id,
        context.requestedAt,
      );

    expect(idempotency.save)
      .toHaveBeenCalled();
  });

  it('returns previous result for an idempotent retry', async () => {
    const previous = {
      requestHash: context.requestHash,
      responseStatus: 201,
      response: {
        packageId: storedPackage.id,
        lockerId: locker.id,
        lockerSize: 'SMALL',
        pickupCode: '123456',
        storedAt: context.requestedAt,
      },
    };

    idempotency.find.mockResolvedValue(previous);

    const result = await service.storePackage(
      request as any,
      context as any,
    );

    expect(result).toEqual(previous.response);

    expect(allocation.findAndLockSuitableLocker)
      .not.toHaveBeenCalled();

    expect(packages.create)
      .not.toHaveBeenCalled();
  });

  it('rejects reuse of idempotency key with a different request', async () => {
    idempotency.find.mockResolvedValue({
      requestHash: 'different-hash',
      responseStatus: 201,
      response: {},
    });

    await expect(
      service.storePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('rejects when customer does not exist', async () => {
    customers.findByUsernameForUpdate
      .mockReset()
      .mockResolvedValueOnce(null);

    await expect(
      service.storePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    });

    expect(allocation.findAndLockSuitableLocker)
      .not.toHaveBeenCalled();
  });

  it('rejects when no compatible locker exists but capacity exists', async () => {
    allocation.findAndLockSuitableLocker
      .mockResolvedValue(null);

    lockers.hasCompatibleCapacity
      .mockResolvedValue(true);

    await expect(
      service.storePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'LOCKER_UNAVAILABLE',
    });
  });

  it('rejects when package exceeds every locker capacity', async () => {
    allocation.findAndLockSuitableLocker
      .mockResolvedValue(null);

    lockers.hasCompatibleCapacity
      .mockResolvedValue(false);

    await expect(
      service.storePackage(
        request as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'PACKAGE_EXCEEDS_CAPACITY',
    });
  });

  it('does not create a package when allocation fails', async () => {
    allocation.findAndLockSuitableLocker
      .mockResolvedValue(null);

    lockers.hasCompatibleCapacity
      .mockResolvedValue(false);

    await expect(
      service.storePackage(
        request as any,
        context as any,
      ),
    ).rejects.toThrow();

    expect(packages.create).not.toHaveBeenCalled();
    expect(pickupCodes.create).not.toHaveBeenCalled();
    expect(customers.recordCheckIn).not.toHaveBeenCalled();
  });
});