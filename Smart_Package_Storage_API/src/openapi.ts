/** OpenAPI 3.0 document served at /openapi.json and rendered at /api-docs. */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Smart Package Storage API', version: '1.0.0',
    description: 'Transactional locker allocation, storage, and retrieval API. Monetary amounts are integer cents; all timestamps are ISO-8601 UTC.',
  },
  servers: [{ url: '/', description: 'Current server' }],
  tags: [{ name: 'System' }, { name: 'Lockers' }, { name: 'Packages' }],
  paths: {
    '/health': {
      get: { tags: ['System'], summary: 'Health check', responses: { '200': { description: 'Service is healthy', content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', example: 'ok' } } } } } } } },
    },
    '/api/v1/lockers': {
      get: {
        tags: ['Lockers'], summary: 'List lockers',
        parameters: [{ name: 'available', in: 'query', required: false, schema: { type: 'boolean' }, description: 'When true, return only vacant lockers.' }],
        responses: { '200': { description: 'Lockers', content: { 'application/json': { schema: { $ref: '#/components/schemas/LockerListResponse' } } } }, '400': { $ref: '#/components/responses/ValidationError' } },
      },
      post: {
        tags: ['Lockers'], summary: 'Create a locker', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateLockerRequest' } } } },
        responses: { '201': { description: 'Locker created', content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateLockerResponse' } } } }, '400': { $ref: '#/components/responses/ValidationError' } },
      },
    },
    '/api/v1/packages/store': {
      post: {
        tags: ['Packages'], summary: 'Store a package and assign its smallest compatible locker',
        description: 'The locker allocation, occupancy update, package creation, code hash persistence, and idempotency record run in one transaction.',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StorePackageRequest' } } } },
        responses: {
          '201': { description: 'Package stored. Deliver the pickup code only to the trusted delivery workflow.', content: { 'application/json': { schema: { $ref: '#/components/schemas/StorePackageResponse' } } } },
          '400': { $ref: '#/components/responses/ValidationError' }, '404': { $ref: '#/components/responses/CustomerNotFound' }, '409': { $ref: '#/components/responses/StorageConflict' }, '422': { $ref: '#/components/responses/CapacityExceeded' },
        },
      },
    },
    '/api/v1/packages/retrieve': {
      post: {
        tags: ['Packages'], summary: 'Validate a pickup code, charge storage, collect package, and release locker',
        description: 'The active package, locker, and customer are locked before charge calculation. Insufficient funds leave the package, code, and locker unchanged.',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RetrievePackageRequest' } } } },
        responses: {
          '200': { description: 'Package collected and locker released', content: { 'application/json': { schema: { $ref: '#/components/schemas/RetrievePackageResponse' } } } },
          '400': { $ref: '#/components/responses/ValidationError' }, '403': { $ref: '#/components/responses/InvalidPickupCode' }, '409': { $ref: '#/components/responses/RetrievalConflict' }, '422': { $ref: '#/components/responses/InsufficientBalance' },
        },
      },
    },
  },
  components: {
    parameters: { IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: true, description: 'UUID used to safely replay an identical mutation request.', schema: { type: 'string', format: 'uuid' } } },
    schemas: {
      LockerSize: { type: 'string', enum: ['SMALL', 'MEDIUM', 'LARGE'] },
      CreateLockerRequest: { type: 'object', additionalProperties: false, required: ['size', 'widthCm', 'heightCm', 'breadthCm', 'maxWeightGrams', 'fragileSupport'], properties: { size: { $ref: '#/components/schemas/LockerSize' }, widthCm: { type: 'integer', minimum: 1 }, heightCm: { type: 'integer', minimum: 1 }, breadthCm: { type: 'integer', minimum: 1 }, maxWeightGrams: { type: 'integer', minimum: 1 }, fragileSupport: { type: 'boolean' } } },
      CreateLockerResponse: { type: 'object', required: ['id', 'size', 'isOccupied'], properties: { id: { type: 'string', format: 'uuid' }, size: { $ref: '#/components/schemas/LockerSize' }, isOccupied: { type: 'boolean', enum: [false] } } },
      LockerSummary: { type: 'object', required: ['id', 'size', 'isOccupied', 'fragileSupport'], properties: { id: { type: 'string', format: 'uuid' }, size: { $ref: '#/components/schemas/LockerSize' }, isOccupied: { type: 'boolean' }, fragileSupport: { type: 'boolean' } } },
      LockerListResponse: { type: 'object', required: ['data'], properties: { data: { type: 'array', items: { $ref: '#/components/schemas/LockerSummary' } } } },
      StorePackageRequest: { type: 'object', additionalProperties: false, required: ['customerId', 'widthCm', 'heightCm', 'breadthCm', 'weightGrams', 'hasFragileItems'], properties: { customerId: { type: 'string', format: 'uuid' }, widthCm: { type: 'integer', minimum: 1 }, heightCm: { type: 'integer', minimum: 1 }, breadthCm: { type: 'integer', minimum: 1 }, weightGrams: { type: 'integer', minimum: 1 }, hasFragileItems: { type: 'boolean' } } },
      StorePackageResponse: { type: 'object', required: ['packageId', 'lockerId', 'lockerSize', 'pickupCode', 'storedAt'], properties: { packageId: { type: 'string', format: 'uuid' }, lockerId: { type: 'string', format: 'uuid' }, lockerSize: { $ref: '#/components/schemas/LockerSize' }, pickupCode: { type: 'string', pattern: '^\\d{6}$', description: 'Returned only at storage time.' }, storedAt: { type: 'string', format: 'date-time' } } },
      RetrievePackageRequest: { type: 'object', additionalProperties: false, required: ['lockerId', 'pickupCode'], properties: { lockerId: { type: 'string', format: 'uuid' }, pickupCode: { type: 'string', pattern: '^\\d{6}$' } } },
      RetrievePackageResponse: { type: 'object', required: ['packageId', 'collectedAt', 'heldTimeMs', 'chargedAmountCents', 'walletBalanceCents', 'lockerReleased'], properties: { packageId: { type: 'string', format: 'uuid' }, collectedAt: { type: 'string', format: 'date-time' }, heldTimeMs: { type: 'integer', minimum: 0 }, chargedAmountCents: { type: 'integer', minimum: 0 }, walletBalanceCents: { type: 'integer', minimum: 0 }, lockerReleased: { type: 'boolean', enum: [true] } } },
      ErrorResponse: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
    },
    responses: {
      ValidationError: { description: 'Invalid request or missing idempotency key', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      CustomerNotFound: { description: 'Customer does not exist', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      StorageConflict: { description: 'No compatible vacant locker, or an idempotency key was reused with a different payload', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      CapacityExceeded: { description: 'No locker can physically hold the package', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      InvalidPickupCode: { description: 'Locker ID or pickup code is invalid', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      RetrievalConflict: { description: 'Package has already been collected or idempotency key was reused', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      InsufficientBalance: { description: 'Customer wallet cannot cover the charge', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    },
  },
} as const;
