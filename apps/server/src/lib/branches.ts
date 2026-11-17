import type { Request } from 'express';
import { DEFAULT_BRANCH_ID } from '@posshope/shared';
import { prisma } from '../prisma.js';
import type { PrismaLike } from './audit.js';

/** Branch selected by the operator, falling back to their assigned branch. */
export function resolveBranchId(req: Request): string {
  const requested =
    (typeof req.query.branchId === 'string' ? req.query.branchId : undefined) ??
    req.header('x-branch-id') ??
    undefined;
  if (req.user!.role === 'ADMIN' && requested && requested !== 'all') return requested;
  return req.user!.branchId ?? DEFAULT_BRANCH_ID;
}

/** `all` is only honoured for consolidated admin reports. */
export function resolveReportBranchId(req: Request): string | 'all' {
  const requested =
    (typeof req.query.branchId === 'string' ? req.query.branchId : undefined) ??
    req.header('x-branch-id') ??
    undefined;
  if (req.user!.role === 'ADMIN' && requested === 'all') return 'all';
  return resolveBranchId(req);
}

export function resolveTerminalId(req: Request): string {
  const header = req.header('x-terminal-id');
  if (header && header.trim()) return header.trim().slice(0, 64);
  return req.user!.terminalId ?? 'TERM-WEB';
}

export async function findOpenShift(
  branchId: string,
  terminalId: string,
  client: PrismaLike = prisma,
): Promise<{ id: string } | null> {
  return client.shift.findFirst({
    where: { branchId, terminalId, status: 'OPEN' },
    select: { id: true },
  });
}
