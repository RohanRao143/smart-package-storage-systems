import type { Cents } from '../contracts/domain.js';
import type { PackageStorageService, LockerAllocationService, LockerCandidate, LockerRepository, CustomerRepository, PackageRepository, PickupCodeRepository, PickupCodeService, IdempotencyRepository, RequestContext, TransactionManager } from '../contracts/lifecycle.js';
import type { StorePackageRequest, StorePackageResponse } from '../contracts/api.js';
import { errors } from '../errors.js';

export class DefaultPackageStorageService implements PackageStorageService {
  constructor(
    private readonly db: TransactionManager,
    private readonly allocation: LockerAllocationService,
    private readonly lockers: LockerRepository,
    private readonly customers: CustomerRepository,
    private readonly packages: PackageRepository,
    private readonly pickupCodes: PickupCodeRepository,
    private readonly codeService: PickupCodeService,
    private readonly idempotency: IdempotencyRepository,
    private readonly baseDailyRateCents: Cents,
  ) {}

  async storePackage(request: StorePackageRequest, context: RequestContext): Promise<StorePackageResponse> {
    return this.db.withinTransaction(async client => {
      await this.idempotency.lock(client, context, 'STORE_PACKAGE');
      const prior = await this.idempotency.find<StorePackageResponse>(client, context, 'STORE_PACKAGE');
      if (prior) {
        if (prior.requestHash !== context.requestHash)
          throw errors.idempotencyReused();
        return prior.response;
      }

      const storedBy = await this.customers.findByUsernameForUpdate(client, request.storedByUsername);
      const recipient = await this.customers.findByUsernameForUpdate(client, request.recipientUsername);
      if (!storedBy || !recipient)
        throw errors.customerNotFound();
      
      const locker = await this.allocation.findAndLockSuitableLocker(client, request as unknown as LockerCandidate);
      if (!locker) {
        const hasCapacity = await this.lockers.hasCompatibleCapacity(client, request as unknown as LockerCandidate);
        throw hasCapacity ? errors.lockerUnavailable() : errors.exceedsCapacity();
      }
      await this.lockers.markOccupied(client, locker.id);

      const { rawCode, hash } = await this.codeService.generate();
      await this.packages.create(client, {
        lockerId: locker.id,
        customerId: recipient.id,
        storedBy: storedBy.id,
        storedAt: context.requestedAt,
        widthCm: request.widthCm as never,
        heightCm: request.heightCm as never,
        breadthCm: request.breadthCm as never,
        weightGrams: request.weightGrams as never,
        hasFragileItems: request.hasFragileItems,
        baseDailyRateCents: this.baseDailyRateCents,
      });

      const stored = await this.packages.findStoredByLockerForUpdate(client, locker.id);
      if (!stored)
        throw new Error('Package creation did not produce an active package.');
      await this.pickupCodes.create(client, {
        packageId: stored.id,
        customerId: recipient.id,
        lockerId: locker.id,
        pickupCodeHash: hash
      });

      await this.customers.recordCheckIn(client, recipient.id, context.requestedAt);

      const response: StorePackageResponse = {
        packageId: stored.id,
        lockerId: locker.id,
        lockerSize: locker.size,
        pickupCode: rawCode,
        storedAt: stored.storedAt
      };

      await this.idempotency.save(client, context, 'STORE_PACKAGE', 201, response);
      return response;
    });
  }
}
