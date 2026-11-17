import { Router } from 'express';
import {
  dashboardQuerySchema,
  inventoryReportQuerySchema,
  salesReportQuerySchema,
  type DashboardQuery,
  type InventoryReportQuery,
  type SalesReportQuery,
} from '@posshope/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { resolveReportBranchId } from '../../lib/branches.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as inventoryReportsService from './inventory-reports.service.js';
import * as reportsService from './reports.service.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.get(
  '/dashboard',
  authorize('reports:view'),
  validate({ query: dashboardQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as DashboardQuery;
    const branch = resolveReportBranchId(req);
    const result = await reportsService.getDashboard(
      query.days,
      branch === 'all' ? undefined : branch,
      query.channel,
    );
    res.status(200).json(result);
  }),
);

reportsRouter.get(
  '/sales',
  authorize('reports:view'),
  validate({ query: salesReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const branch = resolveReportBranchId(req);
    const query = req.query as unknown as SalesReportQuery;
    const result = await reportsService.getSalesReport(
      query,
      branch === 'all' ? undefined : branch,
      query.channel,
    );
    res.status(200).json(result);
  }),
);

reportsRouter.get(
  '/inventory',
  authorize('reports:view'),
  validate({ query: inventoryReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const branch = resolveReportBranchId(req);
    const query = req.query as unknown as InventoryReportQuery;
    const result = await inventoryReportsService.getInventoryReports(
      query,
      branch === 'all' ? undefined : branch,
    );
    res.status(200).json(result);
  }),
);
