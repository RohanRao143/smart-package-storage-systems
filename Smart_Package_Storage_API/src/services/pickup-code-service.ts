import { randomInt, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PickupCodeService } from '../contracts/lifecycle.js';

const scrypt = promisify(scryptCallback);

export class SecurePickupCodeService implements PickupCodeService {
  async generate(): Promise<{ readonly rawCode: string; readonly hash: string }> {
    const rawCode = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const salt = randomBytes(16);
    const derived = await scrypt(rawCode, salt, 32) as Buffer;
    return { rawCode, hash: `${salt.toString('hex')}:${derived.toString('hex')}` };
  }

  async verify(rawCode: string, hash: string): Promise<boolean> {
    const [saltHex, expectedHex] = hash.split(':');
    if (!saltHex || !expectedHex || !/^\d{6}$/.test(rawCode)) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(expectedHex, 'hex');
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = await scrypt(rawCode, salt, expected.length) as Buffer;
    return timingSafeEqual(actual, expected);
  }
}
