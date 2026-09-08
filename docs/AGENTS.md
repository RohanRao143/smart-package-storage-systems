# Engineering guidance

## Domain invariants

- A `STORED` package has exactly one locker; a locker has at most one `STORED` package.
- Only a successful collection changes a package to `COLLECTED` and frees its locker.
- Pickup codes are generated with cryptographically secure randomness, stored as hashes, and are single-use.
- Money is represented as integer cents. Never use JavaScript floating point for fees or wallet balances.
- Store and retrieve flows must execute in a single database transaction.

## Allocation

Use `FOR UPDATE SKIP LOCKED` when selecting lockers. Filter for vacancy, fragile support, dimensions, and weight before ordering by `size_rank, id`. Do not perform a read-then-update allocation outside a transaction.

Dimension comparison must allow rotation: sort the package's three dimensions and the locker’s three dimensions, then compare matching positions. Do not infer fit from the enum size alone.

## Retrieval and charging

Lock the active package, its locker, and its customer row before calculating or debiting a charge. Reject an insufficient balance without invalidating the pickup code or releasing the locker.

Charge progressive started 24-hour periods: first five at 1x, next five at 2x, and later periods at 3x. Snapshot the base daily rate on check-in.

## API practices

- Validate payloads at the route boundary and return stable machine-readable error codes.
- Require an `Idempotency-Key` for store and retrieve mutations; replay the original result for a duplicate key.
- Do not return `pickup_code_hash` in an API response or log a raw pickup code.
- Return `409` for locker exhaustion and state conflicts, `403` for an invalid code, and `422` for insufficient balance.

## Tests required for changes

Cover exact fit, rotated fit, fragile routing, smallest-locker preference, no capacity, invalid pickup code, insufficient wallet balance, charge tier boundaries, duplicate idempotency requests, and parallel storage attempts.
