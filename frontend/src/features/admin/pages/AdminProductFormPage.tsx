import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Copy, ExternalLink, Loader2, Save } from 'lucide-react';
import { createProductSchema, PRODUCT_STATUSES, type CreateProductInput } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { ImageUploader } from '../components/ImageUploader';
import { VariantManager } from '../components/VariantManager';
import {
  useAdminProduct,
  useBrandOptions,
  useCategoryOptions,
  useCreateProduct,
  useDuplicateProduct,
  useUpdateProduct,
} from '../api/catalogQueries';
import type { AdminProductDetail } from '../api/catalog.api';

type FormValues = CreateProductInput;

const EMPTY: FormValues = {
  name: '',
  sku: '',
  description: '',
  shortDescription: '',
  categories: [],
  tags: [],
  images: [],
  price: 0,
  taxRate: 0.18,
  taxInclusive: true,
  options: [],
  variants: [],
  specifications: [],
  status: 'draft',
  isFeatured: false,
  isBestseller: false,
  isNewArrival: false,
};

/** Flatten a loaded product into the shape the form edits. */
function toFormValues(product: AdminProductDetail): FormValues {
  const id = (value: unknown) =>
    typeof value === 'string' ? value : ((value as { _id?: string })?._id ?? '');

  return {
    ...EMPTY,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    description: product.description,
    shortDescription: product.shortDescription ?? '',
    brand: product.brand ? id(product.brand) : '',
    categories: product.categories.map(id).filter(Boolean),
    tags: product.tags ?? [],
    images: product.images.map((image, index) => ({
      media: image.media,
      url: image.url,
      alt: image.alt ?? '',
      position: image.position ?? index,
    })),
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    costPrice: product.costPrice,
    taxRate: product.taxRate,
    taxInclusive: product.taxInclusive,
    options: product.options ?? [],
    variants: (product.variants ?? []).map((variant) => ({
      _id: variant._id,
      sku: variant.sku,
      optionValues: variant.optionValues,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      // `reserved` and `sold` are deliberately dropped: they are derived from
      // checkout activity and this form must never write them back.
      stock: {
        available: variant.stock.available,
        lowStockThreshold: variant.stock.lowStockThreshold,
      },
      images: variant.images ?? [],
      barcode: variant.barcode ?? '',
      isActive: variant.isActive,
    })),
    specifications: product.specifications ?? [],
    weightGrams: product.weightGrams,
    status: product.status,
    isFeatured: product.isFeatured,
    isBestseller: product.isBestseller,
    isNewArrival: product.isNewArrival,
    seo: product.seo,
  };
}

/**
 * Create and edit a product.
 *
 * One form behind five tabs rather than a wizard: an admin editing a price does
 * not want to walk through media and SEO to reach it. Validation is the shared
 * `createProductSchema` — the same object the API validates with — so a rule
 * like "compare-at price must be at least the selling price" is stated once and
 * enforced identically on both sides.
 *
 * Errors are surfaced with the tab they belong to, because a cross-field error
 * raised on a field two tabs away is otherwise invisible: the form simply
 * refuses to submit with nothing on screen to explain why.
 */
export default function AdminProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const { data, isPending, isError, error, refetch } = useAdminProduct(id);
  const { data: categoryData } = useCategoryOptions();
  const { data: brandData } = useBrandOptions();

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const duplicateProduct = useDuplicateProduct();

  const [tab, setTab] = useState('general');

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(createProductSchema) as never,
    defaultValues: EMPTY,
  });

  // Fill the form once the product arrives. `reset` rather than per-field
  // setValue so `isDirty` starts false and the unsaved-changes prompt is honest.
  useEffect(() => {
    if (data?.product) reset(toFormValues(data.product));
  }, [data, reset]);

  const categories = categoryData?.categories ?? [];
  const brands = brandData?.items ?? [];
  const status = watch('status');
  const slug = watch('slug');

  /** Which tab each failing field lives on, so the error can be found. */
  const errorTabs = useMemo(() => {
    const map: Record<string, string> = {
      name: 'general',
      sku: 'general',
      description: 'general',
      shortDescription: 'general',
      brand: 'general',
      categories: 'general',
      tags: 'general',
      status: 'general',
      price: 'pricing',
      compareAtPrice: 'pricing',
      costPrice: 'pricing',
      taxRate: 'pricing',
      images: 'media',
      options: 'variants',
      variants: 'variants',
      seo: 'seo',
    };
    return [...new Set(Object.keys(errors).map((field) => map[field] ?? 'general'))];
  }, [errors]);

  const onSubmit = handleSubmit(
    (values) => {
      const payload = {
        ...values,
        brand: values.brand || undefined,
        images: values.images.map((image, index) => ({ ...image, position: index })),
      };

      if (isEditing) {
        updateProduct.mutate({ id: id!, input: payload });
      } else {
        createProduct.mutate(payload, {
          onSuccess: (created) => navigate(`/admin/products/${created.product._id}/edit`),
        });
      }
    },
    () => {
      // Jump to the first tab that has a problem; otherwise the submit button
      // appears to do nothing at all.
      const first = errorTabs[0];
      if (first) setTab(first);
    },
  );

  const isSaving = createProduct.isPending || updateProduct.isPending;

  if (isEditing && isError) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (isEditing && isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <Seo title={isEditing ? 'Edit product — Admin' : 'New product — Admin'} noIndex />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/admin/products">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Products
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {isEditing ? (data?.product.name ?? 'Edit product') : 'New product'}
          </h1>
          {isEditing && slug && (
            <p className="text-muted-foreground mt-1 font-mono text-xs">/products/{slug}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isEditing && status === 'active' && slug && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/products/${slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                View
              </Link>
            </Button>
          )}
          {isEditing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={duplicateProduct.isPending}
              onClick={() =>
                duplicateProduct.mutate(id!, {
                  onSuccess: (result) => navigate(`/admin/products/${result.product._id}/edit`),
                })
              }
            >
              <Copy className="size-4" aria-hidden="true" />
              Duplicate
            </Button>
          )}
          <Button type="submit" form="product-form" disabled={isSaving || (isEditing && !isDirty)}>
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {isEditing ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </div>

      <form id="product-form" onSubmit={onSubmit} noValidate>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            {(
              [
                ['general', 'General'],
                ['media', 'Media'],
                ['pricing', 'Pricing'],
                ['variants', 'Variants'],
                ['seo', 'SEO'],
              ] as const
            ).map(([value, label]) => (
              <TabsTrigger key={value} value={value}>
                {label}
                {errorTabs.includes(value) && (
                  <span
                    className="bg-destructive ml-1.5 size-1.5 rounded-full"
                    aria-hidden="true"
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── General ──────────────────────────────────────────────────── */}
          <TabsContent value="general" className="max-w-3xl space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...register('name')} />
                {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" className="font-mono uppercase" {...register('sku')} />
                {errors.sku && <p className="text-destructive text-xs">{errors.sku.message}</p>}
              </div>

              {/* Every Select below guards against an empty `onValueChange`.
                  Radix emits one when its `value` matches none of the items
                  currently rendered — which happens on an edit form, because
                  the category and brand lists arrive after the product does.
                  Without the guard it wrote "" straight into the form and the
                  save failed validation on fields the admin never touched, with
                  no visible error to explain it. */}
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_STATUSES.map((value) => (
                          <SelectItem key={value} value={value} className="capitalize">
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-muted-foreground text-xs">
                  Only active products appear in the storefront.
                </p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="shortDescription">Short description</Label>
                <Input id="shortDescription" {...register('shortDescription')} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" rows={7} {...register('description')} />
                {errors.description && (
                  <p className="text-destructive text-xs">{errors.description.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brand">Brand</Label>
                <Controller
                  control={control}
                  name="brand"
                  render={({ field }) => (
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(v) => v && field.onChange(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger id="brand">
                        <SelectValue placeholder="No brand" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No brand</SelectItem>
                        {brands.map((brand) => (
                          <SelectItem key={brand._id} value={brand._id}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Controller
                  control={control}
                  name="categories"
                  render={({ field }) => (
                    <Select
                      value={field.value[0] ?? 'none'}
                      onValueChange={(v) => v && field.onChange(v === 'none' ? [] : [v])}
                    >
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Uncategorised" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Uncategorised</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category._id} value={category._id}>
                            {'— '.repeat(category.level)}
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tags">Tags</Label>
                <Controller
                  control={control}
                  name="tags"
                  render={({ field }) => (
                    <Input
                      id="tags"
                      value={field.value.join(', ')}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value
                            .split(',')
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                        )
                      }
                      placeholder="linen, summer, breathable"
                    />
                  )}
                />
                <p className="text-muted-foreground text-xs">Comma separated.</p>
              </div>
            </div>

            <div className="space-y-3 border-t pt-5">
              {(
                [
                  ['isFeatured', 'Featured', 'Shown in the homepage feature strip'],
                  ['isNewArrival', 'New arrival', 'Badged as new in listings'],
                  ['isBestseller', 'Bestseller', 'Badged as a bestseller'],
                ] as const
              ).map(([name, label, hint]) => (
                <div key={name} className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor={name}>{label}</Label>
                    <p className="text-muted-foreground text-xs">{hint}</p>
                  </div>
                  <Controller
                    control={control}
                    name={name}
                    render={({ field }) => (
                      <Switch id={name} checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Media ────────────────────────────────────────────────────── */}
          <TabsContent value="media" className="max-w-3xl">
            <Controller
              control={control}
              name="images"
              render={({ field }) => (
                <ImageUploader images={field.value} onChange={field.onChange} />
              )}
            />
            {errors.images && (
              <p className="text-destructive mt-2 text-xs">{errors.images.message}</p>
            )}
          </TabsContent>

          {/* ── Pricing ──────────────────────────────────────────────────── */}
          <TabsContent value="pricing" className="max-w-xl space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  {...register('price', { valueAsNumber: true })}
                />
                {errors.price && <p className="text-destructive text-xs">{errors.price.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="compareAtPrice">Compare at</Label>
                <Input
                  id="compareAtPrice"
                  type="number"
                  step="0.01"
                  {...register('compareAtPrice', {
                    setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                  })}
                />
                <p className="text-muted-foreground text-xs">
                  The struck-through &ldquo;was&rdquo; price. Must be at least the selling price.
                </p>
                {errors.compareAtPrice && (
                  <p className="text-destructive text-xs">{errors.compareAtPrice.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="costPrice">Cost</Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  {...register('costPrice', {
                    setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                  })}
                />
                <p className="text-muted-foreground text-xs">Internal only; never shown.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="taxRate">Tax rate</Label>
                <Controller
                  control={control}
                  name="taxRate"
                  render={({ field }) => (
                    <Input
                      id="taxRate"
                      type="number"
                      step="1"
                      value={Math.round(field.value * 100)}
                      onChange={(event) => field.onChange(Number(event.target.value) / 100)}
                    />
                  )}
                />
                <p className="text-muted-foreground text-xs">Percent.</p>
              </div>
            </div>

            {watch('variants').length > 0 && (
              <p className="bg-muted/50 rounded-md p-3 text-xs">
                This product has variants, so what a customer pays and the discount shown come from
                the <strong>variant</strong> prices, not these. The figures here seed newly
                generated variants and are the fallback if every variant is removed.
              </p>
            )}

            <div className="flex items-center justify-between gap-4 border-t pt-5">
              <div>
                <Label htmlFor="taxInclusive">Price includes tax</Label>
                <p className="text-muted-foreground text-xs">
                  When on, tax is extracted from the price rather than added to it.
                </p>
              </div>
              <Controller
                control={control}
                name="taxInclusive"
                render={({ field }) => (
                  <Switch
                    id="taxInclusive"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          </TabsContent>

          {/* ── Variants ─────────────────────────────────────────────────── */}
          <TabsContent value="variants">
            <Controller
              control={control}
              name="options"
              render={({ field: optionsField }) => (
                <Controller
                  control={control}
                  name="variants"
                  render={({ field: variantsField }) => (
                    <VariantManager
                      options={optionsField.value}
                      variants={variantsField.value}
                      basePrice={watch('price')}
                      baseCompareAtPrice={watch('compareAtPrice')}
                      baseSku={watch('sku')}
                      onOptionsChange={optionsField.onChange}
                      onVariantsChange={variantsField.onChange}
                    />
                  )}
                />
              )}
            />
            {errors.variants && (
              <p className="text-destructive mt-3 text-xs">{errors.variants.message}</p>
            )}
          </TabsContent>

          {/* ── SEO ──────────────────────────────────────────────────────── */}
          <TabsContent value="seo" className="max-w-xl space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="seoTitle">Page title</Label>
              <Input id="seoTitle" maxLength={70} {...register('seo.title')} />
              <p className="text-muted-foreground text-xs">
                Falls back to the product name. Around 60 characters shows in full.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seoDescription">Meta description</Label>
              <Textarea
                id="seoDescription"
                rows={3}
                maxLength={180}
                {...register('seo.description')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" className="font-mono" {...register('slug')} />
              <p className="text-muted-foreground text-xs">
                Generated from the name when left empty. Changing it on a live product breaks
                existing links.
              </p>
              {errors.slug && <p className="text-destructive text-xs">{errors.slug.message}</p>}
            </div>
          </TabsContent>
        </Tabs>
      </form>
    </>
  );
}
