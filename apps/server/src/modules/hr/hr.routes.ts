import { Router } from 'express';
import { z } from 'zod';
import {
  adjustmentCreateSchema,
  adjustmentQuerySchema,
  adjustmentUpdateSchema,
  attendanceQuerySchema,
  attendanceUpsertSchema,
  buildPaginated,
  employeeCreateSchema,
  employeeQuerySchema,
  employeeUpdateSchema,
  hrSettingsUpdateSchema,
  idSchema,
  payrollGenerateSchema,
  payrollMonthQuerySchema,
  payrollPaymentSchema,
  payrollReopenSchema,
  type AdjustmentCreateInput,
  type AdjustmentQuery,
  type AdjustmentUpdateInput,
  type AttendanceQuery,
  type AttendanceUpsertInput,
  type EmployeeCreateInput,
  type EmployeeQuery,
  type EmployeeUpdateInput,
  type HrSettingsUpdateInput,
  type PayrollGenerateInput,
  type PayrollPaymentInput,
  hrShiftInputSchema,
  type HrShiftDto,
  type HrShiftInput,
} from '@posshope/shared';
import type { Prisma } from '@prisma/client';
import { currentLanguage } from '../../lib/request-language.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAudit } from '../../lib/audit.js';
import { parseDateOnly, todayInBusinessTimezone } from '../../lib/dates.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../prisma.js';
import {
  adjustmentInclude,
  assertPayrollMonthOpen,
  attendanceInclude,
  buildPayrollRows,
  computeLateMinutes,
  currentPayrollMonth,
  dateToDb,
  employeeInclude,
  findPayrollRun,
  getHrSettings,
  nextEmployeeCode,
  recalculateRunPaidTotal,
  toAdjustmentDto,
  toAttendanceDto,
  toEmployeeDto,
  toPayrollLineDto,
  toPayrollRunDto,
} from './hr.service.js';

export const hrRouter = Router();
hrRouter.use(authenticate);

const idParams = z.object({ id: idSchema });
const lineParams = z.object({ id: idSchema, lineId: idSchema });
const money2 = (value: number): string => value.toFixed(2);

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

hrRouter.get(
  '/employees',
  authorize('hr:read'),
  validate({ query: employeeQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as EmployeeQuery;
    const where: Prisma.EmployeeWhereInput = {
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { employeeCode: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q, mode: 'insensitive' } },
              { jobTitle: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.employee.count({ where }),
    ]);
    res
      .status(200)
      .json(buildPaginated(rows.map(toEmployeeDto), total, query.page, query.pageSize));
  }),
);

hrRouter.post(
  '/employees',
  authorize('hr:write'),
  validate({ body: employeeCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as EmployeeCreateInput;
    const created = await prisma.$transaction(async (tx) => {
      if (input.branchId) {
        const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
        if (!branch) throw new ValidationError('Branch not found');
      }
      if (input.shiftId) {
        const shift = await tx.hrShift.findUnique({ where: { id: input.shiftId } });
        if (!shift) throw new ValidationError('Shift not found');
      }
      const employeeCode = await nextEmployeeCode(tx);
      const row = await tx.employee.create({
        data: {
          employeeCode,
          fullName: input.fullName,
          phone: input.phone ?? null,
          jobTitle: input.jobTitle,
          branchId: input.branchId ?? null,
          hireDate: dateToDb(input.hireDate),
          basicSalary: input.basicSalary,
          salaryType: input.salaryType,
          status: input.status,
          shiftId: input.shiftId ?? null,
        },
        include: employeeInclude,
      });
      await recordAudit(
        {
          action: 'hr.employee.created',
          entityType: 'Employee',
          entityId: row.id,
          after: { employeeCode, fullName: row.fullName, basicSalary: input.basicSalary },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toEmployeeDto(created));
  }),
);

hrRouter.patch(
  '/employees/:id',
  authorize('hr:write'),
  validate({ params: idParams, body: employeeUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as EmployeeUpdateInput;
    const existing = await prisma.employee.findUnique({
      where: { id: req.params.id! },
      include: employeeInclude,
    });
    if (!existing) throw new NotFoundError('Employee not found');
    if (input.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
      if (!branch) throw new ValidationError('Branch not found');
    }
    if (input.shiftId) {
      const shift = await prisma.hrShift.findUnique({ where: { id: input.shiftId } });
      if (!shift) throw new ValidationError('Shift not found');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.employee.update({
        where: { id: existing.id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
          ...(input.branchId !== undefined ? { branchId: input.branchId ?? null } : {}),
          ...(input.hireDate !== undefined ? { hireDate: dateToDb(input.hireDate) } : {}),
          ...(input.basicSalary !== undefined ? { basicSalary: input.basicSalary } : {}),
          ...(input.salaryType !== undefined ? { salaryType: input.salaryType } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.shiftId !== undefined ? { shiftId: input.shiftId ?? null } : {}),
        },
        include: employeeInclude,
      });
      const deactivated = input.status === 'INACTIVE' && existing.status !== 'INACTIVE';
      await recordAudit(
        {
          action: deactivated ? 'hr.employee.deactivated' : 'hr.employee.updated',
          entityType: 'Employee',
          entityId: row.id,
          before: { fullName: existing.fullName, status: existing.status },
          after: {
            fullName: row.fullName,
            status: row.status,
            basicSalary: money2(Number(row.basicSalary)),
          },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(200).json(toEmployeeDto(updated));
  }),
);

hrRouter.get(
  '/employees/:id/payroll',
  authorize('hr:read'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id! },
      include: employeeInclude,
    });
    if (!employee) throw new NotFoundError('Employee not found');
    const lines = await prisma.payrollLine.findMany({
      where: { employeeId: employee.id },
      include: { payrollRun: { select: { month: true, status: true } } },
      orderBy: { payrollRun: { month: 'desc' } },
    });
    res.status(200).json({
      employee: toEmployeeDto(employee),
      lines: lines.map((line) => ({
        ...toPayrollLineDto(line),
        month: line.payrollRun.month,
        runStatus: line.payrollRun.status,
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

hrRouter.get(
  '/attendance',
  authorize('hr:read'),
  validate({ query: attendanceQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as AttendanceQuery;
    const month = query.month ?? currentPayrollMonth();
    const [year, monthNumber] = month.split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(year, monthNumber - 1, 1));
    const to = new Date(Date.UTC(year, monthNumber, 1));
    const where: Prisma.AttendanceRecordWhereInput = {
      ...(query.date
        ? { date: parseDateOnly(query.date) }
        : { date: { gte: from, lt: to } }),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        include: attendanceInclude,
        orderBy: [{ date: 'desc' }, { employee: { fullName: 'asc' } }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);
    res
      .status(200)
      .json(buildPaginated(rows.map(toAttendanceDto), total, query.page, query.pageSize));
  }),
);

hrRouter.put(
  '/attendance',
  authorize('hr:write'),
  validate({ body: attendanceUpsertSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as AttendanceUpsertInput;
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, status: true, fullName: true, shiftId: true },
    });
    if (!employee) throw new NotFoundError('Employee not found');
    if (employee.status === 'INACTIVE') {
      throw new ConflictError('Inactive employees cannot have attendance recorded.');
    }
    const month = input.date.slice(0, 7);
    await assertPayrollMonthOpen(month);
    const settings = await getHrSettings();
    // The shift picked for this record, else the employee's usual shift.
    const shiftId = input.shiftId !== undefined ? input.shiftId : employee.shiftId;
    const shift = shiftId ? await prisma.hrShift.findUnique({ where: { id: shiftId } }) : null;
    if (shiftId && !shift) throw new ValidationError('Shift not found');
    const lateMinutes =
      input.status === 'ABSENT' || input.status === 'DAY_OFF'
        ? 0
        : computeLateMinutes(input.checkIn, settings, shift);
    const status =
      input.status === 'PRESENT' && lateMinutes > 0 ? 'LATE' : input.status;
    const date = parseDateOnly(input.date);

    const saved = await prisma.$transaction(async (tx) => {
      const previous = await tx.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date } },
      });
      const row = await tx.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: employee.id, date } },
        create: {
          employeeId: employee.id,
          date,
          checkIn: input.checkIn ?? null,
          checkOut: input.checkOut ?? null,
          status,
          lateMinutes,
          note: input.note ?? null,
          shiftId: shift?.id ?? null,
          createdById: req.user!.id,
        },
        update: {
          checkIn: input.checkIn ?? null,
          checkOut: input.checkOut ?? null,
          status,
          lateMinutes,
          note: input.note ?? null,
          shiftId: shift?.id ?? null,
        },
        include: attendanceInclude,
      });
      await recordAudit(
        {
          action: previous ? 'hr.attendance.updated' : 'hr.attendance.created',
          entityType: 'AttendanceRecord',
          entityId: row.id,
          before: previous
            ? { status: previous.status, checkIn: previous.checkIn, checkOut: previous.checkOut }
            : undefined,
          after: { date: input.date, status, lateMinutes, shift: shift?.name ?? null },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(200).json(toAttendanceDto(saved));
  }),
);

// ---------------------------------------------------------------------------
// Deductions & bonuses
// ---------------------------------------------------------------------------

hrRouter.get(
  '/adjustments',
  authorize('hr:read'),
  validate({ query: adjustmentQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as AdjustmentQuery;
    const where: Prisma.EmployeeAdjustmentWhereInput = {
      ...(query.payrollMonth ? { payrollMonth: query.payrollMonth } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.employeeAdjustment.findMany({
        where,
        include: adjustmentInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.employeeAdjustment.count({ where }),
    ]);
    res
      .status(200)
      .json(buildPaginated(rows.map(toAdjustmentDto), total, query.page, query.pageSize));
  }),
);

hrRouter.post(
  '/adjustments',
  authorize('hr:write'),
  validate({ body: adjustmentCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as AdjustmentCreateInput;
    await assertPayrollMonthOpen(input.payrollMonth);
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employee not found');
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.employeeAdjustment.create({
        data: {
          employeeId: input.employeeId,
          category: input.category,
          amount: input.amount,
          date: dateToDb(input.date),
          reason: input.reason,
          payrollMonth: input.payrollMonth,
          createdById: req.user!.id,
        },
        include: adjustmentInclude,
      });
      await recordAudit(
        {
          action: 'hr.adjustment.created',
          entityType: 'EmployeeAdjustment',
          entityId: row.id,
          after: {
            employeeId: input.employeeId,
            category: input.category,
            amount: input.amount,
            payrollMonth: input.payrollMonth,
          },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toAdjustmentDto(created));
  }),
);

hrRouter.patch(
  '/adjustments/:id',
  authorize('hr:write'),
  validate({ params: idParams, body: adjustmentUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as AdjustmentUpdateInput;
    const existing = await prisma.employeeAdjustment.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw new NotFoundError('Adjustment not found');
    await assertPayrollMonthOpen(existing.payrollMonth);
    if (input.payrollMonth && input.payrollMonth !== existing.payrollMonth) {
      await assertPayrollMonthOpen(input.payrollMonth);
    }
    if (input.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
      if (!employee) throw new NotFoundError('Employee not found');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.employeeAdjustment.update({
        where: { id: existing.id },
        data: {
          ...(input.employeeId !== undefined ? { employeeId: input.employeeId } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          ...(input.date !== undefined ? { date: dateToDb(input.date) } : {}),
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          ...(input.payrollMonth !== undefined ? { payrollMonth: input.payrollMonth } : {}),
        },
        include: adjustmentInclude,
      });
      await recordAudit(
        {
          action: 'hr.adjustment.updated',
          entityType: 'EmployeeAdjustment',
          entityId: row.id,
          before: {
            category: existing.category,
            amount: money2(Number(existing.amount)),
            payrollMonth: existing.payrollMonth,
          },
          after: {
            category: row.category,
            amount: money2(Number(row.amount)),
            payrollMonth: row.payrollMonth,
          },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(200).json(toAdjustmentDto(updated));
  }),
);

hrRouter.delete(
  '/adjustments/:id',
  authorize('hr:write'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.employeeAdjustment.findUnique({
      where: { id: req.params.id! },
      include: adjustmentInclude,
    });
    if (!existing) throw new NotFoundError('Adjustment not found');
    await assertPayrollMonthOpen(existing.payrollMonth);
    await prisma.$transaction(async (tx) => {
      await tx.employeeAdjustment.delete({ where: { id: existing.id } });
      await recordAudit(
        {
          action: 'hr.adjustment.deleted',
          entityType: 'EmployeeAdjustment',
          entityId: existing.id,
          before: {
            employeeId: existing.employeeId,
            category: existing.category,
            amount: money2(Number(existing.amount)),
            payrollMonth: existing.payrollMonth,
          },
          userId: req.user!.id,
        },
        tx,
      );
    });
    res.status(200).json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

hrRouter.get(
  '/payroll',
  authorize('hr:read'),
  validate({ query: payrollMonthQuerySchema }),
  asyncHandler(async (req, res) => {
    const { month } = req.query as unknown as { month: string };
    const [run, preview] = await Promise.all([
      prisma.payrollRun.findUnique({ where: { month }, include: { lines: true } }),
      buildPayrollRows(month),
    ]);
    res.status(200).json({
      month,
      run: run ? toPayrollRunDto(run) : null,
      preview: preview.map((row) => ({
        ...row,
        id: row.employeeId,
        paymentStatus: 'UNPAID' as const,
        paidAt: null,
      })),
      canEdit: !run || run.status === 'DRAFT',
    });
  }),
);

hrRouter.post(
  '/payroll',
  authorize('hr:payroll'),
  validate({ body: payrollGenerateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as PayrollGenerateInput;
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.payrollRun.findUnique({ where: { month: input.month } });
      if (existing) {
        throw new ConflictError(`Payroll for ${input.month} already exists.`);
      }
      const rows = await buildPayrollRows(input.month, tx);
      if (rows.length === 0) {
        throw new ConflictError('There are no active employees to include in payroll.');
      }
      const totals = rows.reduce(
        (acc, row) => ({
          basic: acc.basic + Number(row.basicSalary),
          bonus: acc.bonus + Number(row.bonusTotal),
          deduction: acc.deduction + Number(row.deductionTotal),
          net: acc.net + Number(row.netSalary),
        }),
        { basic: 0, bonus: 0, deduction: 0, net: 0 },
      );
      const run = await tx.payrollRun.create({
        data: {
          month: input.month,
          notes: input.notes ?? null,
          employeeCount: rows.length,
          basicTotal: money2(totals.basic),
          bonusTotal: money2(totals.bonus),
          deductionTotal: money2(totals.deduction),
          netTotal: money2(totals.net),
          lines: {
            create: rows.map((row) => ({
              employeeId: row.employeeId,
              employeeCode: row.employeeCode,
              employeeName: row.employeeName,
              jobTitle: row.jobTitle,
              branchName: row.branchName,
              salaryType: row.salaryType,
              basicSalary: row.basicSalary,
              payableDays: row.payableDays,
              presentDays: row.presentDays,
              absentDays: row.absentDays,
              lateMinutes: row.lateMinutes,
              attendanceDeduction: row.attendanceDeduction,
              bonusTotal: row.bonusTotal,
              deductionTotal: row.deductionTotal,
              netSalary: row.netSalary,
              breakdown: row.breakdown as unknown as Prisma.InputJsonValue,
            })),
          },
        },
        include: { lines: true },
      });
      await recordAudit(
        {
          action: 'hr.payroll.generated',
          entityType: 'PayrollRun',
          entityId: run.id,
          after: { month: run.month, employeeCount: run.employeeCount, netTotal: run.netTotal },
          userId: req.user!.id,
        },
        tx,
      );
      return run;
    });
    res.status(201).json(toPayrollRunDto(created));
  }),
);

hrRouter.post(
  '/payroll/:id/close',
  authorize('hr:payroll'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const existing = await findPayrollRun(req.params.id!);
    if (existing.status === 'CLOSED') throw new ConflictError('Payroll is already closed.');
    const closed = await prisma.$transaction(async (tx) => {
      // Recompute once more at closing so the snapshot matches the records the
      // admin just reviewed, and keep any payments already marked on draft lines.
      const previousPayments = new Map(
        existing.lines.map((line) => [
          line.employeeId,
          { paymentStatus: line.paymentStatus, paidAt: line.paidAt },
        ]),
      );
      const rows = await buildPayrollRows(existing.month, tx);
      if (rows.length === 0) {
        throw new ConflictError('There are no active employees to close payroll for.');
      }
      await tx.payrollLine.deleteMany({ where: { payrollRunId: existing.id } });
      const totals = rows.reduce(
        (acc, row) => ({
          basic: acc.basic + Number(row.basicSalary),
          bonus: acc.bonus + Number(row.bonusTotal),
          deduction: acc.deduction + Number(row.deductionTotal),
          net: acc.net + Number(row.netSalary),
        }),
        { basic: 0, bonus: 0, deduction: 0, net: 0 },
      );
      await tx.payrollLine.createMany({
        data: rows.map((row) => {
          const payment = previousPayments.get(row.employeeId);
          return {
            payrollRunId: existing.id,
            employeeId: row.employeeId,
            employeeCode: row.employeeCode,
            employeeName: row.employeeName,
            jobTitle: row.jobTitle,
            branchName: row.branchName,
            salaryType: row.salaryType,
            basicSalary: row.basicSalary,
            payableDays: row.payableDays,
            presentDays: row.presentDays,
            absentDays: row.absentDays,
            lateMinutes: row.lateMinutes,
            attendanceDeduction: row.attendanceDeduction,
            bonusTotal: row.bonusTotal,
            deductionTotal: row.deductionTotal,
            netSalary: row.netSalary,
            breakdown: row.breakdown as unknown as Prisma.InputJsonValue,
            paymentStatus: payment?.paymentStatus ?? 'UNPAID',
            paidAt: payment?.paidAt ?? null,
          };
        }),
      });
      const run = await tx.payrollRun.update({
        where: { id: existing.id },
        data: {
          status: 'CLOSED',
          employeeCount: rows.length,
          basicTotal: money2(totals.basic),
          bonusTotal: money2(totals.bonus),
          deductionTotal: money2(totals.deduction),
          netTotal: money2(totals.net),
          closedAt: new Date(),
          closedById: req.user!.id,
          closedByName: req.user!.fullName,
          reopenedAt: null,
          reopenReason: null,
        },
        include: { lines: true },
      });
      await recalculateRunPaidTotal(run.id, tx);
      await recordAudit(
        {
          action: 'hr.payroll.closed',
          entityType: 'PayrollRun',
          entityId: run.id,
          after: { month: run.month, employeeCount: run.employeeCount, netTotal: run.netTotal },
          userId: req.user!.id,
        },
        tx,
      );
      return tx.payrollRun.findUniqueOrThrow({ where: { id: run.id }, include: { lines: true } });
    });
    res.status(200).json(toPayrollRunDto(closed));
  }),
);

hrRouter.post(
  '/payroll/:id/reopen',
  authorize('hr:payroll'),
  validate({ params: idParams, body: payrollReopenSchema }),
  asyncHandler(async (req, res) => {
    const { reason } = req.body as { reason: string };
    const existing = await findPayrollRun(req.params.id!);
    if (existing.status !== 'CLOSED') throw new ConflictError('Only closed payroll can be reopened.');
    const reopened = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.update({
        where: { id: existing.id },
        data: {
          status: 'DRAFT',
          reopenedAt: new Date(),
          reopenReason: reason,
          closedAt: null,
          closedById: null,
          closedByName: null,
        },
        include: { lines: true },
      });
      await recordAudit(
        {
          action: 'hr.payroll.reopened',
          entityType: 'PayrollRun',
          entityId: run.id,
          before: { status: 'CLOSED', month: run.month },
          after: { status: 'DRAFT', reason },
          userId: req.user!.id,
        },
        tx,
      );
      return run;
    });
    res.status(200).json(toPayrollRunDto(reopened));
  }),
);

hrRouter.patch(
  '/payroll/:id/lines/:lineId/payment',
  authorize('hr:payroll'),
  validate({ params: lineParams, body: payrollPaymentSchema }),
  asyncHandler(async (req, res) => {
    const { status } = req.body as PayrollPaymentInput;
    const run = await findPayrollRun(req.params.id!);
    if (run.status !== 'CLOSED') {
      throw new ConflictError('Close the payroll before marking salaries as paid.');
    }
    const line = run.lines.find((candidate) => candidate.id === req.params.lineId);
    if (!line) throw new NotFoundError('Payroll line not found');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.payrollLine.update({
        where: { id: line.id },
        data: { paymentStatus: status, paidAt: status === 'PAID' ? new Date() : null },
      });
      await recalculateRunPaidTotal(run.id, tx);
      await recordAudit(
        {
          action: 'hr.payroll.payment',
          entityType: 'PayrollLine',
          entityId: row.id,
          before: { status: line.paymentStatus },
          after: { status, employeeId: line.employeeId, month: run.month },
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    res.status(200).json(toPayrollLineDto(updated));
  }),
);

// ---------------------------------------------------------------------------
// Settings & dashboard
// ---------------------------------------------------------------------------

hrRouter.get(
  '/settings',
  authorize('hr:read'),
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getHrSettings());
  }),
);

hrRouter.patch(
  '/settings',
  authorize('hr:write'),
  validate({ body: hrSettingsUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as HrSettingsUpdateInput;
    await prisma.$transaction(async (tx) => {
      const row = await tx.hrSettings.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          workStart: input.workStart,
          workEnd: input.workEnd,
          graceMinutes: input.graceMinutes,
          lateDeductionPerMinute: input.lateDeductionPerMinute,
          absenceDeductionMultiplier: input.absenceDeductionMultiplier,
          weeklyDaysOff: input.weeklyDaysOff,
        },
        update: {
          workStart: input.workStart,
          workEnd: input.workEnd,
          graceMinutes: input.graceMinutes,
          lateDeductionPerMinute: input.lateDeductionPerMinute,
          absenceDeductionMultiplier: input.absenceDeductionMultiplier,
          weeklyDaysOff: input.weeklyDaysOff,
        },
      });
      await recordAudit(
        {
          action: 'hr.settings.updated',
          entityType: 'HrSettings',
          entityId: row.id,
          after: input,
          userId: req.user!.id,
        },
        tx,
      );
      return row;
    });
    const settings = await getHrSettings();
    res.status(200).json(settings);
  }),
);

hrRouter.get(
  '/dashboard',
  authorize('hr:read'),
  asyncHandler(async (_req, res) => {
    const today = todayInBusinessTimezone();
    const month = today.slice(0, 7);
    const [activeEmployees, todayRows, run, unpaid] = await Promise.all([
      prisma.employee.count({ where: { status: 'ACTIVE' } }),
      prisma.attendanceRecord.findMany({
        where: { date: parseDateOnly(today) },
        select: { status: true, lateMinutes: true },
      }),
      prisma.payrollRun.findUnique({ where: { month }, select: { netTotal: true } }),
      prisma.payrollLine.aggregate({
        where: { paymentStatus: 'UNPAID', payrollRun: { status: 'CLOSED' } },
        _sum: { netSalary: true },
        _count: true,
      }),
    ]);
    const preview = run ? null : await buildPayrollRows(month);
    const monthlyPayroll = run
      ? Number(run.netTotal)
      : (preview ?? []).reduce((sum, row) => sum + Number(row.netSalary), 0);
    res.status(200).json({
      activeEmployees,
      presentToday: todayRows.filter(
        (row) => row.status === 'PRESENT' || row.status === 'LATE',
      ).length,
      absentToday: todayRows.filter((row) => row.status === 'ABSENT').length,
      lateToday: todayRows.filter((row) => row.lateMinutes > 0).length,
      monthlyPayroll: monthlyPayroll.toFixed(2),
      unpaidSalaries: Number(unpaid._sum.netSalary ?? 0).toFixed(2),
      unpaidCount: unpaid._count,
      currentMonth: month,
    });
  }),
);

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

type ShiftRow = Prisma.HrShiftGetPayload<{ include: { _count: { select: { employees: true } } } }>;

function toShiftDto(row: ShiftRow, language: string): HrShiftDto {
  return {
    id: row.id,
    name: language === 'ar' && row.nameAr ? row.nameAr : row.name,
    nameEn: row.name,
    nameAr: row.nameAr,
    startTime: row.startTime,
    endTime: row.endTime,
    graceMinutes: row.graceMinutes,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    employeeCount: row._count.employees,
  };
}

const shiftCount = { _count: { select: { employees: true } } } as const;

hrRouter.get(
  '/shifts',
  authorize('hr:read'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.hrShift.findMany({
      include: shiftCount,
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
    });
    res.status(200).json(rows.map((row) => toShiftDto(row, currentLanguage())));
  }),
);

hrRouter.post(
  '/shifts',
  authorize('hr:write'),
  validate({ body: hrShiftInputSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as HrShiftInput;
    const clash = await prisma.hrShift.findUnique({ where: { name: input.name } });
    if (clash) throw new ConflictError('A shift with that name already exists');
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.hrShift.create({
        data: {
          name: input.name,
          nameAr: input.nameAr ?? null,
          startTime: input.startTime,
          endTime: input.endTime,
          graceMinutes: input.graceMinutes ?? null,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
        include: shiftCount,
      });
      await recordAudit(
        {
          action: 'hr.shift.created',
          entityType: 'HrShift',
          entityId: created.id,
          after: { name: created.name, startTime: created.startTime, endTime: created.endTime },
          userId: req.user!.id,
        },
        tx,
      );
      return created;
    });
    res.status(201).json(toShiftDto(row, currentLanguage()));
  }),
);

hrRouter.put(
  '/shifts/:id',
  authorize('hr:write'),
  validate({ params: idParams, body: hrShiftInputSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as HrShiftInput;
    const existing = await prisma.hrShift.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw new NotFoundError('Shift not found');
    if (input.name !== existing.name) {
      const clash = await prisma.hrShift.findUnique({ where: { name: input.name } });
      if (clash) throw new ConflictError('A shift with that name already exists');
    }
    // Saved attendance keeps its late minutes; new records use the new times.
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.hrShift.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          nameAr: input.nameAr ?? null,
          startTime: input.startTime,
          endTime: input.endTime,
          graceMinutes: input.graceMinutes ?? null,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
        include: shiftCount,
      });
      await recordAudit(
        {
          action: 'hr.shift.updated',
          entityType: 'HrShift',
          entityId: updated.id,
          before: { name: existing.name, startTime: existing.startTime, endTime: existing.endTime },
          after: { name: updated.name, startTime: updated.startTime, endTime: updated.endTime },
          userId: req.user!.id,
        },
        tx,
      );
      return updated;
    });
    res.status(200).json(toShiftDto(row, currentLanguage()));
  }),
);

hrRouter.delete(
  '/shifts/:id',
  authorize('hr:write'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.hrShift.findUnique({
      where: { id: req.params.id! },
      include: { _count: { select: { employees: true, attendance: true } } },
    });
    if (!existing) throw new NotFoundError('Shift not found');
    if (existing._count.employees > 0 || existing._count.attendance > 0) {
      throw new ConflictError(
        'This shift is assigned to employees or attendance records. Switch it off instead.',
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.hrShift.delete({ where: { id: existing.id } });
      await recordAudit(
        {
          action: 'hr.shift.deleted',
          entityType: 'HrShift',
          entityId: existing.id,
          before: { name: existing.name },
          userId: req.user!.id,
        },
        tx,
      );
    });
    res.status(200).json({ ok: true });
  }),
);
