import { describe, expect, it } from 'vitest';
import { SecurePickupCodeService } from '../src/services/pickup-code-service.js';

describe('SecurePickupCodeService', () => {
  it('creates a six-digit code that verifies only against its stored hash', async () => {
    const service = new SecurePickupCodeService();
    const generated = await service.generate();
    expect(generated.rawCode).toMatch(/^\d{6}$/);
    await expect(service.verify(generated.rawCode, generated.hash)).resolves.toBe(true);
    await expect(service.verify('000000', generated.hash)).resolves.toBe(generated.rawCode === '000000');
  });
});
