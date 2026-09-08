import { describe, expect, it } from 'vitest';

import { isLockerCompatible } from '../../src/services/locker-fit.js';
import type { Locker } from '../../src/contracts/domain.js';
import type { LockerCandidate } from '../../src/contracts/lifecycle.js';

const locker = (
  overrides: Partial<Locker> = {},
): Locker => ({
  id: '11111111-1111-4111-8111-111111111111',
  size: 'SMALL',
  sizeRank: 1,
  widthCm: 20 as Locker['widthCm'],
  heightCm: 15 as Locker['heightCm'],
  breadthCm: 10 as Locker['breadthCm'],
  maxWeightGrams: 5000 as Locker['maxWeightGrams'],
  fragileSupport: true,
  isOccupied: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const candidate = (
  overrides: Partial<LockerCandidate> = {},
): LockerCandidate => ({
  widthCm: 20 as LockerCandidate['widthCm'],
  heightCm: 15 as LockerCandidate['heightCm'],
  breadthCm: 10 as LockerCandidate['breadthCm'],
  weightGrams: 1000 as LockerCandidate['weightGrams'],
  hasFragileItems: false,
  ...overrides,
});

describe('isLockerCompatible', () => {
  it('accepts an exact dimensional fit', () => {
    expect(
      isLockerCompatible(
        locker(),
        candidate(),
      ),
    ).toBe(true);
  });

  it('accepts a rotated fit', () => {
    expect(
      isLockerCompatible(
        locker({
          widthCm: 10 as Locker['widthCm'],
          heightCm: 15 as Locker['heightCm'],
          breadthCm: 20 as Locker['breadthCm'],
        }),
        candidate({
          widthCm: 20 as LockerCandidate['widthCm'],
          heightCm: 10 as LockerCandidate['heightCm'],
          breadthCm: 15 as LockerCandidate['breadthCm'],
        }),
      ),
    ).toBe(true);
  });

  it('rejects a package that is too large', () => {
    expect(
      isLockerCompatible(
        locker(),
        candidate({
          widthCm: 21 as LockerCandidate['widthCm'],
        }),
      ),
    ).toBe(false);
  });

  it('rejects a package that exceeds weight capacity', () => {
    expect(
      isLockerCompatible(
        locker({
          maxWeightGrams: 1000 as Locker['maxWeightGrams'],
        }),
        candidate({
          weightGrams: 1001 as LockerCandidate['weightGrams'],
        }),
      ),
    ).toBe(false);
  });

  it('rejects fragile package without fragile support', () => {
    expect(
      isLockerCompatible(
        locker({
          fragileSupport: false,
        }),
        candidate({
          hasFragileItems: true,
        }),
      ),
    ).toBe(false);
  });

  it('accepts non-fragile package in a non-fragile locker', () => {
    expect(
      isLockerCompatible(
        locker({
          fragileSupport: false,
        }),
        candidate({
          hasFragileItems: false,
        }),
      ),
    ).toBe(true);
  });

  it('rejects an occupied locker', () => {
    expect(
      isLockerCompatible(
        locker({
          isOccupied: true,
        }),
        candidate(),
      ),
    ).toBe(false);
  });

  it('accepts dimensions smaller than locker in every orientation', () => {
    expect(
      isLockerCompatible(
        locker(),
        candidate({
          widthCm: 5 as LockerCandidate['widthCm'],
          heightCm: 10 as LockerCandidate['heightCm'],
          breadthCm: 12 as LockerCandidate['breadthCm'],
        }),
      ),
    ).toBe(true);
  });

  it('rejects when only one sorted dimension is too large', () => {
    expect(
      isLockerCompatible(
        locker(),
        candidate({
          widthCm: 9 as LockerCandidate['widthCm'],
          heightCm: 16 as LockerCandidate['heightCm'],
          breadthCm: 21 as LockerCandidate['breadthCm'],
        }),
      ),
    ).toBe(false);
  });
});