import { describe, expect, it } from 'vitest';

import { ProgressiveStorageChargeService } from '../../src/services/storage-charge-service.js';
import type { Cents } from '../../src/contracts/domain.js';

const service = new ProgressiveStorageChargeService();

const rate = 100 as Cents;

const storage = '2026-01-01T00:00:00.000Z';

const collectedAfter = (milliseconds: number) =>
  new Date(
    new Date(storage).getTime() + milliseconds,
  ).toISOString();

const DAY = 24 * 60 * 60 * 1000;

describe('ProgressiveStorageChargeService', () => {
  it('charges one day immediately', () => {
    const result = service.calculateCharge({
      storedAt: storage,
      collectedAt: storage,
      baseDailyRateCents: rate,
    });

    expect(result.heldTimeMs).toBe(0);
    expect(result.startedDays).toBe(1);
    expect(result.chargedAmountCents).toBe(100);
  });

  it('charges one day for less than 24 hours', () => {
    const result = service.calculateCharge({
      storedAt: storage,
      collectedAt: collectedAfter(DAY - 1),
      baseDailyRateCents: rate,
    });

    expect(result.startedDays).toBe(1);
    expect(result.chargedAmountCents).toBe(100);
  });

  it('charges two days after exactly 24 hours plus one millisecond', () => {
    const result = service.calculateCharge({
      storedAt: storage,
      collectedAt: collectedAfter(DAY + 1),
      baseDailyRateCents: rate,
    });

    expect(result.startedDays).toBe(2);
    expect(result.chargedAmountCents).toBe(200);
  });

  it('charges exactly five days at 1x', () => {
    const result = service.calculateCharge({
      storedAt: storage,
      collectedAt: collectedAfter(5 * DAY),
      baseDailyRateCents: rate,
    });

    expect(result.startedDays).toBe(5);
    expect(result.chargedAmountCents).toBe(500);
  });

  it('charges six days with the sixth day at 2x', () => {
    const result = service.calculateCharge({
      storedAt: storage,
      collectedAt: collectedAfter(6 * DAY),
      baseDailyRateCents: rate,
    });

    expect(result.startedDays).toBe(6);
    expect(result.chargedAmountCents).toBe(700);
  });

  it('charges ten days correctly', () => {
    const result = service.calculateCharge({
      storedAt: storage,
      collectedAt: collectedAfter(10 * DAY),
      baseDailyRateCents: rate,
    });

    expect(result.startedDays).toBe(10);
    expect(result.chargedAmountCents).toBe(1500);
  });

  it('charges eleven days with the eleventh day at 3x', () => {
    const result = service.calculateCharge({
      storedAt: storage,
      collectedAt: collectedAfter(11 * DAY),
      baseDailyRateCents: rate,
    });

    expect(result.startedDays).toBe(11);
    expect(result.chargedAmountCents).toBe(1800);
  });

  it('charges twenty days correctly', () => {
    const result = service.calculateCharge({
      storedAt: storage,
      collectedAt: collectedAfter(20 * DAY),
      baseDailyRateCents: rate,
    });

    expect(result.startedDays).toBe(20);
    expect(result.chargedAmountCents).toBe(4200);
  });

  it('rejects collection before storage', () => {
    expect(() =>
      service.calculateCharge({
        storedAt: '2026-01-02T00:00:00.000Z',
        collectedAt: '2026-01-01T23:59:59.000Z',
        baseDailyRateCents: rate,
      }),
    ).toThrow('Collection time cannot precede storage time.');
  });

  it('rejects unsafe charge values', () => {
    expect(() =>
      service.calculateCharge({
        storedAt: storage,
        collectedAt: collectedAfter(DAY),
        baseDailyRateCents: Number.MAX_SAFE_INTEGER as Cents,
      }),
    ).toThrow();
  });
});