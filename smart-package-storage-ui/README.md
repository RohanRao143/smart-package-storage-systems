# Smart Package Storage UI

## Run

```bash
npm install
npm run dev
```

For a separate API server, copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.

## Implemented

### Delivery Agent
- Customer username
- Package name
- Width / height / breadth
- Weight
- Fragile flag
- POST `/api/v1/packages/store`
- Displays package ID, locker ID, locker size and pickup code
- Sends an `Idempotency-Key`

### Customer
- Username
- Locker ID
- Pickup code
- POST `/api/v1/packages/retrieve/quote`
- Displays storage charges and wallet balance
- Enables Confirm Pickup only when balance covers the quoted charge
- POST `/api/v1/packages/retrieve/confirm`
- Displays package name as collected, charges deducted, updated wallet balance and locker released

## Important contract mismatch

The supplied OpenAPI contract requires `customerId` (UUID) for the store endpoint, while the requested UI asks for a username. There is no username lookup endpoint in the supplied contract.

The generated UI therefore keeps the username field but currently maps it to `customerId` as a placeholder. Replace that mapping with the real authentication/customer lookup mechanism.

The quote and confirm schemas do not accept username, so the retrieval username is kept as UI context and is not sent to those endpoints.

The API specifies integer cents. The UI formats those values as USD; change `money()` in `src/App.jsx` if another currency is required.
