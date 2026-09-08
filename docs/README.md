# Smart Package Storage System

A design blueprint for a smart locker system where delivery agents store packages and customers retrieve them with a locker ID and pickup code.

## Scope

The system supports Small, Medium, and Large lockers; assigns the smallest compatible vacant locker; records the storage lifecycle; calculates progressive storage fees; and prevents concurrent allocation of the same locker.

Out of scope for the first version: physical door control, authentication, and sending SMS/email. The API returns a pickup code to the trusted delivery workflow; an external notification service can deliver it.

## Architecture

```text
React client
  -> Express API (TypeScript)
       -> application services
          - LockerAllocationService
          - PackageStorageService
          - PackageRetrievalService
          - StorageChargeService
       -> PostgreSQL
```

The API layer validates request shape and authorization. Services own business rules. PostgreSQL is the source of truth for locker state and transactionally protects allocation and collection.

## Core workflow

1. A delivery agent submits package dimensions, weight, fragile flag, and customer.
2. The system chooses the lowest-ranked available locker that fits the package and supports fragile goods when necessary.
3. It atomically reserves the locker, creates the package, generates a pickup code, and returns the locker ID and code.
4. A customer submits the locker ID and pickup code.
5. The system verifies the code, calculates and collects the fee, marks the package collected, and releases the locker in one transaction.

## Allocation and charging rules

- A package fits only when every dimension and its weight are within the locker limits. Rotation is allowed by sorting package and locker dimensions before comparison.
- Eligible lockers are ranked `SMALL`, `MEDIUM`, then `LARGE`; the lowest locker ID breaks a tie.
- A fragile package requires a locker with `fragile_support = true`.
- A locker holds one active package only.
- A storage day is each started 24-hour period after `stored_at` (`ceil(duration / 24h)`).
- Fee is progressive: days 1-5 cost `base_daily_rate`; days 6-10 cost `2x`; every later day costs `3x`.

The daily rate is stored on the package when it is checked in, so future tariff changes do not alter an existing package's charge.

## Concurrency guarantee

The store operation uses a PostgreSQL transaction and selects its candidate locker with `FOR UPDATE SKIP LOCKED`. The selected row remains locked while the package and pickup code are created and the locker is marked occupied. A partial unique index additionally ensures only one `STORED` package can reference a locker.

Collection similarly locks the package, locker, and customer rows before charging the wallet and releasing the locker. All related writes either commit together or roll back together.

## Repository guide

- [Architecture notes](docs/DESIGN.md)
- [API contract](docs/API.md)
- [PostgreSQL schema](db/001_schema.sql)
- [Development seed data](db/002_dev_seed.sql)
- [Agent instructions](AGENTS.md)

## Getting started with the database

Create a PostgreSQL database, then run the SQL files in lexical order:

```bash
psql "$DATABASE_URL" -f db/001_schema.sql
psql "$DATABASE_URL" -f db/002_dev_seed.sql
```

The seed script is strictly for local development and is safe to omit in real environments.

## Acceptance checklist

- A Small-compatible package receives a Small locker whenever one is vacant.
- A package is rejected when no compatible locker exists.
- Pickup requires both the correct locker ID and pickup code.
- Insufficient wallet balance leaves package and locker unchanged.
- Retrieval records the charged duration and amount, and frees the locker.
- Concurrent storage requests never receive the same locker.
