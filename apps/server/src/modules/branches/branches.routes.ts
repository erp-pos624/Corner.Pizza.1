import { Router } from 'express';
import { z } from 'zod';
import {
  branchCreateSchema,
  branchUpdateSchema,
  idSchema,
  type BranchDto,
  type BranchCreateInput,
} from '@posshope/shared';
import type { Branch } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAudit } from '../../lib/audit.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../prisma.js';

export const branchesRouter = Router();
branchesRouter.use(authenticate);

const idParams = z.object({ id: idSchema });
type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

function toBranchDto(row: Branch): BranchDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameEn: row.name,
    nameAr: row.nameAr,
    address: row.address,
    phone: row.phone,
    latitude: row.latitude,
    longitude: row.longitude,
    isActive: row.isActive,
    onlineOrderingEnabled: row.onlineOrderingEnabled,
    onlineOpenTime: row.onlineOpenTime,
    onlineCloseTime: row.onlineCloseTime,
    createdAt: row.createdAt.toISOString(),
  };
}

branchesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const rows = await prisma.branch.findMany({
      where: user.role === 'ADMIN' ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
    const scoped =
      user.role === 'ADMIN' ? rows : rows.filter((row) => row.id === user.branchId);
    res.status(200).json(scoped.map(toBranchDto));
  }),
);

branchesRouter.post(
  '/',
  authorize('branches:manage'),
  validate({ body: branchCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as BranchCreateInput;
    const clash = await prisma.branch.findUnique({ where: { code: input.code } });
    if (clash) throw new ConflictError('A branch with that code already exists');

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.branch.create({
        data: {
          code: input.code,
          name: input.name,
          nameAr: input.nameAr ?? null,
          address: input.address ?? null,
          phone: input.phone ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          isActive: input.isActive,
        },
      });
      await recordAudit(
        {
          action: 'branch.created',
          entityType: 'Branch',
          entityId: row.id,
          after: { code: row.code, name: row.name },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toBranchDto(created));
  }),
);

branchesRouter.patch(
  '/:id',
  authorize('branches:manage'),
  validate({ params: idParams, body: branchUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as BranchUpdateInput;
    const existing = await prisma.branch.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw new NotFoundError('Branch not found');
    if (input.code && input.code !== existing.code) {
      const clash = await prisma.branch.findUnique({ where: { code: input.code } });
      if (clash) throw new ConflictError('A branch with that code already exists');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.branch.update({
        where: { id: existing.id },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.nameAr !== undefined ? { nameAr: input.nameAr ?? null } : {}),
          ...(input.address !== undefined ? { address: input.address ?? null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
          ...(input.latitude !== undefined ? { latitude: input.latitude ?? null } : {}),
          ...(input.longitude !== undefined ? { longitude: input.longitude ?? null } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await recordAudit(
        {
          action: 'branch.updated',
          entityType: 'Branch',
          entityId: row.id,
          before: { name: existing.name, isActive: existing.isActive },
          after: { name: row.name, isActive: row.isActive },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(200).json(toBranchDto(updated));
  }),
);
