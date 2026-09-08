import { describe, expect, it } from 'vitest';

import { SecurePickupCodeService } from '../../src/services/pickup-code-service.js';

describe('SecurePickupCodeService', () => {
  it('generates a six-digit pickup code', async () => {
    const service = new SecurePickupCodeService();

    const result = await service.generate();

    expect(result.rawCode).toMatch(/^\d{6}$/);
  });

  it('generates a hash different from the raw code', async () => {
    const service = new SecurePickupCodeService();

    const result = await service.generate();

    expect(result.hash).not.toBe(result.rawCode);
    expect(result.hash).toContain(':');
  });

  it('generates different values across calls', async () => {
    const service = new SecurePickupCodeService();

    const first = await service.generate();
    const second = await service.generate();

    expect(first.rawCode).not.toBe(second.rawCode);
    expect(first.hash).not.toBe(second.hash);
  });

  it('verifies the correct code', async () => {
    const service = new SecurePickupCodeService();

    const generated = await service.generate();

    await expect(
      service.verify(generated.rawCode, generated.hash),
    ).resolves.toBe(true);
  });

  it('rejects the wrong code', async () => {
    const service = new SecurePickupCodeService();

    const generated = await service.generate();

    const wrongCode =
      generated.rawCode === '000000'
        ? '000001'
        : '000000';

    await expect(
      service.verify(wrongCode, generated.hash),
    ).resolves.toBe(false);
  });

  it('rejects malformed pickup code', async () => {
    const service = new SecurePickupCodeService();

    const generated = await service.generate();

    await expect(
      service.verify('12345', generated.hash),
    ).resolves.toBe(false);

    await expect(
      service.verify('abcdef', generated.hash),
    ).resolves.toBe(false);

    await expect(
      service.verify('', generated.hash),
    ).resolves.toBe(false);
  });

  it('rejects malformed hash', async () => {
    const service = new SecurePickupCodeService();

    await expect(
      service.verify('123456', ''),
    ).resolves.toBe(false);

    await expect(
      service.verify('123456', 'invalid'),
    ).resolves.toBe(false);

    await expect(
      service.verify('123456', '00:00'),
    ).resolves.toBe(false);
  });

  it('does not expose the raw code inside the generated hash', async () => {
    const service = new SecurePickupCodeService();

    const result = await service.generate();

    expect(result.hash).not.toContain(result.rawCode);
  });
});