import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  idSchema,
  printerCreateSchema,
  printerUpdateSchema,
  resolveTemplate,
  type PaperWidth,
  type PrinterCreateInput,
  type PrinterDto,
  type PrinterUpdateInput,
} from '@posshope/shared';
import { Prisma, type Printer } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAudit } from '../../lib/audit.js';
import { resolveBranchId } from '../../lib/branches.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../prisma.js';

export const printersRouter = Router();
printersRouter.use(authenticate);

const idParams = z.object({ id: idSchema });

export function toPrinterDto(row: Printer): PrinterDto {
  return {
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    connection: row.connection,
    deviceName: row.deviceName,
    host: row.host,
    port: row.port,
    paperWidth: (row.paperWidth === 58 ? 58 : 80) as PaperWidth,
    role: row.role,
    categoryIds: row.categoryIds,
    channels: row.channels,
    copies: row.copies,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    template: resolveTemplate(row.role, row.template),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertBranch(row: { branchId: string }, req: Request): void {
  if (req.user!.role !== 'ADMIN' && row.branchId !== resolveBranchId(req)) {
    throw new ForbiddenError('This printer belongs to another branch');
  }
}

/** Every terminal reads the fleet so it can route its own jobs. */
printersRouter.get(
  '/',
  authorize('printers:view'),
  asyncHandler(async (req, res) => {
    const branchId = resolveBranchId(req);
    const rows = await prisma.printer.findMany({
      where: { branchId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.status(200).json(rows.map(toPrinterDto));
  }),
);

printersRouter.post(
  '/',
  authorize('settings:manage'),
  validate({ body: printerCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as PrinterCreateInput;
    const branchId = input.branchId ?? resolveBranchId(req);
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) throw new ValidationError('Choose a valid branch for this printer');

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.printer.create({
        data: {
          branchId,
          name: input.name,
          connection: input.connection,
          deviceName: input.deviceName ?? null,
          host: input.host ?? null,
          port: input.port,
          paperWidth: input.paperWidth,
          role: input.role,
          categoryIds: input.categoryIds,
          channels: input.channels,
          copies: input.copies,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
          template: input.template ? (input.template as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
      await recordAudit(
        {
          action: 'printer.created',
          entityType: 'Printer',
          entityId: row.id,
          after: { name: row.name, role: row.role, connection: row.connection },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toPrinterDto(created));
  }),
);

printersRouter.patch(
  '/:id',
  authorize('settings:manage'),
  validate({ params: idParams, body: printerUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as PrinterUpdateInput;
    const existing = await prisma.printer.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw new NotFoundError('Printer not found');
    assertBranch(existing, req);

    const connection = input.connection ?? existing.connection;
    const host = input.host !== undefined ? input.host : existing.host;
    const deviceName = input.deviceName !== undefined ? input.deviceName : existing.deviceName;
    if (connection === 'NETWORK' && !host) throw new ValidationError('Enter the printer IP address');
    if (connection === 'SPOOLER' && !deviceName) {
      throw new ValidationError('Choose the Windows printer name');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.printer.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.connection !== undefined ? { connection: input.connection } : {}),
          ...(input.deviceName !== undefined ? { deviceName: input.deviceName ?? null } : {}),
          ...(input.host !== undefined ? { host: input.host ?? null } : {}),
          ...(input.port !== undefined ? { port: input.port } : {}),
          ...(input.paperWidth !== undefined ? { paperWidth: input.paperWidth } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.categoryIds !== undefined ? { categoryIds: input.categoryIds } : {}),
          ...(input.channels !== undefined ? { channels: input.channels } : {}),
          ...(input.copies !== undefined ? { copies: input.copies } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.template !== undefined
            ? { template: input.template as Prisma.InputJsonValue }
            : {}),
        },
      });
      await recordAudit(
        {
          action: 'printer.updated',
          entityType: 'Printer',
          entityId: row.id,
          before: toPrinterDto(existing),
          after: toPrinterDto(row),
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(200).json(toPrinterDto(updated));
  }),
);

printersRouter.delete(
  '/:id',
  authorize('settings:manage'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.printer.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw new NotFoundError('Printer not found');
    assertBranch(existing, req);
    await prisma.$transaction(async (tx) => {
      await tx.printer.delete({ where: { id: existing.id } });
      await recordAudit(
        {
          action: 'printer.deleted',
          entityType: 'Printer',
          entityId: existing.id,
          before: toPrinterDto(existing),
          userId: req.user!.id,
        },
        tx,
      );
    });
    res.status(200).json({ ok: true });
  }),
);
