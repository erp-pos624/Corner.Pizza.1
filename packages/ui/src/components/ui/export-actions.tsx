import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useI18n } from '../../i18n';
import { Button } from './button';
import { toast } from './toast';

type ExportKind = 'csv' | 'excel' | 'pdf';

export function ExportActions({
  csv,
  excel,
  pdf,
  disabled = false,
}: {
  csv?: () => Promise<void> | void;
  excel?: () => Promise<void> | void;
  pdf?: () => Promise<void> | void;
  disabled?: boolean;
}): ReactElement {
  const { t } = useI18n();
  const [busy, setBusy] = useState<ExportKind | null>(null);

  const run = async (
    kind: ExportKind,
    handler: () => Promise<void> | void,
  ): Promise<void> => {
    if (busy) return;
    setBusy(kind);
    try {
      await handler();
      toast.success(t('export.done'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('export.failed'));
    } finally {
      setBusy(null);
    }
  };

  const buttons: Array<{
    kind: ExportKind;
    label: string;
    icon: typeof FileText;
    handler?: () => Promise<void> | void;
  }> = [
    { kind: 'csv', label: t('export.csv'), icon: FileText, handler: csv },
    { kind: 'excel', label: t('export.excel'), icon: FileSpreadsheet, handler: excel },
    { kind: 'pdf', label: t('export.pdf'), icon: FileDown, handler: pdf },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {buttons.map(({ kind, label, icon: Icon, handler }) =>
        handler ? (
          <Button
            key={kind}
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void run(kind, handler)}
            disabled={disabled || busy !== null}
          >
            <Icon className="h-3.5 w-3.5" />
            {busy === kind ? t('export.busy') : label}
          </Button>
        ) : null,
      )}
    </div>
  );
}
