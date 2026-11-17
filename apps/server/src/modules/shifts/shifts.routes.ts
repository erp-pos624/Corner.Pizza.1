import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  cashMovementSchema,
  idSchema,
  shiftCloseSchema,
  shiftOpenSchema,
  shiftQuerySchema,
  zReportQuerySchema,
  type CashMovementInput,
  type ShiftCloseInput,
  type ShiftOpenInput,
  type ShiftQuery,
  type ZReportQuery,
} from '@posshope/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { resolveBranchId, resolveTerminalId } from '../../lib/branches.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as shiftsService from './shifts.service.js';

export const shiftsRouter = Router();
shiftsRouter.use(authenticate);

const idParams = z.object({ id: idSchema });

function listBranchScope(req: Request): string | undefined {
  if (req.user!.role === 'ADMIN') {
    const requested = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    return requested && requested !== 'all' ? requested : undefined;
  }
  return resolveBranchId(req);
}

function serviceActor(req: Request): shiftsService.ShiftActor {
  const user = req.user!;
  return { id: user.id, role: user.role, branchId: user.branchId, terminalId: user.terminalId };
}

shiftsRouter.get(
  '/current',
  authorize('shifts:view'),
  asyncHandler(async (req, res) => {
    const shift = await shiftsService.getCurrentShift(
      resolveBranchId(req),
      resolveTerminalId(req),
    );
    res.status(200).json(shift);
  }),
);

shiftsRouter.get(
  '/z-reports',
  authorize('shifts:view'),
  validate({ query: zReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const reports = await shiftsService.listZReports(
      req.query as unknown as ZReportQuery,
      listBranchScope(req),
      serviceActor(req),
    );
    res.status(200).json(reports);
  }),
);

shiftsRouter.get(
  '/z-reports/:id',
  authorize('shifts:view'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const report = await shiftsService.getZReport(req.params.id!, serviceActor(req));
    res.status(200).json(report);
  }),
);

shiftsRouter.get(
  '/',
  authorize('shifts:view'),
  validate({ query: shiftQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await shiftsService.listShifts(
      req.query as unknown as ShiftQuery,
      listBranchScope(req),
    );
    res.status(200).json(result);
  }),
);

shiftsRouter.post(
  '/',
  authorize('shifts:manage'),
  validate({ body: shiftOpenSchema }),
  asyncHandler(async (req, res) => {
    const shift = await shiftsService.openShift(
      req.body as ShiftOpenInput,
      serviceActor(req),
      { branchId: resolveBranchId(req), terminalId: resolveTerminalId(req) },
    );
    res.status(201).json(shift);
  }),
);

shiftsRouter.get(
  '/:id',
  authorize('shifts:view'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const shift = await shiftsService.getShift(req.params.id!, serviceActor(req));
    res.status(200).json(shift);
  }),
);

shiftsRouter.post(
  '/:id/movements',
  authorize('shifts:manage'),
  validate({ params: idParams, body: cashMovementSchema }),
  asyncHandler(async (req, res) => {
    const shift = await shiftsService.recordCashMovement(
      req.params.id!,
      req.body as CashMovementInput,
      serviceActor(req),
    );
    res.status(201).json(shift);
  }),
);

shiftsRouter.post(
  '/:id/close',
  authorize('shifts:manage'),
  validate({ params: idParams, body: shiftCloseSchema }),
  asyncHandler(async (req, res) => {
    const shift = await shiftsService.closeShift(
      req.params.id!,
      req.body as ShiftCloseInput,
      serviceActor(req),
    );
    res.status(200).json(shift);
  }),
);
