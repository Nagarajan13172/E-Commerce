import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CreateBrandInput,
  CreateCategoryInput,
  CreateProductInput,
  UpdateBrandInput,
  UpdateCategoryInput,
  UpdateProductInput,
} from '@ecom/shared';
import { STALE_TIME } from '@/lib/queryClient';
import { ApiError } from '@/lib/apiClient';
import { adminKeys } from './queries';
import * as api from './catalog.api';

export const catalogKeys = {
  product: (id: string) => [...adminKeys.all, 'product', id] as const,
  categories: () => [...adminKeys.all, 'categories'] as const,
  categoryTree: () => [...adminKeys.all, 'category-tree'] as const,
  brands: () => [...adminKeys.all, 'brands'] as const,
  media: (page: number) => [...adminKeys.all, 'media', page] as const,
  payments: (page: number) => [...adminKeys.all, 'payments', page] as const,
};

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.product(id ?? 'new'),
    queryFn: () => api.fetchAdminProduct(id!),
    // No stale window: an editor must not open a form over data another admin
    // has already changed.
    staleTime: 0,
    enabled: Boolean(id),
  });
}

/** Category and brand lists change rarely and are only used to fill pickers. */
export function useCategoryOptions() {
  return useQuery({
    queryKey: catalogKeys.categories(),
    queryFn: api.fetchAdminCategories,
    staleTime: STALE_TIME.LONG,
  });
}

export function useBrandOptions() {
  return useQuery({
    queryKey: catalogKeys.brands(),
    queryFn: api.fetchAdminBrands,
    staleTime: STALE_TIME.LONG,
  });
}

/** The nested tree, for the category editor. */
export function useCategoryTree() {
  return useQuery({
    queryKey: catalogKeys.categoryTree(),
    queryFn: api.fetchCategoryTree,
    // The editor is where categories change, so it must not read its own
    // stale copy straight after a write.
    staleTime: 0,
  });
}

export function usePayments(page: number) {
  return useQuery({
    queryKey: catalogKeys.payments(page),
    queryFn: () => api.fetchPayments(page),
    staleTime: STALE_TIME.SHORT,
    placeholderData: keepPreviousData,
  });
}

export function useMediaLibrary(page: number) {
  return useQuery({
    queryKey: catalogKeys.media(page),
    queryFn: () => api.fetchMediaLibrary(page),
    staleTime: STALE_TIME.SHORT,
    placeholderData: keepPreviousData,
  });
}

function useCatalogMutation<TVariables, TData>(
  mutationFn: (v: TVariables) => Promise<TData>,
  successMessage: string | ((data: TData) => string),
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(typeof successMessage === 'function' ? successMessage(data) : successMessage);
    },
    onError: (error) => {
      // The server's message names the offending field — a duplicate SKU, a
      // slug already taken. Replacing it with something generic would send the
      // admin hunting for a problem the response already identified.
      toast.error(error instanceof ApiError ? error.message : 'Could not save the product');
    },
  });
}

export const useCreateProduct = () =>
  useCatalogMutation(
    (input: CreateProductInput) => api.createProduct(input),
    (data) => `${data.product.name} created`,
  );

export const useUpdateProduct = () =>
  useCatalogMutation(
    ({ id, input }: { id: string; input: UpdateProductInput }) => api.updateProduct(id, input),
    'Product saved',
  );

export const useDuplicateProduct = () =>
  useCatalogMutation(
    (id: string) => api.duplicateProduct(id),
    (data) => `Duplicated as ${data.product.name}`,
  );

export const useDeleteMedia = () =>
  useCatalogMutation((id: string) => api.deleteMedia(id), 'Image removed');

// ── Categories ──────────────────────────────────────────────────────────────

export const useCreateCategory = () =>
  useCatalogMutation(
    (input: CreateCategoryInput) => api.createCategory(input),
    (data) => `${data.category.name} created`,
  );

export const useUpdateCategory = () =>
  useCatalogMutation(
    ({ id, input }: { id: string; input: UpdateCategoryInput }) => api.updateCategory(id, input),
    'Category saved',
  );

export const useDeleteCategory = () =>
  useCatalogMutation((id: string) => api.deleteCategory(id), 'Category removed');

export const useReorderCategories = () =>
  useCatalogMutation(
    (items: { id: string; order: number }[]) => api.reorderCategories(items),
    'Order saved',
  );

// ── Brands ──────────────────────────────────────────────────────────────────

export const useCreateBrand = () =>
  useCatalogMutation(
    (input: CreateBrandInput) => api.createBrand(input),
    (data) => `${data.brand.name} created`,
  );

export const useUpdateBrand = () =>
  useCatalogMutation(
    ({ id, input }: { id: string; input: UpdateBrandInput }) => api.updateBrand(id, input),
    'Brand saved',
  );

export const useDeleteBrand = () =>
  useCatalogMutation((id: string) => api.deleteBrand(id), 'Brand removed');
