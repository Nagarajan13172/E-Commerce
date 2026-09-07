import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronRight, FolderTree, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { createCategorySchema, CONTENT_STATUSES, type CreateCategoryInput } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  useCategoryTree,
  useCreateCategory,
  useDeleteCategory,
  useReorderCategories,
  useUpdateCategory,
} from '../api/catalogQueries';
import { flattenCategories, type AdminCategory } from '../api/catalog.api';

/**
 * The category tree.
 *
 * Reordering is by explicit move controls rather than pointer dragging. A drag
 * gesture with no keyboard equivalent would make the ordering of the storefront
 * navigation editable only by people who can use a mouse — and reordering is
 * the whole point of this screen.
 *
 * Each move sends the affected sibling list in its new order, which is what
 * `reorderCategoriesSchema` accepts: positions within a level are only
 * meaningful relative to each other, so sending one item's new index would
 * leave the server guessing about the rest.
 */
export default function AdminCategoriesPage() {
  const { data, isPending, isError, error, refetch } = useCategoryTree();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<AdminCategory | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);

  const reorder = useReorderCategories();
  const deleteCategory = useDeleteCategory();

  const roots = data?.items ?? [];
  const all = flattenCategories(roots);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const move = (siblings: AdminCategory[], index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;

    const next = [...siblings];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    reorder.mutate(next.map((category, position) => ({ id: category._id, order: position })));
  };

  const renderRow = (category: AdminCategory, siblings: AdminCategory[], index: number) => {
    const hasChildren = (category.children?.length ?? 0) > 0;
    const isOpen = expanded.has(category._id);

    return (
      <li key={category._id}>
        <div
          className="hover:bg-muted/40 flex items-center gap-2 rounded-md py-1.5 pr-2"
          style={{ paddingLeft: `${category.level * 1.5 + 0.5}rem` }}
        >
          {hasChildren ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-6 p-0"
              onClick={() => toggle(category._id)}
              aria-expanded={isOpen}
            >
              {isOpen ? (
                <ChevronDown className="size-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4" aria-hidden="true" />
              )}
              <span className="sr-only">
                {isOpen ? 'Collapse' : 'Expand'} {category.name}
              </span>
            </Button>
          ) : (
            <span className="size-6" aria-hidden="true" />
          )}

          <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>

          <span className="text-muted-foreground shrink-0 text-xs tabular">
            {category.productCount} product{category.productCount === 1 ? '' : 's'}
          </span>

          {category.status !== 'active' && <StatusBadge tone="neutral">Inactive</StatusBadge>}

          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={index === 0 || reorder.isPending}
              onClick={() => move(siblings, index, -1)}
            >
              <span aria-hidden="true">↑</span>
              <span className="sr-only">Move {category.name} up</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={index === siblings.length - 1 || reorder.isPending}
              onClick={() => move(siblings, index, 1)}
            >
              <span aria-hidden="true">↓</span>
              <span className="sr-only">Move {category.name} down</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                // Expand first: adding a subcategory to a collapsed parent
                // otherwise looks like nothing happened, because the new row is
                // created inside a branch that is not being rendered.
                setExpanded((current) => new Set(current).add(category._id));
                setCreatingUnder(category);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              <span className="sr-only">Add a subcategory under {category.name}</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(category)}>
              <Pencil className="size-4" aria-hidden="true" />
              <span className="sr-only">Edit {category.name}</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(category)}>
              <Trash2 className="size-4" aria-hidden="true" />
              <span className="sr-only">Delete {category.name}</span>
            </Button>
          </div>
        </div>

        {hasChildren && isOpen && (
          <ul>
            {category.children.map((child, childIndex) =>
              renderRow(child, category.children, childIndex),
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <Seo title="Categories — Admin" noIndex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="text-muted-foreground mt-1 text-sm tabular">
            {isPending ? 'Loading…' : `${all.length} categor${all.length === 1 ? 'y' : 'ies'}`}
          </p>
        </div>
        <Button type="button" onClick={() => setCreatingUnder(null)}>
          <Plus className="size-4" aria-hidden="true" />
          New category
        </Button>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : roots.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Categories organise the storefront navigation and the listing filters."
          action={<Button onClick={() => setCreatingUnder(null)}>Create a category</Button>}
        />
      ) : (
        <div className="rounded-lg border p-2">
          <ul>{roots.map((category, index) => renderRow(category, roots, index))}</ul>
        </div>
      )}

      {/* Includes the closed state, so two consecutive root-level creates do
          not share one mounted form carrying the first entry's values. */}
      <CategoryDialog
        key={
          editing?._id ??
          (creatingUnder === undefined ? 'new-closed' : `new-${creatingUnder?._id ?? 'root'}`)
        }
        category={editing}
        parent={creatingUnder}
        options={all}
        open={editing !== null || creatingUnder !== undefined}
        onClose={() => {
          setEditing(null);
          setCreatingUnder(undefined);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? 'this category'}?`}
        description={
          deleting && deleting.productCount > 0
            ? `${deleting.productCount} product${deleting.productCount === 1 ? '' : 's'} sit in this category. They will not be deleted, but they will lose it.`
            : 'Any subcategories will be affected too.'
        }
        confirmLabel="Delete"
        isPending={deleteCategory.isPending}
        onConfirm={() => {
          if (deleting) {
            deleteCategory.mutate(deleting._id, { onSuccess: () => setDeleting(null) });
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

function CategoryDialog({
  category,
  parent,
  options,
  open,
  onClose,
}: {
  category: AdminCategory | null;
  parent: AdminCategory | null | undefined;
  options: AdminCategory[];
  open: boolean;
  onClose: () => void;
}) {
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const isEditing = category !== null;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema) as never,
    defaultValues: category
      ? {
          name: category.name,
          slug: category.slug,
          description: category.description ?? '',
          parent: category.parent ?? null,
          order: category.order,
          status: category.status,
          isFeatured: category.isFeatured,
        }
      : {
          name: '',
          description: '',
          parent: parent?._id ?? null,
          order: 0,
          status: 'active',
          isFeatured: false,
        },
  });

  const parentValue = watch('parent');
  const status = watch('status');

  const onSubmit = handleSubmit((values) => {
    const done = { onSuccess: () => onClose() };
    if (isEditing) updateCategory.mutate({ id: category._id, input: values }, done);
    else createCategory.mutate(values, done);
  });

  // A category cannot be its own parent, nor a descendant's child — that would
  // make a cycle the materialised path cannot represent.
  const parentOptions = options.filter(
    (option) => option._id !== category?._id && !option.ancestors.includes(category?._id ?? ''),
  );

  const isSaving = createCategory.isPending || updateCategory.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${category.name}` : 'New category'}</DialogTitle>
          <DialogDescription>
            Categories drive the storefront navigation and the listing filters.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="categoryName">Name</Label>
            <Input id="categoryName" {...register('name')} />
            {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="categoryParent">Parent</Label>
            <Select
              value={parentValue ?? 'none'}
              onValueChange={(value) =>
                value && setValue('parent', value === 'none' ? null : value)
              }
            >
              <SelectTrigger id="categoryParent">
                <SelectValue placeholder="Top level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Top level</SelectItem>
                {parentOptions.map((option) => (
                  <SelectItem key={option._id} value={option._id}>
                    {'— '.repeat(option.level)}
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="categoryDescription">Description</Label>
            <Textarea id="categoryDescription" rows={3} {...register('description')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="categoryStatus">Status</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                value && setValue('status', value as CreateCategoryInput['status'])
              }
            >
              <SelectTrigger id="categoryStatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_STATUSES.map((value) => (
                  <SelectItem key={value} value={value} className="capitalize">
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="categoryFeatured">Featured</Label>
              <p className="text-muted-foreground text-xs">Shown on the homepage.</p>
            </div>
            <Switch
              id="categoryFeatured"
              checked={watch('isFeatured')}
              onCheckedChange={(checked) => setValue('isFeatured', checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isEditing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
