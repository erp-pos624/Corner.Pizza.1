import type {
  AdjustmentCategory,
  AttendanceStatus,
  EmploymentStatus,
  PayrollLineDto,
  PayrollPaymentStatus,
  SalaryType,
} from '@posshope/shared';
import { translate, type TranslationKey } from '../i18n/dictionaries';
import { getActiveLanguage } from './language';
import { formatDate, formatMonthKey, formatMoney, todayIso } from './format';
import { downloadPdf } from './export';

const SALARY_TYPE_KEYS: Record<SalaryType, TranslationKey> = {
  MONTHLY: 'hr.employees.salaryTypeMonthly',
  DAILY: 'hr.employees.salaryTypeDaily',
};

const EMPLOYMENT_STATUS_KEYS: Record<EmploymentStatus, TranslationKey> = {
  ACTIVE: 'hr.employees.statusActive',
  INACTIVE: 'hr.employees.statusInactive',
};

const ATTENDANCE_STATUS_KEYS: Record<AttendanceStatus, TranslationKey> = {
  PRESENT: 'hr.attendance.statusPresent',
  ABSENT: 'hr.attendance.statusAbsent',
  LATE: 'hr.attendance.statusLate',
  DAY_OFF: 'hr.attendance.statusDayOff',
};

const ADJUSTMENT_CATEGORY_KEYS: Record<AdjustmentCategory, TranslationKey> = {
  LATE_ARRIVAL: 'hr.adjustments.categoryLateArrival',
  ABSENCE: 'hr.adjustments.categoryAbsence',
  OTHER_DEDUCTION: 'hr.adjustments.categoryOtherDeduction',
  PERFORMANCE_BONUS: 'hr.adjustments.categoryPerformanceBonus',
  OVERTIME: 'hr.adjustments.categoryOvertime',
  OTHER_BONUS: 'hr.adjustments.categoryOtherBonus',
};

const PAYMENT_STATUS_KEYS: Record<PayrollPaymentStatus, TranslationKey> = {
  PAID: 'hr.payroll.paymentPaid',
  UNPAID: 'hr.payroll.paymentUnpaid',
};

export function salaryTypeLabel(type: SalaryType): string {
  return translate(getActiveLanguage(), SALARY_TYPE_KEYS[type]);
}

export function employmentStatusLabel(status: EmploymentStatus): string {
  return translate(getActiveLanguage(), EMPLOYMENT_STATUS_KEYS[status]);
}

export function attendanceStatusLabel(status: AttendanceStatus): string {
  return translate(getActiveLanguage(), ATTENDANCE_STATUS_KEYS[status]);
}

export function adjustmentCategoryLabel(category: AdjustmentCategory): string {
  return translate(getActiveLanguage(), ADJUSTMENT_CATEGORY_KEYS[category]);
}

export function payrollPaymentLabel(status: PayrollPaymentStatus): string {
  return translate(getActiveLanguage(), PAYMENT_STATUS_KEYS[status]);
}

/** Current payroll month (`YYYY-MM`) in the restaurant business timezone. */
export function currentMonthKey(): string {
  return todayIso().slice(0, 7);
}

export function monthLabel(month: string): string {
  return formatMonthKey(month);
}

/** `09:25` -> `565`. */
export function minutesOfDay(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})$/u.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Same rule as the server: minutes after start + grace. Pass the shift end so
 * a check-in after midnight on an overnight shift counts as late, not early.
 */
export function computeLatePreview(
  checkIn: string | null | undefined,
  workStart: string,
  graceMinutes: number,
  workEnd?: string | null,
): number {
  const arrived = minutesOfDay(checkIn);
  const start = minutesOfDay(workStart);
  if (arrived === null || start === null) return 0;
  let late = arrived - start - graceMinutes;
  const end = minutesOfDay(workEnd ?? null);
  if (end !== null && end <= start && late < -12 * 60) late += 24 * 60;
  return Math.max(0, late);
}

function payslipFileName(line: PayrollLineDto, month: string): string {
  const safeCode = line.employeeCode.replace(/[^\w-]/gu, '');
  return `payslip-${safeCode}-${month}`;
}

/** A4 payslip PDF with the month summary and the calculation breakdown. */
export async function downloadPayslip(line: PayrollLineDto, month: string): Promise<void> {
  const language = getActiveLanguage();
  const t = (key: TranslationKey, vars?: Record<string, string | number>): string =>
    translate(language, key, vars);
  const money = (value: string): string => formatMoney(value);
  const payment =
    line.paymentStatus === 'PAID' ? t('hr.payslip.paid') : t('hr.payslip.unpaid');

  await downloadPdf(payslipFileName(line, month), {
    title: t('hr.payslip.title'),
    subtitle: `${line.employeeName} · ${line.employeeCode}`,
    meta: [
      { label: t('hr.payslip.month'), value: formatMonthKey(month) },
      { label: t('hr.payslip.jobTitle'), value: line.jobTitle },
      { label: t('hr.payslip.status'), value: payment },
      ...(line.branchName ? [{ label: t('hr.employees.branch'), value: line.branchName }] : []),
    ],
    sections: [
      {
        heading: t('hr.payroll.breakdownGross'),
        headers: [t('hr.payslip.employee'), t('hr.payslip.title')],
        rows: [
          [t('hr.payslip.basicSalary'), money(line.basicSalary)],
          [t('hr.payslip.bonuses'), money(line.bonusTotal)],
          [t('hr.payslip.deductions'), money(line.deductionTotal)],
          [t('hr.payroll.breakdownAttendance'), money(line.attendanceDeduction)],
          [t('hr.payslip.net'), money(line.netSalary)],
        ],
        columnAlign: ['left', 'right'],
      },
      {
        heading: t('hr.payslip.attendance'),
        headers: [t('hr.payslip.attendance'), ''],
        rows: [
          [t('hr.payslip.presentDays'), line.presentDays],
          [t('hr.payslip.absentDays'), line.absentDays],
          [t('hr.payslip.lateMinutes'), line.lateMinutes],
          [t('hr.payroll.breakdownScheduledDays'), line.breakdown.scheduledDays],
        ],
        columnAlign: ['left', 'right'],
      },
      ...(line.breakdown.adjustments.length > 0
        ? [
            {
              heading: t('hr.payroll.breakdownAdjustments'),
              headers: [
                t('hr.adjustments.category'),
                t('hr.adjustments.amount'),
                t('hr.adjustments.date'),
              ],
              rows: line.breakdown.adjustments.map((adjustment) => [
                adjustmentCategoryLabel(adjustment.category),
                money(adjustment.amount),
                formatDate(adjustment.date),
              ]),
              columnAlign: ['left', 'right', 'left'] as Array<'left' | 'right' | 'center'>,
            },
          ]
        : []),
    ],
    footer: `${t('hr.payslip.generated', { date: formatDate(new Date()) })} · Corner Pizza`,
  });
}
