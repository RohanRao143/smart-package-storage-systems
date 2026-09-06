import { describe, expect, it } from 'vitest';
import { ProgressiveStorageChargeService } from '../src/services/storage-charge-service.js';

const cents = 100 as never;
const at = (days: number): string => new Date(Date.UTC(2026, 0, 1) + days * 86_400_000).toISOString();

describe('ProgressiveStorageChargeService', () => {
  const service = new ProgressiveStorageChargeService();
  it.each([[0, 100], [5, 500], [6, 700], [10, 1500], [11, 1800]])('charges %i started days at the correct tier', (days, expected) => {
    expect(service.calculateCharge({ storedAt: at(0), collectedAt: at(days), baseDailyRateCents: cents }).chargedAmountCents).toBe(expected);
  });
});
