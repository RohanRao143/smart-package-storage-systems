import type { Dimensions, Locker } from '../contracts/domain.js';
import type { LockerCandidate } from '../contracts/lifecycle.js';

const sorted = (dimensions: Dimensions): readonly number[] =>
  [dimensions.widthCm, dimensions.heightCm, dimensions.breadthCm].sort((a, b) => a - b);

/** Mirrors the allocation SQL predicate and provides a unit-testable fit specification. */
export function isLockerCompatible(locker: Locker, candidate: LockerCandidate): boolean {
  if (locker.isOccupied || (candidate.hasFragileItems && !locker.fragileSupport) || candidate.weightGrams > locker.maxWeightGrams)
    return false;

  const packageDimensions = sorted(candidate);
  const lockerDimensions = sorted(locker);
  return packageDimensions.every((dimension, index) => dimension <= lockerDimensions[index]!);
}
