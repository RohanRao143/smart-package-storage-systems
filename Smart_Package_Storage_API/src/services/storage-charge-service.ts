import type { Cents, Milliseconds } from '../contracts/domain.js';
import type { StorageChargeQuote, StorageChargeService } from '../contracts/lifecycle.js';

const DAY_MS = 24 * 60 * 60 * 1_000;

export class ProgressiveStorageChargeService implements StorageChargeService {
  calculateCharge(input: { 
    readonly storedAt: string;
    readonly collectedAt: string;
    readonly baseDailyRateCents: Cents
  }): StorageChargeQuote {
    const heldTimeMs = new Date(input.collectedAt).getTime() - new Date(input.storedAt).getTime();

    if (!Number.isSafeInteger(heldTimeMs) || heldTimeMs < 0)
      throw new Error('Collection time cannot precede storage time.');
    
    const startedDays = Math.max(1, Math.ceil(heldTimeMs / DAY_MS));
    const amount = Math.min(startedDays, 5) * input.baseDailyRateCents
      + Math.min(Math.max(startedDays - 5, 0), 5) * 2 * input.baseDailyRateCents
      + Math.max(startedDays - 10, 0) * 3 * input.baseDailyRateCents;

    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new Error('Storage charge exceeds safe integer cents.');
    
    return { heldTimeMs: heldTimeMs as Milliseconds, startedDays, chargedAmountCents: amount as Cents };
  }
}
