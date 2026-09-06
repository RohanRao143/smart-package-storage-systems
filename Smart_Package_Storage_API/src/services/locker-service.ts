import type { CreateLockerRequest, CreateLockerResponse, ListLockersQuery, LockerSummaryResponse } from '../contracts/api.js';
import type { LockerRepository, LockerService, TransactionManager } from '../contracts/lifecycle.js';

export class DefaultLockerService implements LockerService {
  
  constructor(private readonly db: TransactionManager, private readonly lockers: LockerRepository) {}
  
  async createLocker(request: CreateLockerRequest): Promise<CreateLockerResponse> {
    return this.db.withinTransaction(async client => {
      const locker = await this.lockers.create(client, request);
      return {
        id: locker.id,
        size: locker.size,
        isOccupied: false
      };
    });
  }

  async listLockers(query: ListLockersQuery): Promise<readonly LockerSummaryResponse[]> {
    return this.db.withinTransaction(async client => {
      const lockers = query.available === true ? await this.lockers.findAvailable(client) : await this.lockers.findAll(client);
      return lockers.map(locker => ({
        id: locker.id,
        size: locker.size,
        isOccupied: locker.isOccupied,
        fragileSupport: locker.fragileSupport
      }));
    });
  }
}
