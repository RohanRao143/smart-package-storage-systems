smart-package-storage/
│
├── backend/
│   ├── src/
│   │   ├── contracts/
│   │   ├── db/
│   │   ├── services/
│   │   ├── http/
│   │   └── ...
│   │
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── locker-fit.test.ts
│   │   │   ├── storage-charge.test.ts
│   │   │   ├── pickup-code.test.ts
│   │   │   ├── request-validation.test.ts
│   │   │   └── error-handler.test.ts
│   │   │
│   │   ├── integration/
│   │   │   ├── package-storage.test.ts
│   │   │   ├── package-retrieval.test.ts
│   │   │   ├── wallet.test.ts
│   │   │   ├── idempotency.test.ts
│   │   │   └── api.test.ts
│   │   │
│   │   └── concurrency/
│   │       ├── concurrent-storage.test.ts
│   │       ├── concurrent-retrieval.test.ts
│   │       └── concurrent-wallet.test.ts
│   │
│   ├── tests/
│   │   └── setup.ts
│   │
│   ├── vitest.config.ts
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   └── ...
    │
    ├── tests/
    │   ├── App.test.jsx
    │   ├── components/
    │   │   ├── DeliveryAgentForm.test.jsx
    │   │   └── CustomerPickup.test.jsx
    │   ├── services/
    │   │   └── api.test.js
    │   └── utils/
    │       └── money.test.js
    │
    ├── vitest.config.js
    └── package.json


| Requirement                  | Test |
| ---------------------------- | ---- |
| Exact fit                    | ✅    |
| Rotated fit                  | ✅    |
| Dimension overflow           | ✅    |
| Weight overflow              | ✅    |
| Fragile routing              | ✅    |
| Occupied locker              | ✅    |
| Progressive day 1            | ✅    |
| 24-hour boundary             | ✅    |
| 5-day boundary               | ✅    |
| 6-day 2× tier                | ✅    |
| 10-day boundary              | ✅    |
| 11-day 3× tier               | ✅    |
| Invalid timestamps           | ✅    |
| Pickup code generation       | ✅    |
| Pickup code hashing          | ✅    |
| Correct code verification    | ✅    |
| Wrong code                   | ✅    |
| Consumed code                | ✅    |
| Malformed code               | ✅    |
| Invalid request body         | ✅    |
| Invalid UUID                 | ✅    |
| Invalid numeric values       | ✅    |
| Invalid boolean              | ✅    |
| Invalid username             | ✅    |
| Idempotency replay           | ✅    |
| Idempotency payload mismatch | ✅    |
| Missing customer             | ✅    |
| No locker                    | ✅    |
| Capacity exceeded            | ✅    |
| Insufficient wallet          | ✅    |
| Successful retrieval         | ✅    |
| Wallet recharge              | ✅    |
| Transaction commit           | ✅    |
| Transaction rollback         | ✅    |
