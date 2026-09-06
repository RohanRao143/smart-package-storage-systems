import type { Locker } from '../contracts/domain.js';
import type { LockerAllocationService, LockerCandidate, LockerRepository } from '../contracts/lifecycle.js';
import type { PoolClient } from 'pg';

export class PostgresLockerAllocationService implements LockerAllocationService {
  constructor(private readonly lockers: LockerRepository) {}
  findAndLockSuitableLocker(client: PoolClient, candidate: LockerCandidate): Promise<Locker | null> {
    return this.lockers.findAndLockSuitable(client, candidate);
  }
}
