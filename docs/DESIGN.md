# Design notes

## Services

| Service | Responsibility |
| --- | --- |
| `LockerAllocationService` | Finds and locks the smallest compatible locker. |
| `PackageStorageService` | Creates the package, allocation, and pickup code in one transaction. |
| `StorageChargeService` | Calculates progressive fees from the stored timestamp and tariff snapshot. |
| `PackageRetrievalService` | Validates pickup, debits the wallet, persists the charge, and releases the locker. |

## Database model

`lockers` describes physical capacity and live occupancy. `customers` owns a wallet balance. `packages` is the lifecycle record and retains its locker reference after collection for history. `pickup_codes` is a one-to-one, hashed, invalidatable credential. `storage_charges` is the immutable receipt generated on successful collection. `idempotency_records` makes client retry behavior safe.

`lockers.is_occupied` is deliberately denormalized for quick availability reads. It is never changed independently of the package lifecycle; the transaction that inserts or collects a package updates it.

## Store transaction

```text
begin
  lock one qualifying vacant locker (skip rows already reserved by another request)
  if none: rollback -> LOCKER_UNAVAILABLE
  mark locker occupied
  insert STORED package with tariff snapshot
  generate raw pickup code; store only its hash
  persist idempotency result
commit
```

## Retrieve transaction

```text
begin
  lock active package + locker + customer
  verify locker ID and pickup-code hash
  calculate amount and reject insufficient wallet balance
  debit wallet; insert storage charge
  mark package collected and code consumed
  release locker; persist idempotency result
commit
```

## Fee formula

For `d = max(1, ceil((collectedAt - storedAt) / 24 hours))` and daily rate `r` cents:

```text
fee = min(d, 5) * r
    + min(max(d - 5, 0), 5) * 2r
    + max(d - 10, 0) * 3r
```

The product owner should confirm the default daily rate and whether a package collected immediately should be charged one day or zero. This design uses one started day.
