import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import {
  EXPENSE_CATEGORIES,
  type BranchDto,
  type ExpenseCategory,
  type ExpenseCreateInput,
  type ExpenseDto,
} from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { todayIso } from '../../lib/format';
import { useI18n, type TranslationKey } from '../../i18n';

export function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  branches,
  defaultBranchId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseDto | null;
  branches: BranchDto[];
  defaultBranchId?: string;
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [category, setCategory] = useState<ExpenseCategory>('RENT');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [branchId, setBranchId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setCategory(expense?.category ?? 'RENT');
    setDescription(expense?.description ?? '');
    setAmount(expense?.amount ?? '');
    setExpenseDate(expense?.expenseDate ?? todayIso());
    setBranchId(expense?.branchId ?? defaultBranchId ?? branches[0]?.id ?? '');
    setNotes(expense?.notes ?? '');
  }, [open, expense, defaultBranchId, branches]);

  const valid =
    description.trim().length >= 2 && Number(amount) > 0 && expenseDate.length === 10;

  const mutation = useMutation({
    mutationFn: () => {
      if (description.trim().length < 2) throw new Error(t('expenses.validation.description'));
      if (!(Number(amount) > 0)) throw new Error(t('expenses.validation.amount'));
      if (!expenseDate) throw new Error(t('expenses.validation.date'));
      const body: ExpenseCreateInput = {
        category,
        description: description.trim(),
        amount: Number(amount).toFixed(2),
        expenseDate,
        branchId: branchId || undefined,
        notes: notes.trim() || undefined,
      };
      return expense ? api.expenses.update(expense.id, body) : api.expenses.create(body);
    },
    onSuccess: () => {
      toast.success(expense ? t('expenses.toast.updated') : t('expenses.toast.created'));
      onSaved();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('expenses.error')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={expense ? t('expenses.form.editTitle') : t('expenses.form.newTitle')}
        className="max-w-lg"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="expense-category" className="text-xs">
              {t('expenses.form.category')}
            </Label>
            <Select
              id="expense-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
              className="mt-1.5"
            >
              {EXPENSE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`expenses.categories.${value}` as TranslationKey)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="expense-date" className="text-xs">
              {t('expenses.form.date')}
            </Label>
            <Input
              id="expense-date"
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="expense-description" className="text-xs">
              {t('expenses.form.description')}
            </Label>
            <Input
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('expenses.form.descriptionPlaceholder')}
              maxLength={160}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="expense-amount" className="text-xs">
              {t('expenses.form.amount')}
            </Label>
            <Input
              id="expense-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1.5"
              dir="ltr"
            />
          </div>
          <div>
            <Label htmlFor="expense-branch" className="text-xs">
              {t('expenses.form.branch')}
            </Label>
            <Select
              id="expense-branch"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="mt-1.5"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="expense-notes" className="text-xs">
              {t('expenses.form.notes')}
            </Label>
            <Textarea
              id="expense-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('expenses.form.notesPlaceholder')}
              className="mt-1.5 min-h-[60px]"
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('actions.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !valid}>
            {mutation.isPending
              ? t('actions.saving')
              : expense
                ? t('expenses.form.save')
                : t('expenses.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
