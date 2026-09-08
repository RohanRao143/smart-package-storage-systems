# Smart Package Locker Management System

## Overview

The Smart Package Locker Management System provides a transactional workflow for storing and retrieving packages through a network of physical lockers.

The system supports:

* Small, Medium, and Large lockers.
* Package storage by a delivery agent.
* Automatic allocation of the smallest compatible vacant locker.
* Dimension, weight, and fragile-item compatibility checks.
* Secure six-digit pickup codes.
* Customer pickup through locker ID and pickup code.
* Progressive storage charges.
* Customer wallet management and recharge.
* Idempotent mutation APIs.
* Transactional consistency using PostgreSQL.
* Concurrency-safe locker allocation and package retrieval.
* React-based delivery-agent and customer-facing workflows.

The implemented architecture is React → Express/TypeScript → application services → PostgreSQL. PostgreSQL is the source of truth for locker state and transactional lifecycle changes.

The first version intentionally excludes physical locker-door control, authentication, and SMS/email delivery. The pickup code is returned to the trusted delivery workflow and can subsequently be delivered through an external notification mechanism.

---

# Requirements implemented

## Locker management

The system supports creation and listing of lockers.

Each locker has:

* Unique UUID.
* Size: `SMALL`, `MEDIUM`, or `LARGE`.
* Width, height, and breadth.
* Maximum supported weight.
* Fragile-item support flag.
* Occupancy state.

Lockers are ranked internally as:

| Locker | Rank |
| ------ | ---: |
| SMALL  |    1 |
| MEDIUM |    2 |
| LARGE  |    3 |

The API supports listing all lockers or only vacant lockers.

## Package storage

A delivery agent can store a package by providing:

* Delivery-agent username.
* Recipient/customer username.
* Package name.
* Width.
* Height.
* Breadth.
* Weight.
* Fragile-item flag.

The system:

1. Validates the request.
2. Validates the delivery agent and recipient.
3. Finds the smallest compatible vacant locker.
4. Locks the selected locker.
5. Marks the locker occupied.
6. Creates the package record.
7. Generates a secure six-digit pickup code.
8. Persists only the pickup-code hash.
9. Updates the recipient's package counters.
10. Persists the idempotency result.
11. Commits the complete operation as one transaction.

The package-storage service explicitly models this as an atomic lifecycle.

## Package retrieval

Retrieval is deliberately split into two operations:

1. **Quote**
2. **Confirm pickup**

The quote operation validates the locker and pickup code and calculates the current charge without modifying package, wallet, pickup-code, or locker state.

The confirmation operation:

1. Locks the relevant records.
2. Re-validates the pickup code.
3. Recalculates the charge.
4. Checks wallet balance.
5. Debits the wallet.
6. Records the storage charge.
7. Marks the package collected.
8. Consumes the pickup code.
9. Updates customer package counters.
10. Releases the locker.
11. Saves the idempotency response.
12. Commits the transaction.

This prevents a stale quote from being treated as the authoritative charge.

## Wallet

Customers have an integer-cent wallet balance.

The wallet supports:

* Recharge.
* Balance validation before package collection.
* Atomic debit during retrieval.
* Immutable recharge records.
* Idempotent recharge requests.

Wallet mutations are protected by database row locking and transactions.

## Validation and errors

Request validation occurs at the HTTP boundary.

Validation includes:

* UUID format.
* Positive integers.
* Boolean values.
* Locker size.
* Username format.
* Six-digit pickup code.
* Required `pickupConfirmed=true`.
* Idempotency-key validation.

Errors use stable machine-readable error codes such as:

* `CUSTOMER_NOT_FOUND`
* `LOCKER_UNAVAILABLE`
* `PACKAGE_EXCEEDS_CAPACITY`
* `INVALID_PICKUP_CODE`
* `PACKAGE_ALREADY_COLLECTED`
* `INSUFFICIENT_WALLET_BALANCE`
* `IDEMPOTENCY_KEY_REQUIRED`
* `IDEMPOTENCY_KEY_REUSED`
* `VALIDATION_ERROR`

The API returns these using a common `{ error: { code, message } }` structure.

---

# Architecture

```text
                    ┌──────────────────────┐
                    │      React UI        │
                    │                      │
                    │ Delivery Agent       │
                    │ Customer Pickup      │
                    └──────────┬───────────┘
                               │ HTTP/JSON
                               ▼
                    ┌──────────────────────┐
                    │ Express API          │
                    │ Controllers          │
                    │ Validation           │
                    │ Error Mapping        │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Application Services │
                    │                      │
                    │ LockerService        │
                    │ AllocationService    │
                    │ StorageService       │
                    │ RetrievalService     │
                    │ ChargeService        │
                    │ WalletService        │
                    │ PickupCodeService    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Repository Layer     │
                    │                      │
                    │ LockerRepository     │
                    │ CustomerRepository   │
                    │ PackageRepository    │
                    │ PickupCodeRepository │
                    │ ChargeRepository     │
                    │ WalletRepository     │
                    │ IdempotencyRepository│
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    PostgreSQL        │
                    │                      │
                    │ Transactional source │
                    │ of truth             │
                    └──────────────────────┘
```

The application is deliberately separated into:

* **HTTP layer** — request parsing, validation and response mapping.
* **Contracts** — API DTOs, domain types and service/repository interfaces.
* **Services** — business rules and lifecycle orchestration.
* **Repositories** — PostgreSQL persistence.
* **Database adapter** — transaction lifecycle.
* **Frontend API layer** — HTTP communication with the backend.

The backend composition root wires PostgreSQL repositories into the corresponding services and exposes them through Express controllers.

This separation allows business services to depend on interfaces rather than directly depending on HTTP or PostgreSQL implementation details.

---

# Domain Model

The principal domain entities are:

## Customer

A customer contains:

* `id`
* `username`
* `name`
* `email`
* `phoneNumber`
* `walletBalanceCents`
* `currentPackages`
* `totalPackages`
* `lastCheckedInAt`

The customer owns the wallet and package history.

## Locker

A locker contains:

* `id`
* `size`
* `sizeRank`
* dimensions
* maximum weight
* fragile support
* occupancy state
* creation timestamp

The occupancy flag is deliberately denormalized for efficient availability queries.

## Package

A package contains:

* `id`
* `lockerId`
* `customerId`
* `storedBy`
* `receivedBy`
* lifecycle status
* storage/collection timestamps
* dimensions
* weight
* fragile flag
* package name
* base daily rate snapshot

The package remains associated with its locker after collection so that historical relationships are retained.

## PickupCode

A pickup code contains:

* package reference
* customer reference
* locker reference
* hash
* consumed timestamp
* creation timestamp

The raw six-digit code is never persisted.

## StorageCharge

A storage charge records:

* package
* pickup code
* charged amount
* held duration
* payment status
* charge timestamp

It functions as the immutable receipt of a successful collection.

## IdempotencyRecord

The idempotency record contains:

* operation
* idempotency key
* request hash
* response status
* response body
* creation timestamp

The domain types and lifecycle relationships are defined in the backend contracts.

---

# Locker Allocation Strategy

Locker allocation follows a **smallest-compatible-locker** strategy.

A locker is compatible only when:

1. It is vacant.
2. Its maximum weight is greater than or equal to the package weight.
3. If the package is fragile, the locker supports fragile packages.
4. Its three dimensions can contain the package dimensions.

## Rotation support

Physical package orientation is not fixed.

Instead of comparing:

```text
package.width <= locker.width
package.height <= locker.height
package.breadth <= locker.breadth
```

the system sorts both sets of dimensions and compares them positionally.

For example:

```text
Locker:  10 × 15 × 20
Package: 20 × 10 × 15
```

becomes:

```text
Locker:  10 × 15 × 20
Package: 10 × 15 × 20
```

and therefore fits.

The same fit specification is implemented both in the testable `isLockerCompatible()` function and in the PostgreSQL allocation predicate.

## Ranking

Compatible lockers are ordered by:

```text
size_rank ASC, id ASC
```

Therefore:

1. Small is preferred over Medium.
2. Medium is preferred over Large.
3. Locker UUID provides deterministic tie-breaking between lockers of the same size.

## Capacity distinction

The implementation distinguishes:

* **No compatible vacant locker currently available** → `LOCKER_UNAVAILABLE`
* **No locker can physically accommodate the package** → `PACKAGE_EXCEEDS_CAPACITY`

This allows the client to distinguish temporary inventory exhaustion from a package that can never fit the current locker inventory.

---

# Package Retrieval

Retrieval intentionally follows a two-stage workflow.

## Stage 1 — Quote

The customer submits:

* Locker ID.
* Pickup code.
* Receiver username.

The system:

1. Finds the active package.
2. Finds the receiving customer.
3. Loads the pickup code.
4. Verifies the supplied code against the stored hash.
5. Calculates the current storage fee.
6. Returns the charge and wallet balance.

The quote does not:

* Debit the wallet.
* Mark the package collected.
* Consume the pickup code.
* Release the locker.

This is explicitly defined by the retrieval service contract.

## Stage 2 — Confirm

The customer confirms pickup using:

```text
pickupConfirmed = true
```

The backend does not trust the earlier quote as a payment authorization.

Instead, it revalidates:

* Package state.
* Locker.
* Pickup code.
* Receiver.
* Current storage duration.
* Current charge.
* Wallet balance.

Only then is the transaction committed.

## Insufficient balance

If the wallet cannot cover the charge:

```text
INSUFFICIENT_WALLET_BALANCE
```

is returned.

The package remains stored, the locker remains occupied, and the pickup code remains valid.

This behavior is covered by integration tests.

---

# Storage Pricing

Storage uses progressive pricing based on **started 24-hour periods**.

Let:

```text
d = max(1, ceil(heldTime / 24 hours))
r = base daily rate in cents
```

The charge is:

```text
fee =
    min(d, 5) × r
  + min(max(d - 5, 0), 5) × 2r
  + max(d - 10, 0) × 3r
```

Therefore:

| Storage period |          Rate |
| -------------- | ------------: |
| Days 1–5       | 1× daily rate |
| Days 6–10      | 2× daily rate |
| Day 11 onward  | 3× daily rate |

For a base rate of 100 cents:

| Started days | Charge |
| -----------: | -----: |
|            1 |    100 |
|            5 |    500 |
|            6 |    700 |
|           10 |  1,500 |
|           11 |  1,800 |
|           20 |  4,500 |

The implementation explicitly charges one started day even when pickup occurs immediately after storage. This decision is documented in the design notes and covered by unit tests.

## Tariff snapshot

The base daily rate is stored on the package when it is checked in.

Consequently, changing the configured daily rate does not retroactively change charges for already-stored packages.

This provides deterministic historical billing.

---

# Concurrency

Concurrency is treated as a core domain concern rather than an application-level assumption.

## Concurrent storage

Locker allocation uses:

```sql
FOR UPDATE SKIP LOCKED
```

The query:

1. Filters to vacant compatible lockers.
2. Orders by locker size rank and ID.
3. Locks the selected row.
4. Skips rows currently locked by another transaction.

The selected locker remains locked while the package is created and the locker is marked occupied.

This prevents two concurrent storage requests from receiving the same locker.

A database-level partial unique index provides an additional invariant:

```sql
CREATE UNIQUE INDEX one_active_package_per_locker
ON packages(locker_id)
WHERE status = 'STORED';
```

Thus the application and database both protect the one-active-package-per-locker rule.

## Concurrent retrieval

Retrieval locks the active package, locker and relevant customer records before modifying them.

The sequence is transactional:

```text
lock package
    ↓
lock locker
    ↓
lock customer
    ↓
verify pickup code
    ↓
calculate charge
    ↓
validate wallet
    ↓
debit wallet
    ↓
record charge
    ↓
mark package collected
    ↓
consume pickup code
    ↓
release locker
    ↓
commit
```

A concurrent retrieval test executes five retrieval attempts against the same package and expects exactly one successful collection and four failures. It also verifies that exactly one charge is recorded and that the locker is released only after the successful collection.

## Concurrent wallet operations

Wallet updates use row-level database locking through:

```sql
UPDATE customers
SET wallet_balance_cents =
    wallet_balance_cents + amount
```

together with transactional customer locking.

The concurrency test performs 20 simultaneous wallet recharges and verifies that the final balance contains every successful update without lost writes.

## Idempotency

Mutation endpoints use an `Idempotency-Key`.

The system:

1. Acquires a PostgreSQL advisory transaction lock derived from operation + key.
2. Checks whether a previous result exists.
3. Replays the previous response when the request hash matches.
4. Rejects reuse when the request hash differs.
5. Stores the response before transaction commit.

This prevents duplicate package creation, duplicate retrieval processing and duplicate wallet recharge when clients retry requests.

---

# API Endpoints

The implemented API exposes the following routes:

| Method | Endpoint                            | Purpose                             |
| ------ | ----------------------------------- | ----------------------------------- |
| GET    | `/health`                           | Health check                        |
| GET    | `/api/v1/lockers`                   | List lockers                        |
| POST   | `/api/v1/lockers`                   | Create locker                       |
| POST   | `/api/v1/packages/store`            | Store package                       |
| POST   | `/api/v1/packages/retrieve/quote`   | Validate pickup and calculate quote |
| POST   | `/api/v1/packages/retrieve/confirm` | Charge wallet and complete pickup   |
| POST   | `/api/v1/wallet/recharge`           | Recharge customer wallet            |

The Express application registers these routes and exposes Swagger/OpenAPI documentation through `/api-docs` and `/openapi.json`.

## Mutation endpoints

The following require an `Idempotency-Key` UUID:

* Package storage.
* Package retrieval confirmation.
* Wallet recharge.

## API documentation

The backend exposes an OpenAPI 3.0.3 document describing:

* Requests.
* Responses.
* Error responses.
* Schemas.
* Idempotency requirements.
* Locker sizes.
* Package and retrieval contracts.

The OpenAPI document explicitly describes the transactional nature of storage and retrieval.

---

# Running Locally

## Backend

Prerequisites:

* Node.js.
* PostgreSQL 15+.
* Database connection string.

Configure environment variables including:

```text
DATABASE_URL=<postgres connection string>
PORT=3000
DEFAULT_DAILY_RATE_CENTS=<non-negative integer>
```

The backend validates that `DATABASE_URL` exists and that the configured daily rate is a non-negative safe integer.

Apply the database schema:

```bash
psql "$DATABASE_URL" -f db/001_schema.sql
```

For development data:

```bash
psql "$DATABASE_URL" -f db/002_dev_seed.sql
```

Then:

```bash
npm install
npm run dev
```

The development seed creates example lockers and customers and is intended for local development only.

## Frontend

Configure:

```text
VITE_API_BASE_URL=<backend URL>
```

Then:

```bash
npm install
npm run dev
```

The frontend provides two workflows:

* **Agent For Delivery**
* **Customer For Pickup**

The UI calls the backend APIs and presents allocation, pickup-code, quote, payment and locker-release results.

---

# Running Tests

The project contains multiple levels of tests.

## Backend unit tests

Unit tests cover:

* Locker compatibility.
* Rotated dimensions.
* Weight constraints.
* Fragile routing.
* Pickup-code generation and verification.
* Request validation.
* Storage pricing.
* Error handling.
* Transaction commit/rollback.
* Storage service behavior.
* Retrieval service behavior.
* Wallet service behavior.

## Backend integration tests

Integration tests cover:

* Locker creation.
* Locker listing.
* Package storage.
* Package retrieval.
* Wallet recharge.
* Idempotency.
* HTTP API behavior.

## Backend concurrency tests

Dedicated concurrency suites cover:

* Concurrent package storage.
* Concurrent package retrieval.
* Concurrent wallet updates.

The test suite explicitly verifies that ten simultaneous storage operations receive unique lockers and that contention behaves correctly when fewer lockers exist than requests.

## Frontend tests

Frontend tests cover:

* Application rendering.
* Delivery-agent workflow.
* Customer pickup workflow.
* Required fields.
* Dimensions and weight.
* Fragile-package selection.
* API calls.
* Idempotency headers.
* Currency formatting.

The supplied test inventory covers the principal functional and concurrency requirements.

---

# Design Decisions

## 1. PostgreSQL as the consistency boundary

Locker occupancy, package lifecycle, wallet balance, pickup-code consumption and charges are transactional business state.

Therefore PostgreSQL is used as the authoritative consistency boundary rather than attempting to coordinate state exclusively in Node.js.

## 2. Repository → Service → Controller separation

Repositories own persistence.

Services own business rules and orchestration.

Controllers own HTTP concerns.

This prevents database-specific operations from leaking into the API layer and makes business services independently testable.

The repository and service interfaces are explicitly separated in the lifecycle contracts.

## 3. Interface-driven dependencies

Services depend on repository and domain interfaces rather than concrete PostgreSQL classes.

This provides:

* Easier unit testing.
* Clear contracts.
* Reduced coupling.
* Ability to replace persistence implementations.

## 4. Secure pickup codes

Pickup codes are generated using cryptographically secure randomness.

The code is:

```text
6 numeric digits
```

The persisted representation is:

```text
salt:scrypt-derived-hash
```

Verification uses `timingSafeEqual`.

The raw code is returned only at storage time and is not persisted.

## 5. Integer money

All monetary values use integer cents rather than JavaScript floating-point currency values.

This avoids common floating-point precision problems.

## 6. Tariff snapshot

The package stores its base daily rate at check-in.

This makes historical pricing deterministic even if the configured tariff changes later.

## 7. Database invariants as a second line of defence

Business logic protects invariants at the service layer, while PostgreSQL constraints provide additional protection.

Examples include:

* Non-negative wallet balances.
* Positive dimensions and weights.
* Valid package states.
* One active package per locker.
* Unique pickup code relationship.
* Unique storage charge relationship.

---

# Assumptions

The implementation currently assumes:

1. A locker can contain exactly one active package.
2. A package can be rotated in three-dimensional space.
3. A fragile package requires fragile-supporting locker capacity.
4. A storage day is a started 24-hour period.
5. Immediate pickup incurs one day's charge.
6. The base daily rate is configured through `DEFAULT_DAILY_RATE_CENTS`.
7. Currency values are represented as integer cents.
8. Pickup codes contain six numeric digits.
9. Pickup codes are single-use.
10. Customer usernames are unique.
11. Authentication is outside the current scope.
12. Physical locker hardware integration is outside the current scope.
13. Notification delivery is outside the current scope.
14. PostgreSQL is the authoritative state store.
15. A successful pickup requires sufficient wallet balance.
16. A quote is informational and does not reserve a price.

The pricing design itself notes that the product owner should ultimately confirm the default rate and immediate-pickup charging policy; the current implementation chooses one started day.

---

# Trade-offs

## PostgreSQL locking vs application locking

**Chosen:** PostgreSQL row locking.

**Benefit:** Correctness is maintained even when multiple application instances execute concurrently.

**Trade-off:** Database transactions hold locks for the duration of the operation and can reduce throughput under heavy contention.

## `SKIP LOCKED`

**Chosen:** `FOR UPDATE SKIP LOCKED`.

**Benefit:** Competing storage requests do not wait unnecessarily on lockers already being processed.

**Trade-off:** A request may see no immediately available compatible locker while another transaction is holding a suitable locker.

## Denormalized `is_occupied`

The package lifecycle could theoretically be used to derive locker occupancy.

Instead, `lockers.is_occupied` is maintained explicitly.

**Benefit:** Fast availability queries.

**Trade-off:** The application must guarantee that occupancy is updated consistently with package lifecycle changes.

The design deliberately keeps this state inside the same transaction to mitigate that risk.

## Split quote/confirm retrieval

**Benefit:**

* Customer sees the charge before paying.
* UI can prevent confirmation when balance is insufficient.
* Payment remains an explicit user-confirmed action.

**Trade-off:** The quote can become stale between the quote and confirmation requests.

The system addresses this by recalculating the charge during confirmation rather than trusting the quote.

## Wallet instead of external payment gateway

**Benefit:** Simple deterministic transactional behavior suitable for the coding challenge.

**Trade-off:** A production system would likely need integration with an external payment provider, refunds, payment reconciliation, payment authorization and settlement handling.

## Simple authentication model

The current implementation uses usernames to identify actors.

**Benefit:** Keeps the challenge focused on locker allocation and transactional lifecycle logic.

**Trade-off:** It is not a production authentication/authorization model.

---

# Future Improvements

## Authentication and authorization

Introduce:

* Customer authentication.
* Delivery-agent authentication.
* Role-based authorization.
* Session/JWT management.
* Authorization checks around locker administration.

## Customer lookup contract

The frontend currently asks for usernames, while the supplied OpenAPI store schema describes `customerId`.

The production solution should establish one canonical identity contract, preferably:

```text
authenticated actor identity
        ↓
customer/service identity
        ↓
internal UUID
```

## API contract alignment

There is currently a contract drift between the supplied OpenAPI definition and the implemented backend.

The OpenAPI store schema uses `customerId`, while the actual TypeScript API contract and implementation use:

```text
storedByUsername
recipientUsername
```

Likewise, the implemented retrieval request contains `receivedByUsername`, while the OpenAPI request shown in the supplied document does not.

This should be resolved before treating the OpenAPI document as the single source of truth.

## Payment gateway

Replace or augment the internal wallet with a real payment provider.

Potential additions:

* Payment authorization.
* Payment capture.
* Refunds.
* Payment transaction IDs.
* Reconciliation.
* Webhook handling.

## Locker hardware

Integrate:

* Door control.
* Door-open/close confirmation.
* Hardware health.
* Occupancy sensors.
* Tamper detection.
* Offline locker state.

## Notifications

Integrate:

* SMS.
* Email.
* Push notifications.

Pickup-code delivery should remain outside the core transactional storage operation.

## Observability

Add:

* Structured logging.
* Correlation IDs.
* Metrics.
* Distributed tracing.
* Transaction latency monitoring.
* Locker utilization metrics.
* Failed pickup metrics.

Raw pickup codes should never appear in logs.

## Configuration and migrations

The database setup should evolve from direct SQL execution toward a formal migration framework with:

* Versioned migrations.
* Rollback strategy.
* CI migration verification.
* Environment-specific configuration.

## Pricing configuration

Move pricing rules into a configurable tariff model rather than relying solely on an environment variable.

This would allow:

* Different locker classes.
* Promotional pricing.
* Maximum charges.
* Grace periods.
* Customer-specific pricing.
* Effective-from timestamps.

## Scalability

For a larger deployment:

* Add connection-pool tuning.
* Add database indexes based on production query patterns.
* Add horizontal API scaling.
* Introduce asynchronous notification processing.
* Add rate limiting.
* Add caching only where consistency requirements permit it.

---

# AI Usage Disclosure

AI was used as an engineering assistance tool throughout the development process.

The development workflow was:

1. Requirements were analyzed and clarified with AI assistance.
2. Entity modelling was explored with AI and subsequently reviewed and finalized.
3. Multiple architectural alternatives were considered with AI.
4. The final architecture was selected as:

   * React
   * Node.js
   * Express
   * TypeScript
   * PostgreSQL
5. Frontend functional requirements were prepared and used to assist AI in generating the initial Vite/React application.
6. The generated frontend was manually reviewed, validated, adjusted and finalized.
7. Backend functional requirements were prepared and used to assist AI in generating the Express/PostgreSQL backend.
8. The repository → service → controller architecture was intentionally recommended and reviewed.
9. AI was used to generate test cases for both frontend and backend.
10. Generated tests were manually reviewed, adjusted and finalized.
11. The final implementation was reviewed against functional requirements, transactional behavior, concurrency requirements and API contracts.

AI therefore contributed to:

* Architecture exploration.
* Domain modelling assistance.
* Initial code generation.
* Test generation.
* Documentation assistance.

The final implementation decisions, validation, adjustments and acceptance of generated code remained part of the engineering process rather than treating AI-generated output as automatically correct.

## AI-assisted engineering principle

The development approach was:

```text
Requirements
     ↓
AI-assisted exploration
     ↓
Architecture / domain decisions
     ↓
AI-assisted implementation
     ↓
Manual validation
     ↓
Corrections / adjustments
     ↓
Tests
     ↓
Manual validation of tests
     ↓
Final implementation
```

AI was therefore used as a development accelerator and reasoning aid, while the resulting architecture and code were reviewed and finalized as engineering deliverables.

---

# Implementation Status

The implemented system provides the core end-to-end lifecycle:

```text
Create / configure lockers
        ↓
Delivery agent submits package
        ↓
Validate package
        ↓
Find smallest compatible locker
        ↓
Lock + occupy locker
        ↓
Create package
        ↓
Generate + hash pickup code
        ↓
Return locker + pickup code
        ↓
Customer requests quote
        ↓
Validate pickup code
        ↓
Calculate current charge
        ↓
Customer confirms pickup
        ↓
Revalidate code + charge
        ↓
Debit wallet
        ↓
Record charge
        ↓
Mark package collected
        ↓
Consume pickup code
        ↓
Release locker
        ↓
Return collection result
```

The implementation therefore focuses on the principal engineering challenge of the system: **maintaining correct package, locker and wallet state under retries and concurrent operations while keeping the business rules isolated from the HTTP and persistence layers.**
