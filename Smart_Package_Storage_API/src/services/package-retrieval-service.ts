import type { Cents } from '../contracts/domain.js';
import type { PickupQuoteResponse, RetrievePackageRequest, RetrievePackageResponse } from '../contracts/api.js';
import type { CustomerRepository, IdempotencyRepository, LockerRepository, PackageRepository, PackageRetrievalService, PickupCodeRepository, PickupCodeService, RequestContext, StorageChargeRepository, StorageChargeService, TransactionManager } from '../contracts/lifecycle.js';
import { errors } from '../errors.js';

export class DefaultPackageRetrievalService implements PackageRetrievalService {

  constructor(
    private readonly db: TransactionManager, private readonly lockers: LockerRepository,
    private readonly customers: CustomerRepository, private readonly packages: PackageRepository,
    private readonly pickupCodes: PickupCodeRepository, private readonly codeService: PickupCodeService,
    private readonly charges: StorageChargeRepository, private readonly pricing: StorageChargeService,
    private readonly idempotency: IdempotencyRepository,
  ) {}

  async quotePickup(request: RetrievePackageRequest, requestedAt: string): Promise<PickupQuoteResponse> {
    return this.db.withinTransaction(async client => {
      // These short-lived locks provide a consistent validation/quote snapshot; this endpoint changes no state.
      const active = await this.packages.findStoredByLockerForUpdate(client, request.lockerId);
      if (!active) {
        const latest = await this.packages.findLatestByLockerForUpdate(client, request.lockerId);
        if (latest?.status === 'COLLECTED') throw errors.alreadyCollected();
        throw errors.invalidCode();
      }
      const customer = await this.customers.findByIdForUpdate(client, active.customerId);
      const pickupCode = await this.pickupCodes.findByPackageForUpdate(client, active.id);
      if (!customer || !pickupCode || pickupCode.consumedAt || !(await this.codeService.verify(request.pickupCode, pickupCode.pickupCodeHash))) throw errors.invalidCode();
      const quote = this.pricing.calculateCharge({ storedAt: active.storedAt, collectedAt: requestedAt, baseDailyRateCents: active.baseDailyRateCents });
      return { packageId: active.id, lockerId: active.lockerId, heldTimeMs: quote.heldTimeMs, calculatedChargesCents: quote.chargedAmountCents, walletBalanceCents: customer.walletBalanceCents, pickupConfirmed: true };
    });
  }

  async retrievePackage(request: RetrievePackageRequest, context: RequestContext): Promise<RetrievePackageResponse> {
    return this.db.withinTransaction(async client => {
      await this.idempotency.lock(client, context, 'RETRIEVE_PACKAGE');
      
      
      // Throw an error when someone tries to retrieve a package before the same package retrieval is initialized somewhere else
      const prior = await this.idempotency.find<RetrievePackageResponse>(client, context, 'RETRIEVE_PACKAGE');
      if (prior) {
        if (prior.requestHash !== context.requestHash)
          throw errors.idempotencyReused();
        return prior.response;
      }

      // When user tries to retrieve a packge with same pickupcode multiple times or with invalid locker.
      const active = await this.packages.findStoredByLockerForUpdate(client, request.lockerId);
      if (!active) {
        const latest = await this.packages.findLatestByLockerForUpdate(client, request.lockerId);
        if (latest?.status === 'COLLECTED') throw errors.alreadyCollected();
        throw errors.invalidCode();
      }

      // When locker or customer reference to a package is missing
      const locker = await this.lockers.findByIdForUpdate(client, active.lockerId);
      const customer = await this.customers.findByIdForUpdate(client, active.customerId);
      if (!locker || !customer)
        throw new Error('Package references missing locker or customer.');

      //  For Invalid pickup code
      const pickupCode = await this.pickupCodes.findByPackageForUpdate(client, active.id);
      if (!pickupCode || pickupCode.consumedAt || !(await this.codeService.verify(request.pickupCode, pickupCode.pickupCodeHash)))
        throw errors.invalidCode();
      
      // Rejects when there is insufficient balance
      const quote = this.pricing.calculateCharge({ storedAt: active.storedAt, collectedAt: context.requestedAt, baseDailyRateCents: active.baseDailyRateCents });
      if (customer.walletBalanceCents < quote.chargedAmountCents)
        throw errors.insufficientBalance();

      // Deduct charges from wallet or later can be redirected to Payment Gateway
      const wallet = await this.customers.debitWallet(client, customer.id, quote.chargedAmountCents);
      await this.charges.create(client, {
        packageId: active.id,
        pickupCodeId: pickupCode.id,
        chargedAmountCents: quote.chargedAmountCents,
        packageHeldTimeMs: quote.heldTimeMs,
        status: 'PAID'
      });

      // Release Package
      await this.packages.markCollected(client, active.id, context.requestedAt);
      await this.pickupCodes.consume(client, pickupCode.id, context.requestedAt);
      await this.customers.recordCollection(client, customer.id);
      await this.lockers.release(client, locker.id);

      const response: RetrievePackageResponse = {
        packageId: active.id,
        collectedAt: context.requestedAt,
        heldTimeMs: quote.heldTimeMs,
        chargedAmountCents: quote.chargedAmountCents as Cents,
        walletBalanceCents: wallet.walletBalanceCents,
        lockerReleased: true
      };

      await this.idempotency.save(client, context, 'RETRIEVE_PACKAGE', 200, response);
      return response;
    });
  }
}
