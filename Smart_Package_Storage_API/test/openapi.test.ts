import { describe, expect, it } from 'vitest';
import { openApiDocument } from '../src/openapi.js';

describe('OpenAPI document', () => {
  it('documents the split pickup and wallet lifecycle routes', () => {
    expect(openApiDocument.paths).toHaveProperty('/api/v1/packages/retrieve/quote');
    expect(openApiDocument.paths).toHaveProperty('/api/v1/wallet/recharge');
    expect(openApiDocument.paths).toHaveProperty('/api/v1/packages/retrieve/confirm');
    expect(openApiDocument.paths).not.toHaveProperty('/api/v1/packages/retrieve');
  });
});
