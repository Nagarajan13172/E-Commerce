import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Hidden below `md` — for columns that are useful but not essential. */
  secondary?: boolean;
}

interface AdminTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  isRefreshing?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}

/**
 * Admin data table.
 *
 * A real `<table>` rather than a grid of divs: screen readers announce row and
 * column relationships from the semantics, and that is most of what makes a
 * dense data view usable without sight.
 *
 * Secondary columns are hidden on narrow screens rather than the table being
 * allowed to scroll horizontally by default — an admin on a phone needs the
 * identifying column and the action, not every field.
 */
export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  isRefreshing,
  empty,
  onRowClick,
}: AdminTableProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) return <>{empty}</>;

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-lg border transition-opacity',
        isRefreshing && 'opacity-60',
      )}
    >
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'text-muted-foreground px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap',
                  column.secondary && 'hidden md:table-cell',
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('bg-background', onRowClick && 'hover:bg-muted/40 cursor-pointer')}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-3 py-2.5 align-middle',
                    column.secondary && 'hidden md:table-cell',
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
