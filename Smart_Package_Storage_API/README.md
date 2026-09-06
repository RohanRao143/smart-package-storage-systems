# Smart Package Storage API

Express + TypeScript + PostgreSQL API implementing locker allocation, package storage, secure pickup, progressive charges, and locker release.

## Layout

- `src/contracts/domain.ts` — database-aligned lifecycle entities and safe value types.
- `src/contracts/api.ts` — request/response DTOs and stable error codes.
- `src/contracts/lifecycle.ts` — service, repository, transaction, pricing, and code-generation interfaces.
- `src/db/` — PostgreSQL transaction adapter, query implementations, and row mappers.
- `src/services/` — lifecycle orchestration, secure code hashing, allocation, and pricing.
- `src/http/` — validated Express controllers and API error mapping.

## Intended lifecycle

`LockerService.createLocker` → `PackageStorageService.storePackage` → `LockerAllocationService.findAndLockSuitableLocker` → `PickupCodeService.generate` → `PackageRetrievalService.retrievePackage` → `StorageChargeService.calculateCharge` → release locker.

All money contracts use integer cents. Store and retrieve require an `Idempotency-Key` UUID and execute their lifecycle steps in one database transaction. A raw pickup code is returned once and only its scrypt hash is persisted.

## Routes

- `POST /api/v1/lockers`
- `GET /api/v1/lockers?available=true`
- `POST /api/v1/packages/store` (requires `Idempotency-Key`)
- `POST /api/v1/packages/retrieve` (requires `Idempotency-Key`)

Interactive Swagger UI is available at `/api-docs`; the raw OpenAPI document is at `/openapi.json`.

Configure `.env` from `.env.example`, apply the SQL migrations from the repository root, then run `npm install` and `npm run dev`.
