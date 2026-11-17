-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('MONTHLY', 'DAILY');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'DAY_OFF');

-- CreateEnum
CREATE TYPE "AdjustmentCategory" AS ENUM ('LATE_ARRIVAL', 'ABSENCE', 'OTHER_DEDUCTION', 'PERFORMANCE_BONUS', 'OVERTIME', 'OTHER_BONUS');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayrollPaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "jobTitle" TEXT NOT NULL,
    "branchId" TEXT,
    "hireDate" DATE NOT NULL,
    "basicSalary" DECIMAL(12,2) NOT NULL,
    "salaryType" "SalaryType" NOT NULL DEFAULT 'MONTHLY',
    "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TEXT,
    "checkOut" TEXT,
    "status" "AttendanceStatus" NOT NULL,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_adjustments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" "AdjustmentCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "payrollMonth" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "employeeCount" INTEGER NOT NULL,
    "basicTotal" DECIMAL(12,2) NOT NULL,
    "bonusTotal" DECIMAL(12,2) NOT NULL,
    "deductionTotal" DECIMAL(12,2) NOT NULL,
    "netTotal" DECIMAL(12,2) NOT NULL,
    "paidTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedByName" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "branchName" TEXT,
    "salaryType" "SalaryType" NOT NULL,
    "basicSalary" DECIMAL(12,2) NOT NULL,
    "payableDays" DECIMAL(8,2) NOT NULL,
    "presentDays" INTEGER NOT NULL,
    "absentDays" INTEGER NOT NULL,
    "lateMinutes" INTEGER NOT NULL,
    "attendanceDeduction" DECIMAL(12,2) NOT NULL,
    "bonusTotal" DECIMAL(12,2) NOT NULL,
    "deductionTotal" DECIMAL(12,2) NOT NULL,
    "netSalary" DECIMAL(12,2) NOT NULL,
    "paymentStatus" "PayrollPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "workStart" TEXT NOT NULL DEFAULT '09:00',
    "workEnd" TEXT NOT NULL DEFAULT '17:00',
    "graceMinutes" INTEGER NOT NULL DEFAULT 10,
    "lateDeductionPerMinute" DECIMAL(10,2) NOT NULL DEFAULT 5,
    "absenceDeductionMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "weeklyDaysOff" INTEGER[] DEFAULT ARRAY[5, 6]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeCode_key" ON "employees"("employeeCode");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_branchId_idx" ON "employees"("branchId");

-- CreateIndex
CREATE INDEX "employees_fullName_idx" ON "employees"("fullName");

-- CreateIndex
CREATE INDEX "attendance_records_date_idx" ON "attendance_records"("date");

-- CreateIndex
CREATE INDEX "attendance_records_employeeId_date_idx" ON "attendance_records"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employeeId_date_key" ON "attendance_records"("employeeId", "date");

-- CreateIndex
CREATE INDEX "employee_adjustments_employeeId_payrollMonth_idx" ON "employee_adjustments"("employeeId", "payrollMonth");

-- CreateIndex
CREATE INDEX "employee_adjustments_payrollMonth_idx" ON "employee_adjustments"("payrollMonth");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_month_key" ON "payroll_runs"("month");

-- CreateIndex
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

-- CreateIndex
CREATE INDEX "payroll_lines_employeeId_idx" ON "payroll_lines"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_payrollRunId_employeeId_key" ON "payroll_lines"("payrollRunId", "employeeId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_adjustments" ADD CONSTRAINT "employee_adjustments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
