import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { CreateLockerRequest, RetrievePackageRequest, StorePackageRequest } from '../contracts/api.js';
import type { LockerService, PackageRetrievalService, PackageStorageService, RequestContext } from '../contracts/lifecycle.js';
import { ApiError, errors } from '../errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw errors.validation('Request body must be an object.');
  return value as Record<string, unknown>;
};

const positiveInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    throw errors.validation(`${field} must be a positive integer.`);
  return value as number;
};

const boolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean')
    throw errors.validation(`${field} must be a boolean.`);
  return value;
};

const uuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value))
    throw errors.validation(`${field} must be a UUID.`);
  return value;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value))
    return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const mutationContext = (request: Request): RequestContext => {
  const key = request.header('Idempotency-Key');
  if (!key || !UUID_PATTERN.test(key)) throw errors.idempotencyRequired();
  return {
    idempotencyKey: key,
    requestHash: createHash('sha256').update(stableJson(request.body)).digest('hex'),
    requestedAt: new Date().toISOString()
  };
};

export const parseCreateLocker = (body: unknown): CreateLockerRequest => {
  const value = object(body);
  if (value.size !== 'SMALL' && value.size !== 'MEDIUM' && value.size !== 'LARGE')
    throw errors.validation('size must be SMALL, MEDIUM, or LARGE.');
  return {
    size: value.size,
    widthCm: positiveInteger(value.widthCm, 'widthCm'),
    heightCm: positiveInteger(value.heightCm, 'heightCm'),
    breadthCm: positiveInteger(value.breadthCm, 'breadthCm'),
    maxWeightGrams: positiveInteger(value.maxWeightGrams, 'maxWeightGrams'),
    fragileSupport: boolean(value.fragileSupport, 'fragileSupport')
  };
};

export const parseStorePackage = (body: unknown): StorePackageRequest => {
  const value = object(body);
  return {
    customerId: uuid(value.customerId, 'customerId'),
    widthCm: positiveInteger(value.widthCm, 'widthCm'),
    heightCm: positiveInteger(value.heightCm, 'heightCm'),
    breadthCm: positiveInteger(value.breadthCm, 'breadthCm'),
    weightGrams: positiveInteger(value.weightGrams, 'weightGrams'),
    hasFragileItems: boolean(value.hasFragileItems, 'hasFragileItems')
  };
};

export const parseRetrievePackage = (body: unknown): RetrievePackageRequest => {
  const value = object(body);
  if (typeof value.pickupCode !== 'string' || !/^\d{6}$/.test(value.pickupCode))
    throw errors.validation('pickupCode must be a six-digit code.');
  return {
    lockerId: uuid(value.lockerId, 'lockerId'),
    pickupCode: value.pickupCode
  };
};

export class LockerController {
  constructor(private readonly service: LockerService) {}

  create = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(201).json(await this.service.createLocker(parseCreateLocker(request.body)));
    } catch (error) {
      next(error);
    }
  };

  list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const available = request.query.available === undefined ? undefined : request.query.available === 'true';
      if (request.query.available !== undefined && request.query.available !== 'true' && request.query.available !== 'false')
        throw errors.validation('available must be true or false.');
      response.json({
        data: await this.service.listLockers({ available })
      });
     } catch (error) {
      next(error);
    }
  };
}
export class PackageController {
  constructor(private readonly storage: PackageStorageService, private readonly retrieval: PackageRetrievalService) {}

  store = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(201).json(await this.storage.storePackage(parseStorePackage(request.body), mutationContext(request)));
    } catch (error) {
      next(error);
    }
  };

  retrieve = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(200).json(await this.retrieval.retrievePackage(parseRetrievePackage(request.body), mutationContext(request)));
    } catch (error) {
      next(error);
    }
  };
}

export const errorHandler = (error: unknown, _request: Request, response: Response, _next: NextFunction): void => {
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  console.error('Unhandled API error', error);
  response.status(500).json({ error: { code: 'VALIDATION_ERROR', message: 'An unexpected server error occurred.' } });
};
