import { describe, expect, it } from 'vitest';

import {
  parseConfirmPickup,
  parseCreateLocker,
  parseRechargeWallet,
  parseRetrievePackage,
  parseStorePackage,
} from '../../src/http/controllers.js';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('request validation', () => {
  describe('parseCreateLocker', () => {
    const valid = {
      size: 'SMALL',
      widthCm: 20,
      heightCm: 20,
      breadthCm: 20,
      maxWeightGrams: 5000,
      fragileSupport: true,
    };

    it('accepts a valid request', () => {
      expect(parseCreateLocker(valid)).toEqual(valid);
    });

    it('rejects a non-object body', () => {
      expect(() => parseCreateLocker(null)).toThrow();
      expect(() => parseCreateLocker([])).toThrow();
      expect(() => parseCreateLocker('test')).toThrow();
    });

    it('rejects invalid locker size', () => {
      expect(() =>
        parseCreateLocker({
          ...valid,
          size: 'XL',
        }),
      ).toThrow();
    });

    it('rejects zero dimensions', () => {
      expect(() =>
        parseCreateLocker({
          ...valid,
          widthCm: 0,
        }),
      ).toThrow();
    });

    it('rejects negative dimensions', () => {
      expect(() =>
        parseCreateLocker({
          ...valid,
          heightCm: -1,
        }),
      ).toThrow();
    });

    it('rejects fractional dimensions', () => {
      expect(() =>
        parseCreateLocker({
          ...valid,
          breadthCm: 10.5,
        }),
      ).toThrow();
    });

    it('rejects unsafe integers', () => {
      expect(() =>
        parseCreateLocker({
          ...valid,
          maxWeightGrams: Number.MAX_SAFE_INTEGER + 1,
        }),
      ).toThrow();
    });

    it('rejects non-boolean fragileSupport', () => {
      expect(() =>
        parseCreateLocker({
          ...valid,
          fragileSupport: 'true',
        }),
      ).toThrow();
    });
  });

  describe('parseStorePackage', () => {
    const valid = {
      storedByUsername: 'agent_01',
      recipientUsername: 'customer_01',
      packageName: 'Laptop',
      widthCm: 20,
      heightCm: 15,
      breadthCm: 10,
      weightGrams: 1000,
      hasFragileItems: false,
    };

    it('accepts a valid request', () => {
      expect(parseStorePackage(valid)).toEqual(valid);
    });

    it('rejects missing agent username', () => {
      expect(() =>
        parseStorePackage({
          ...valid,
          storedByUsername: undefined,
        }),
      ).toThrow();
    });

    it('rejects short usernames', () => {
      expect(() =>
        parseStorePackage({
          ...valid,
          recipientUsername: 'ab',
        }),
      ).toThrow();
    });

    it('rejects invalid package name', () => {
      expect(() =>
        parseStorePackage({
          ...valid,
          packageName: 123,
        }),
      ).toThrow();
    });

    it('rejects zero weight', () => {
      expect(() =>
        parseStorePackage({
          ...valid,
          weightGrams: 0,
        }),
      ).toThrow();
    });

    it('rejects invalid fragile flag', () => {
      expect(() =>
        parseStorePackage({
          ...valid,
          hasFragileItems: 'false',
        }),
      ).toThrow();
    });
  });

  describe('parseRetrievePackage', () => {
    const valid = {
      lockerId: UUID,
      pickupCode: '123456',
      receivedByUsername: 'customer_01',
    };

    it('accepts a valid request', () => {
      expect(parseRetrievePackage(valid)).toEqual(valid);
    });

    it('rejects malformed locker UUID', () => {
      expect(() =>
        parseRetrievePackage({
          ...valid,
          lockerId: 'not-a-uuid',
        }),
      ).toThrow();
    });

    it('rejects five-digit pickup code', () => {
      expect(() =>
        parseRetrievePackage({
          ...valid,
          pickupCode: '12345',
        }),
      ).toThrow();
    });

    it('rejects seven-digit pickup code', () => {
      expect(() =>
        parseRetrievePackage({
          ...valid,
          pickupCode: '1234567',
        }),
      ).toThrow();
    });

    it('rejects alphabetic pickup code', () => {
      expect(() =>
        parseRetrievePackage({
          ...valid,
          pickupCode: '12AB56',
        }),
      ).toThrow();
    });

    it('rejects invalid receiver username', () => {
      expect(() =>
        parseRetrievePackage({
          ...valid,
          receivedByUsername: 'x',
        }),
      ).toThrow();
    });
  });

  describe('parseConfirmPickup', () => {
    const valid = {
      lockerId: UUID,
      pickupCode: '123456',
      receivedByUsername: 'customer_01',
      pickupConfirmed: true,
    };

    it('accepts pickupConfirmed=true', () => {
      expect(parseConfirmPickup(valid)).toEqual(valid);
    });

    it('rejects pickupConfirmed=false', () => {
      expect(() =>
        parseConfirmPickup({
          ...valid,
          pickupConfirmed: false,
        }),
      ).toThrow();
    });

    it('rejects missing pickupConfirmed', () => {
      const { pickupConfirmed: _, ...body } = valid;

      expect(() =>
        parseConfirmPickup(body),
      ).toThrow();
    });
  });

  describe('parseRechargeWallet', () => {
    it('accepts a valid recharge', () => {
      expect(
        parseRechargeWallet({
          customerId: UUID,
          amountCents: 1000,
        }),
      ).toEqual({
        customerId: UUID,
        amountCents: 1000,
      });
    });

    it('rejects zero recharge', () => {
      expect(() =>
        parseRechargeWallet({
          customerId: UUID,
          amountCents: 0,
        }),
      ).toThrow();
    });

    it('rejects negative recharge', () => {
      expect(() =>
        parseRechargeWallet({
          customerId: UUID,
          amountCents: -100,
        }),
      ).toThrow();
    });

    it('rejects invalid customer ID', () => {
      expect(() =>
        parseRechargeWallet({
          customerId: 'bad',
          amountCents: 1000,
        }),
      ).toThrow();
    });
  });
});