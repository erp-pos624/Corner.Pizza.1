import cors, { type CorsOptions, type CorsOptionsDelegate } from 'cors';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import { env, isProduction } from './env.js';
import { classifyOrigin, parseOrigins, requestOrigin } from './lib/origin.js';
import { accessLog, requestContext } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { language } from './middleware/language.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/auth/users.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { branchesRouter } from './modules/branches/branches.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { deliveryRouter } from './modules/delivery/delivery.routes.js';
import { deliveryZonesRouter } from './modules/delivery-zones/delivery-zones.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { hrRouter } from './modules/hr/hr.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { invoicesRouter } from './modules/invoices/invoices.routes.js';
import { kitchenRouter } from './modules/kitchen/kitchen.routes.js';
import { categoriesRouter, discountsRouter, menuRouter } from './modules/menu/menu.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { onlineStoreRouter } from './modules/online-store/online-store.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { purchasingRouter } from './modules/purchasing/purchasing.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { shiftsRouter } from './modules/shifts/shifts.routes.js';
import { suppliersRouter } from './modules/suppliers/suppliers.routes.js';
import { tablesRouter } from './modules/tables/tables.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { buildOpenApiDocument, renderDocsPage } from './openapi.js';

const EXPOSED_HEADERS = ['x-request-id', 'x-ratelimit-remaining', 'retry-after'];

/**
 * Per-request CORS policy.
 *
 * Native clients (Electron main process, curl, tests) send no `Origin` and are
 * unaffected. Browser origins are classified by `lib/origin.ts`: trusted
 * origins may exchange credentials, a production wildcard is readable without
 * credentials, and anything else gets no CORS headers at all, so the browser
 * blocks the response.
 */
const corsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.header('origin');
  if (!origin) {
    callback(null, { origin: false });
    return;
  }
  const decision = classifyOrigin(origin, requestOrigin(req), {
    allowed: parseOrigins(env.CORS_ORIGINS),
    isProduction,
  });
  const options: CorsOptions =
    decision === 'trusted'
      ? { origin: true, credentials: true, exposedHeaders: EXPOSED_HEADERS }
      : decision === 'public'
        ? { origin: '*', credentials: false, exposedHeaders: EXPOSED_HEADERS }
        : { origin: false };
  callback(null, options);
};

/** Builds the fully-wired Express application (no I/O side effects). */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Vercel terminates TLS on its edge, so the platform proxy is one hop away.
  app.set('trust proxy', process.env.VERCEL ? 1 : 'loopback');

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(cors(corsDelegate));
  // Gateway signatures are computed over the raw bytes, so this route must be
  // parsed before the JSON middleware consumes the stream.
  app.use('/api/public/payments/basata/webhook', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(requestContext);
  app.use(accessLog);
  app.use(language);

  // Liveness/readiness at the root for infrastructure probes.
  app.use('/', healthRouter);

  app.get('/api/openapi.json', (_req, res) => {
    res.status(200).json(buildOpenApiDocument());
  });
  app.get('/api/docs', (_req, res) => {
    res
      .status(200)
      .setHeader('content-type', 'text/html; charset=utf-8')
      .setHeader(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      )
      .send(renderDocsPage());
  });

  const v1 = express.Router();
  v1.use('/auth', authRouter);
  v1.use('/users', usersRouter);
  v1.use('/branches', branchesRouter);
  v1.use('/categories', categoriesRouter);
  v1.use('/menu', menuRouter);
  v1.use('/discounts', discountsRouter);
  v1.use('/orders', ordersRouter);
  v1.use('/tables', tablesRouter);
  v1.use('/delivery', deliveryRouter);
  v1.use('/delivery-zones', deliveryZonesRouter);
  v1.use('/kitchen', kitchenRouter);
  v1.use('/invoices', invoicesRouter);
  v1.use('/customers', customersRouter);
  v1.use('/inventory', inventoryRouter);
  v1.use('/hr', hrRouter);
  v1.use('/purchasing', purchasingRouter);
  v1.use('/suppliers', suppliersRouter);
  v1.use('/reports', reportsRouter);
  v1.use('/shifts', shiftsRouter);
  v1.use('/settings', settingsRouter);
  v1.use('/audit', auditRouter);
  v1.use('/online-store', onlineStoreRouter);
  v1.use('/uploads', uploadsRouter);

  app.use('/api/v1', v1);

  // Unauthenticated storefront surface for the future e-commerce website.
  app.use('/api/public', publicRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
