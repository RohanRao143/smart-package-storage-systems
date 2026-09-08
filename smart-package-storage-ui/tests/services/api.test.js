import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  storePackage,
  quotePickup,
  confirmPickup,
  rechargeWallet,
} from '../../src/services/api';

describe('frontend API service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an Idempotency-Key for package storage', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          packageId: 'package-id',
          lockerId: 'locker-id',
          lockerSize: 'SMALL',
          pickupCode: '123456',
          storedAt:
            '2026-01-01T00:00:00.000Z',
        }),
      });

    await storePackage({
      storedByUsername: 'agent01',
      recipientUsername: 'customer01',
      packageName: 'Test',
      widthCm: 10,
      heightCm: 10,
      breadthCm: 10,
      weightGrams: 1000,
      hasFragileItems: false,
    });

    const [, options] =
      fetchMock.mock.calls[0];

    expect(options.headers)
      .toHaveProperty('Idempotency-Key');

    expect(
      options.headers['Idempotency-Key'],
    ).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it('sends locker ID and pickup code for quote', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          packageId: 'package-id',
          lockerId: 'locker-id',
          heldTimeMs: 86_400_000,
          calculatedChargesCents: 100,
          walletBalanceCents: 1000,
          pickupConfirmed: true,
        }),
      });

    await quotePickup({
      lockerId: 'locker-id',
      pickupCode: '123456',
    });

    const [url, options] =
      fetchMock.mock.calls[0];

    expect(url)
      .toContain('/packages/retrieve/quote');

    const body =
      JSON.parse(options.body);

    expect(body.lockerId)
      .toBe('locker-id');

    expect(body.pickupCode)
      .toBe('123456');
  });

  it('sends confirmation only after quote', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          packageId: 'package-id',
          collectedAt:
            '2026-01-02T00:00:00.000Z',
          heldTimeMs: 86_400_000,
          chargedAmountCents: 100,
          walletBalanceCents: 900,
          lockerReleased: true,
        }),
      });

    await confirmPickup({
      lockerId: 'locker-id',
      pickupCode: '123456',
      pickupConfirmed: true,
    });

    const [url, options] =
      fetchMock.mock.calls[0];

    expect(url)
      .toContain(
        '/packages/retrieve/confirm',
      );

    const body =
      JSON.parse(options.body);

    expect(body.pickupConfirmed)
      .toBe(true);
  });

  it('recharges wallet through API', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          customerId: 'customer-id',
          rechargedAmountCents: 500,
          walletBalanceCents: 1500,
        }),
      });

    await rechargeWallet({
      customerId: 'customer-id',
      amountCents: 500,
    });

    const [url, options] =
      fetchMock.mock.calls[0];

    expect(url)
      .toContain('/wallet/recharge');

    expect(
      options.headers['Idempotency-Key'],
    ).toBeDefined();
  });

  it('throws the API error returned by backend', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            code:
              'INSUFFICIENT_WALLET_BALANCE',
            message:
              'Customer wallet cannot cover the charge.',
          },
        }),
      });

    await expect(
      rechargeWallet({
        customerId: 'customer-id',
        amountCents: 500,
      }),
    ).rejects.toThrow(
      'Customer wallet cannot cover the charge.',
    );
  });
});