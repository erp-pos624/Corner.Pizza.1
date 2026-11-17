import { Pencil, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { CategoryDto } from '@posshope/shared';
import type { MenuManagement } from '../../hooks/useMenuManagement';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { StatusBadge } from '../ui/status-badge';
import { Toggle } from '../ui/toggle';

interface CategoriesTabProps {
  menu: MenuManagement;
  onAdd: () => void;
  onEdit: (category: CategoryDto) => void;
}

export function CategoriesTab({ menu, onAdd, onEdit }: CategoriesTabProps): ReactElement {
  const { t } = useI18n();
  const { categories, toggleCategory, requestDelete } = menu;

  if (categories.isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={t('menu.loading.categories')}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-2.5 w-full" />
              </div>
              <Skeleton radius="full" className="h-5 w-14 shrink-0" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-2.5 w-10" />
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
              <Skeleton radius="full" className="h-5 w-9" />
              <Skeleton radius="lg" className="ms-auto h-8 w-16" />
              <Skeleton radius="lg" className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (categories.isError) {
    return (
      <ErrorState
        title={t('menu.errors.categories')}
        message={categories.error instanceof Error ? categories.error.message : undefined}
        onRetry={() => void categories.refetch()}
      />
    );
  }

  if ((categories.data ?? []).length === 0) {
    return (
      <EmptyPanel
        title={t('menu.empty.categories')}
        action={
          <Button size="sm" onClick={onAdd}>
            {t('menu.add.category')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {categories.data!.map((category) => (
        <div
          key={category.id}
          className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{category.name}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {category.description ?? t('menu.category.noDescription')}
              </p>
            </div>
            <StatusBadge
              tone={category.isActive ? 'green' : 'neutral'}
              label={category.isActive ? t('menu.category.active') : t('menu.category.hidden')}
            />
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="numeric">
              {t('menu.category.itemsCount', { count: category.itemCount })}
            </span>
            <span>·</span>
            <span className="numeric">
              {t('menu.category.sortOrder', { order: category.sortOrder })}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
            <Toggle
              checked={category.isActive}
              onChange={() => toggleCategory.mutate(category)}
              label={category.isActive ? t('menu.category.visible') : t('menu.category.hidden')}
              disabled={toggleCategory.isPending}
            />
            <Button variant="ghost" size="sm" className="ms-auto" onClick={() => onEdit(category)}>
              <Pencil className="h-3.5 w-3.5" />
              {t('actions.edit')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10"
              onClick={() =>
                requestDelete({
                  title: t('menu.category.deleteTitle', { name: category.name }),
                  description: t('menu.category.deleteDescription'),
                  label: t('menu.category.deleteLabel'),
                  run: () => api.categories.remove(category.id),
                })
              }
              aria-label={t('menu.item.delete', { name: category.name })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
