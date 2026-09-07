import { apiDelete, apiGet, apiGetWithMeta, apiPatch, apiPost } from '@/lib/apiClient';
import type {
  ConfirmUploadInput,
  CreateBrandInput,
  CreateCategoryInput,
  CreateProductInput,
  PresignUploadInput,
  UpdateBrandInput,
  UpdateCategoryInput,
  UpdateProductInput,
} from '@ecom/shared';
import type { PaginationMeta } from '@/types/catalog';

/**
 * Admin catalogue writes: products, and the media they reference.
 *
 * Kept apart from `admin.api.ts`, which is the operations side — orders,
 * customers, inventory, moderation. Different people use them and they change
 * for different reasons.
 */

// ── Products ────────────────────────────────────────────────────────────────

export interface AdminProductDetail {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription?: string;
  brand?: { _id: string; name: string } | string | null;
  categories: ({ _id: string; name: string } | string)[];
  tags: string[];
  images: { media?: string; url: string; alt?: string; position: number }[];
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  taxRate: number;
  taxInclusive: boolean;
  options: { name: string; values: string[]; position: number }[];
  variants: {
    _id?: string;
    sku: string;
    optionValues: { name: string; value: string }[];
    price: number;
    compareAtPrice?: number;
    costPrice?: number;
    stock: { available: number; reserved: number; sold: number; lowStockThreshold: number };
    images: string[];
    weightGrams?: number;
    barcode?: string;
    isActive: boolean;
  }[];
  specifications: { group?: string; name: string; value: string }[];
  weightGrams?: number;
  status: 'draft' | 'active' | 'archived';
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
  seo?: { title?: string; description?: string; keywords?: string[]; canonicalUrl?: string };
  createdAt: string;
  updatedAt: string;
}

export async function fetchAdminProduct(id: string) {
  return apiGet<{ product: AdminProductDetail }>(`/admin/products/${id}`);
}

export async function createProduct(input: CreateProductInput) {
  return apiPost<{ product: AdminProductDetail }>('/admin/products', input);
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  return apiPatch<{ product: AdminProductDetail }>(`/admin/products/${id}`, input);
}

export async function duplicateProduct(id: string) {
  return apiPost<{ product: AdminProductDetail }>(`/admin/products/${id}/duplicate`, {});
}

// ── Taxonomy, for the pickers ───────────────────────────────────────────────

export interface AdminCategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: string | null;
  ancestors: string[];
  path: string;
  level: number;
  order: number;
  status: 'active' | 'inactive';
  isFeatured: boolean;
  productCount: number;
  children: AdminCategory[];
}

/** The API returns roots with nested `children`. */
export async function fetchCategoryTree() {
  return apiGet<{ items: AdminCategory[] }>('/admin/categories');
}

/**
 * The tree flattened depth-first, for the pickers.
 *
 * The endpoint returns a nested tree, so a component that iterated the response
 * directly would offer only the top-level categories — which is exactly what
 * the product form's category select was doing.
 */
export function flattenCategories(nodes: AdminCategory[]): AdminCategory[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children ?? [])]);
}

export async function fetchAdminCategories() {
  const { items } = await fetchCategoryTree();
  return { categories: flattenCategories(items) };
}

export async function createCategory(input: CreateCategoryInput) {
  return apiPost<{ category: AdminCategory }>('/admin/categories', input);
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  return apiPatch<{ category: AdminCategory }>(`/admin/categories/${id}`, input);
}

export async function deleteCategory(id: string) {
  return apiDelete<void>(`/admin/categories/${id}`);
}

export async function reorderCategories(items: { id: string; order: number }[]) {
  return apiPost<{ updated: number }>('/admin/categories/reorder', { items });
}

// ── Brands ──────────────────────────────────────────────────────────────────

export interface AdminBrand {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  website?: string;
  status: 'active' | 'inactive';
  isFeatured: boolean;
  productCount: number;
  createdAt: string;
}

/** Returns every brand; the endpoint is not paginated. */
export async function fetchAdminBrands() {
  return apiGet<{ items: AdminBrand[] }>('/admin/brands');
}

export async function createBrand(input: CreateBrandInput) {
  return apiPost<{ brand: AdminBrand }>('/admin/brands', input);
}

export async function updateBrand(id: string, input: UpdateBrandInput) {
  return apiPatch<{ brand: AdminBrand }>(`/admin/brands/${id}`, input);
}

export async function deleteBrand(id: string) {
  return apiDelete<void>(`/admin/brands/${id}`);
}

// ── Payments ────────────────────────────────────────────────────────────────

export interface AdminPayment {
  _id: string;
  order?: { _id: string; orderNumber: string; status: string } | null;
  user?: { _id: string; name: string; email: string } | null;
  provider: string;
  providerOrderId: string;
  providerPaymentId?: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  status: string;
  method?: string;
  failureReason?: string;
  createdAt: string;
}

export async function fetchPayments(page = 1) {
  return apiGetWithMeta<{ items: AdminPayment[] }, PaginationMeta>(`/admin/payments?page=${page}`);
}

// ── Media ───────────────────────────────────────────────────────────────────

export interface PresignedUpload {
  uploadUrl: string;
  key: string;
  headers: Record<string, string>;
  expiresIn: number;
}

export interface MediaAsset {
  _id: string;
  key: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Bytes. Named `size` on the server — not `sizeBytes`. */
  size?: number;
  createdAt: string;
}

export async function presignUpload(input: PresignUploadInput) {
  return apiPost<PresignedUpload>('/admin/media/presign', input);
}

export async function confirmUpload(input: ConfirmUploadInput) {
  return apiPost<{ media: MediaAsset }>('/admin/media/confirm', input);
}

export async function fetchMediaLibrary(page = 1) {
  return apiGetWithMeta<{ items: MediaAsset[] }, PaginationMeta>(`/admin/media?page=${page}`);
}

export async function deleteMedia(id: string) {
  return apiDelete<void>(`/admin/media/${id}`);
}

/**
 * PUT the file straight to object storage using the presigned URL.
 *
 * Deliberately `XMLHttpRequest` rather than `fetch`: this is the one place in
 * the app that needs real upload progress, and `fetch` still cannot report it
 * for a request body. The bytes never pass through the API — that is the point
 * of presigning — so this call also must not carry our cookies or CSRF header.
 */
export function uploadToStorage(
  presigned: PresignedUpload,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', presigned.uploadUrl, true);

    for (const [header, value] of Object.entries(presigned.headers)) {
      request.setRequestHeader(header, value);
    }

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${request.status}`));
    });
    request.addEventListener('error', () =>
      reject(new Error('Upload failed. Check your connection.')),
    );
    request.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    request.send(file);
  });
}
