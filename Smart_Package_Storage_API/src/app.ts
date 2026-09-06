import express, { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { LockerService, PackageRetrievalService, PackageStorageService, WalletService } from './contracts/lifecycle.js';
import { errorHandler, LockerController, PackageController, WalletController } from './http/controllers.js';
import { openApiDocument } from './openapi.js';

export interface AppServices {
  readonly lockers: LockerService;
  readonly storage: PackageStorageService;
  readonly retrieval: PackageRetrievalService;
  readonly wallet: WalletService;
}

export function createApp(services: AppServices): Express {
  const app = express();
  app.use(express.json());
  app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));
  app.get('/openapi.json', (_request, response) => response.json(openApiDocument));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { explorer: true }));
  const lockers = new LockerController(services.lockers);
  const packages = new PackageController(services.storage, services.retrieval);
  const wallet = new WalletController(services.wallet);
  app.get('/api/v1/lockers', lockers.list);
  app.post('/api/v1/lockers', lockers.create);
  app.post('/api/v1/packages/store', packages.store);
  app.post('/api/v1/packages/retrieve/quote', packages.quote);
  app.post('/api/v1/wallet/recharge', wallet.recharge);
  app.post('/api/v1/packages/retrieve/confirm', packages.confirm);
  app.use(errorHandler);
  return app;
}
