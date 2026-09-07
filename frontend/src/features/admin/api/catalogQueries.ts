import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateProductInput, UpdateProductInput } from '@ecom/shared';
import { STALE_TIME } from '@/lib/queryClient';
import { ApiError } from '@/lib/apiClient';
import { adminKeys } from './queries';
import * as api from './catalog.api';

export const catalogKeys = {
  product: (id: string) => [...adminKeys.all, 'product', id] as const,
  categories: () => [...adminKeys.all, 'categories'] as const,
  brands: () => [...adminKeys.all, 'brands'] as const,
  media: (page: number) => [...adminKeys.all, 'media', page] as const,
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
