import type { Prisma } from '@prisma/client';
import {
  BONUS_CATEGORIES,
  DEDUCTION_CATEGORIES,
  HR_DEFAULTS,
  type AttendanceDto,
  type AdjustmentDto,
  type EmployeeDto,
  type HrSettingsDto,
  type PayrollBreakdown,
  type PayrollLineDto,
  type PayrollRunDto,
  type PayrollStatus,
} from '@posshope/shared';
import { parseDateOnly, toDateOnly, todayInBusinessTimezone } from '../../lib/dates.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { prisma } from '../../prisma.js';

export type Db = typeof prisma | Prisma.TransactionClient;

export const employeeInclude = {
  branch: { select: { name: true } },
  shift: { select: { name: true } },
} satisfies Prisma.EmployeeInclude;
type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export const attendanceInclude = {
  employee: { select: { employeeCode: true, fullName: true } },
  shift: { select: { name: true } },
} satisfies Prisma.AttendanceRecordInclude;
type AttendanceRow = Prisma.AttendanceRecordGetPayload<{ include: typeof attendanceInclude }>;

export const adjustmentInclude = {
  employee: { select: { employeeCode: true, fullName: true } },
} satisfies Prisma.EmployeeAdjustmentInclude;
type AdjustmentRow = Prisma.EmployeeAdjustmentGetPayload<{ include: typeof adjustmentInclude }>;

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: number): string => round2(value).toFixed(2);

export function payrollMonthOf(date: Date | string): string {
  return toDateOnly(date).slice(0, 7);
}

export function currentPayrollMonth(): string {
  return todayInBusinessTimezone().slice(0, 7);
}

export function monthRange(month: string): { from: Date; to: Date; days: number } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const from = new Date(Date.UTC(year, monthNumber - 1, 1));
  const to = new Date(Date.UTC(year, monthNumber, 1));
  return { from, to, days: new Date(Date.UTC(year, monthNumber, 0)).getUTCDate() };
}

/** Worked days exclude the configured weekly days off. */
export function scheduledDaysInMonth(month: string, weeklyDaysOff: readonly number[]): number {
  const { days } = monthRange(month);
  let count = 0;
  for (let day = 1; day <= days; day += 1) {
    const weekday = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, day)).getUTCDay();
    if (!weeklyDaysOff.includes(weekday)) count += 1;
  }
  return count;
}

export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** Shift timing used for lateness; null fields fall back to HR Settings. */
export interface ShiftTiming {
  startTime: string;
  endTime: string;
  graceMinutes: number | null;
}

/**
 * Minutes late against the shift start (or the HR Settings work start) plus
 * grace. For a shift that runs past midnight, a check-in after midnight is
 * counted as late into the same shift rather than as early for the next day.
 */
export function computeLateMinutes(
  checkIn: string | null | undefined,
  settings: HrSettingsDto,
  shift?: ShiftTiming | null,
): number {
  if (!checkIn) return 0;
  const start = minutesOfDay(shift?.startTime ?? settings.workStart);
  const grace = shift?.graceMinutes ?? settings.graceMinutes;
  let late = minutesOfDay(checkIn) - (start + grace);
  const overnight = shift ? minutesOfDay(shift.endTime) <= start : false;
  if (overnight && late < -12 * 60) late += 24 * 60;
  return Math.max(0, late);
}

export async function getHrSettings(client: Db = prisma): Promise<HrSettingsDto> {
  const existing = await client.hrSettings.findUnique({ where: { id: 'default' } });
  const row =
    existing ??
    (await client.hrSettings.create({
      data: {
        id: 'default',
        workStart: HR_DEFAULTS.workStart,
        workEnd: HR_DEFAULTS.workEnd,
        graceMinutes: HR_DEFAULTS.graceMinutes,
        lateDeductionPerMinute: HR_DEFAULTS.lateDeductionPerMinute,
        absenceDeductionMultiplier: HR_DEFAULTS.absenceDeductionMultiplier,
        weeklyDaysOff: [...HR_DEFAULTS.weeklyDaysOff],
      },
    }));
  return {
    workStart: row.workStart,
    workEnd: row.workEnd,
    graceMinutes: row.graceMinutes,
    lateDeductionPerMinute: money(Number(row.lateDeductionPerMinute)),
    absenceDeductionMultiplier: Number(row.absenceDeductionMultiplier).toFixed(2),
    weeklyDaysOff: row.weeklyDaysOff,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Closed payroll is immutable; edits to that month must reopen it first. */
export async function assertPayrollMonthOpen(month: string, client: Db = prisma): Promise<void> {
  const run = await client.payrollRun.findUnique({
    where: { month },
    select: { status: true },
  });
  if (run?.status === 'CLOSED') {
    throw new ConflictError(
      `Payroll for ${month} is closed. Reopen it from the Payroll page before editing.`,
    );
  }
}

export async function nextEmployeeCode(client: Db = prisma): Promise<string> {
  const last = await client.employee.findFirst({
    orderBy: { employeeCode: 'desc' },
    select: { employeeCode: true },
  });
  const current = last ? Number(last.employeeCode.replace(/\D/gu, '')) : 0;
  return `EMP-${String(current + 1).padStart(4, '0')}`;
}

export function toEmployeeDto(employee: EmployeeRow): EmployeeDto {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    phone: employee.phone,
    jobTitle: employee.jobTitle,
    branchId: employee.branchId,
    branchName: employee.branch?.name ?? null,
    hireDate: toDateOnly(employee.hireDate),
    basicSalary: Number(employee.basicSalary).toFixed(2),
    salaryType: employee.salaryType,
    status: employee.status,
    shiftId: employee.shiftId,
    shiftName: employee.shift?.name ?? null,
    createdAt: employee.createdAt.toISOString(),
  };
}

export function toAttendanceDto(row: AttendanceRow): AttendanceDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeCode: row.employee.employeeCode,
    employeeName: row.employee.fullName,
    date: toDateOnly(row.date),
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    status: row.status,
    lateMinutes: row.lateMinutes,
    note: row.note,
    shiftId: row.shiftId,
    shiftName: row.shift?.name ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdjustmentDto(row: AdjustmentRow): AdjustmentDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeCode: row.employee.employeeCode,
    employeeName: row.employee.fullName,
    category: row.category,
    amount: Number(row.amount).toFixed(2),
    date: toDateOnly(row.date),
    reason: row.reason,
    payrollMonth: row.payrollMonth,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ComputedPayrollRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string;
  branchName: string | null;
  salaryType: EmployeeDto['salaryType'];
  basicSalary: string;
  payableDays: number;
  presentDays: number;
  absentDays: number;
  lateMinutes: number;
  attendanceDeduction: string;
  bonusTotal: string;
  deductionTotal: string;
  netSalary: string;
  breakdown: PayrollBreakdown;
}

/**
 * Salary math for one payroll month.
 *
 * Monthly staff earn the full basic salary; recorded absences and late minutes
 * are deducted using the configured rules. Daily staff are paid only for the
 * days actually marked present or late, so absences are unpaid rather than
 * deducted twice. Manual deductions and bonuses from the month are applied last.
 */
export async function buildPayrollRows(
  month: string,
  client: Db = prisma,
  settings?: HrSettingsDto,
): Promise<ComputedPayrollRow[]> {
  const hr = settings ?? (await getHrSettings(client));
  const { from, to } = monthRange(month);
  const employees = await client.employee.findMany({
    where: { status: 'ACTIVE' },
    include: employeeInclude,
    orderBy: [{ fullName: 'asc' }],
  });
  const [attendance, adjustments] = await Promise.all([
    client.attendanceRecord.findMany({
      where: { date: { gte: from, lt: to }, employee: { status: 'ACTIVE' } },
    }),
    client.employeeAdjustment.findMany({
      where: { payrollMonth: month, employee: { status: 'ACTIVE' } },
      orderBy: { date: 'asc' },
    }),
  ]);
  const scheduledDays = scheduledDaysInMonth(month, hr.weeklyDaysOff);
  const lateRate = Number(hr.lateDeductionPerMinute);
  const absenceMultiplier = Number(hr.absenceDeductionMultiplier);

  return employees.map((employee) => {
    const rows = attendance.filter((record) => record.employeeId === employee.id);
    const entries = adjustments.filter((adjustment) => adjustment.employeeId === employee.id);
    const presentDays = rows.filter(
      (record) => record.status === 'PRESENT' || record.status === 'LATE',
    ).length;
    const absentDays = rows.filter((record) => record.status === 'ABSENT').length;
    const lateMinutes = rows.reduce((sum, record) => sum + record.lateMinutes, 0);
    const basic = Number(employee.basicSalary);
    const dailyRate =
      employee.salaryType === 'MONTHLY' ? basic / Math.max(scheduledDays, 1) : basic;

    const grossPay = employee.salaryType === 'MONTHLY' ? basic : dailyRate * presentDays;
    const lateDeduction = round2(lateMinutes * lateRate);
    const absenceDeduction =
      employee.salaryType === 'MONTHLY'
        ? round2(absentDays * dailyRate * absenceMultiplier)
        : 0;
    const adjustmentBonuses = entries
      .filter((entry) => BONUS_CATEGORIES.includes(entry.category))
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const adjustmentDeductions = entries
      .filter((entry) => DEDUCTION_CATEGORIES.includes(entry.category))
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const attendanceDeduction = round2(lateDeduction + absenceDeduction);
    const deductionTotal = round2(attendanceDeduction + adjustmentDeductions);
    const rawNet = round2(grossPay + adjustmentBonuses - deductionTotal);
    const netSalary = Math.max(0, rawNet);
    const notes: string[] = [];
    if (rawNet < 0) notes.push('Deductions exceeded earnings; net salary was capped at zero.');
    if (employee.salaryType === 'DAILY') {
      notes.push(`Daily rate applied to ${presentDays} payable day(s).`);
    }

    const breakdown: PayrollBreakdown = {
      scheduledDays,
      presentDays,
      absentDays,
      lateMinutes,
      dailyRate: money(dailyRate),
      grossPay: money(grossPay),
      lateDeduction: money(lateDeduction),
      absenceDeduction: money(absenceDeduction),
      attendanceDeduction: money(attendanceDeduction),
      adjustmentDeductions: money(adjustmentDeductions),
      adjustmentBonuses: money(adjustmentBonuses),
      adjustments: entries.map((entry) => ({
        id: entry.id,
        category: entry.category,
        amount: Number(entry.amount).toFixed(2),
        reason: entry.reason,
        date: toDateOnly(entry.date),
      })),
      notes,
    };

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      jobTitle: employee.jobTitle,
      branchName: employee.branch?.name ?? null,
      salaryType: employee.salaryType,
      basicSalary: money(basic),
      payableDays:
        employee.salaryType === 'MONTHLY' ? Math.max(0, scheduledDays - absentDays) : presentDays,
      presentDays,
      absentDays,
      lateMinutes,
      attendanceDeduction: money(attendanceDeduction),
      bonusTotal: money(adjustmentBonuses),
      deductionTotal: money(deductionTotal),
      netSalary: money(netSalary),
      breakdown,
    };
  });
}

interface PayrollLineRow {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string;
  branchName: string | null;
  salaryType: EmployeeDto['salaryType'];
  basicSalary: Prisma.Decimal;
  payableDays: Prisma.Decimal;
  presentDays: number;
  absentDays: number;
  lateMinutes: number;
  attendanceDeduction: Prisma.Decimal;
  bonusTotal: Prisma.Decimal;
  deductionTotal: Prisma.Decimal;
  netSalary: Prisma.Decimal;
  paymentStatus: PayrollLineDto['paymentStatus'];
  paidAt: Date | null;
  breakdown: Prisma.JsonValue;
}

export function toPayrollLineDto(line: PayrollLineRow): PayrollLineDto {
  return {
    id: line.id,
    employeeId: line.employeeId,
    employeeCode: line.employeeCode,
    employeeName: line.employeeName,
    jobTitle: line.jobTitle,
    branchName: line.branchName,
    salaryType: line.salaryType,
    basicSalary: Number(line.basicSalary).toFixed(2),
    payableDays: Number(line.payableDays),
    presentDays: line.presentDays,
    absentDays: line.absentDays,
    lateMinutes: line.lateMinutes,
    attendanceDeduction: Number(line.attendanceDeduction).toFixed(2),
    bonusTotal: Number(line.bonusTotal).toFixed(2),
    deductionTotal: Number(line.deductionTotal).toFixed(2),
    netSalary: Number(line.netSalary).toFixed(2),
    paymentStatus: line.paymentStatus,
    paidAt: line.paidAt?.toISOString() ?? null,
    breakdown: line.breakdown as unknown as PayrollBreakdown,
  };
}

type PayrollRunRow = Prisma.PayrollRunGetPayload<{ include: { lines: true } }>;

export function toPayrollRunDto(run: PayrollRunRow): PayrollRunDto {
  return {
    id: run.id,
    month: run.month,
    status: run.status,
    employeeCount: run.employeeCount,
    basicTotal: Number(run.basicTotal).toFixed(2),
    bonusTotal: Number(run.bonusTotal).toFixed(2),
    deductionTotal: Number(run.deductionTotal).toFixed(2),
    netTotal: Number(run.netTotal).toFixed(2),
    paidTotal: Number(run.paidTotal).toFixed(2),
    createdAt: run.createdAt.toISOString(),
    closedAt: run.closedAt?.toISOString() ?? null,
    closedBy: run.closedByName,
    reopenedAt: run.reopenedAt?.toISOString() ?? null,
    reopenReason: run.reopenReason,
    lines: [...run.lines]
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName))
      .map(toPayrollLineDto),
  };
}

export async function findPayrollRun(id: string): Promise<PayrollRunRow> {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!run) throw new NotFoundError('Payroll run not found');
  return run;
}

export async function recalculateRunPaidTotal(runId: string, client: Db = prisma): Promise<void> {
  const paid = await client.payrollLine.aggregate({
    where: { payrollRunId: runId, paymentStatus: 'PAID' },
    _sum: { netSalary: true },
  });
  await client.payrollRun.update({
    where: { id: runId },
    data: { paidTotal: paid._sum.netSalary ?? 0 },
  });
}

export function payrollStatusLabel(status: PayrollStatus): string {
  return status === 'CLOSED' ? 'Closed' : 'Draft';
}

export function dateToDb(value: string): Date {
  return parseDateOnly(value);
}
