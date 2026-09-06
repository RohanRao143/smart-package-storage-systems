import { describe, expect, it } from 'vitest';
import { isLockerCompatible } from '../src/services/locker-fit.js';

const locker = (overrides: Record<string, unknown> = {}) => ({ id: 'a', size: 'SMALL', sizeRank: 1, widthCm: 20, heightCm: 30, breadthCm: 40, maxWeightGrams: 2_000, fragileSupport: true, isOccupied: false, createdAt: new Date().toISOString(), ...overrides }) as never;
const packageCandidate = (overrides: Record<string, unknown> = {}) => ({ widthCm: 20, heightCm: 30, breadthCm: 40, weightGrams: 2_000, hasFragileItems: false, ...overrides }) as never;

describe('isLockerCompatible', () => {
  it('accepts exact and rotated fits', () => {
    expect(isLockerCompatible(locker(), packageCandidate())).toBe(true);
    expect(isLockerCompatible(locker(), packageCandidate({ widthCm: 40, heightCm: 20, breadthCm: 30 }))).toBe(true);
  });
  it('rejects fragile packages in unsuitable lockers and oversize packages', () => {
    expect(isLockerCompatible(locker({ fragileSupport: false }), packageCandidate({ hasFragileItems: true }))).toBe(false);
    expect(isLockerCompatible(locker(), packageCandidate({ widthCm: 41 }))).toBe(false);
  });
});
