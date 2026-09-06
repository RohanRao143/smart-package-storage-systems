-- Split pickup flow support: immutable audit records for wallet top-ups.
ALTER TABLE idempotency_records DROP CONSTRAINT IF EXISTS idempotency_records_operation_check;
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_records_operation_check
  CHECK (operation IN ('STORE_PACKAGE', 'RETRIEVE_PACKAGE', 'RECHARGE_WALLET'));

CREATE TABLE wallet_recharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  idempotency_key uuid NOT NULL UNIQUE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  recharged_at timestamptz NOT NULL DEFAULT now()
);
