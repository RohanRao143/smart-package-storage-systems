import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultWalletService } from '../../src/services/wallet-service.js';

const client = {} as any;

const db = {
  withinTransaction: vi.fn(async (callback: any) =>
    callback(client),
  ),
};

const customers = {
  findByIdForUpdate: vi.fn(),
  creditWallet: vi.fn(),
};

const recharges = {
  create: vi.fn(),
};

const idempotency = {
  lock: vi.fn(),
  find: vi.fn(),
  save: vi.fn(),
};

const service = new DefaultWalletService(
  db as any,
  customers as any,
  recharges as any,
  idempotency as any,
);

const customerId =
  '11111111-1111-4111-8111-111111111111';

const context = {
  idempotencyKey:
    '22222222-2222-4222-8222-222222222222',
  requestHash: 'hash',
  requestedAt: '2026-01-01T00:00:00.000Z',
};

describe('DefaultWalletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    customers.findByIdForUpdate.mockResolvedValue({
      id: customerId,
      walletBalanceCents: 1000,
    });

    customers.creditWallet.mockResolvedValue({
      id: customerId,
      walletBalanceCents: 1500,
    });
  });

  it('recharges a customer wallet', async () => {
    const result = await service.recharge(
      {
        customerId,
        amountCents: 500,
      } as any,
      context as any,
    );

    expect(result).toEqual({
      customerId,
      rechargedAmountCents: 500,
      walletBalanceCents: 1500,
    });

    expect(customers.creditWallet)
      .toHaveBeenCalledWith(
        client,
        customerId,
        500,
      );

    expect(recharges.create)
      .toHaveBeenCalled();

    expect(idempotency.save)
      .toHaveBeenCalled();
  });

  it('rejects unknown customer', async () => {
    customers.findByIdForUpdate
      .mockResolvedValue(null);

    await expect(
      service.recharge(
        {
          customerId,
          amountCents: 500,
        } as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    });

    expect(customers.creditWallet)
      .not.toHaveBeenCalled();

    expect(recharges.create)
      .not.toHaveBeenCalled();
  });

  it('replays an idempotent recharge', async () => {
    const response = {
      customerId,
      rechargedAmountCents: 500,
      walletBalanceCents: 1500,
    };

    idempotency.find.mockResolvedValue({
      requestHash: context.requestHash,
      responseStatus: 200,
      response,
    });

    await expect(
      service.recharge(
        {
          customerId,
          amountCents: 500,
        } as any,
        context as any,
      ),
    ).resolves.toEqual(response);

    expect(customers.creditWallet)
      .not.toHaveBeenCalled();
  });

  it('rejects idempotency key reuse with changed request', async () => {
    idempotency.find.mockResolvedValue({
      requestHash: 'different',
      responseStatus: 200,
      response: {},
    });

    await expect(
      service.recharge(
        {
          customerId,
          amountCents: 500,
        } as any,
        context as any,
      ),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });
});