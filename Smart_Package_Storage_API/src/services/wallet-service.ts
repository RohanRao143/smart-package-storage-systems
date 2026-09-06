import type { RechargeWalletRequest, RechargeWalletResponse } from '../contracts/api.js';
import type { CustomerRepository, IdempotencyRepository, RequestContext, TransactionManager, WalletRechargeRepository, WalletService } from '../contracts/lifecycle.js';
import { errors } from '../errors.js';

export class DefaultWalletService implements WalletService {
  constructor(private readonly db: TransactionManager, private readonly customers: CustomerRepository, private readonly recharges: WalletRechargeRepository, private readonly idempotency: IdempotencyRepository) {}

  async recharge(request: RechargeWalletRequest, context: RequestContext): Promise<RechargeWalletResponse> {
    return this.db.withinTransaction(async client => {
      await this.idempotency.lock(client, context, 'RECHARGE_WALLET');
      const prior = await this.idempotency.find<RechargeWalletResponse>(client, context, 'RECHARGE_WALLET');
      if (prior) {
        if (prior.requestHash !== context.requestHash) throw errors.idempotencyReused();
        return prior.response;
      }
      const customer = await this.customers.findByIdForUpdate(client, request.customerId);
      if (!customer) throw errors.customerNotFound();
      const wallet = await this.customers.creditWallet(client, customer.id, request.amountCents);
      await this.recharges.create(client, { customerId: customer.id, idempotencyKey: context.idempotencyKey, amountCents: request.amountCents });
      const response: RechargeWalletResponse = { customerId: customer.id, rechargedAmountCents: request.amountCents, walletBalanceCents: wallet.walletBalanceCents };
      await this.idempotency.save(client, context, 'RECHARGE_WALLET', 200, response);
      return response;
    });
  }
}
