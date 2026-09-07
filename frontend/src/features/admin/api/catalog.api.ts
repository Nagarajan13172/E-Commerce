import { apiDelete, apiGet, apiGetWithMeta, apiPatch, apiPost } from '@/lib/apiClient';
import type {
  ConfirmUploadInput,
  CreateProductInput,
  PresignUploadInput,
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

export interface AdminCategoryOption {
  _id: string;
  name: string;
  path: string;
  level: number;
}

export async function fetchAdminCategories() {
  return apiGet<{ categories: AdminCategoryOption[] }>('/admin/categories');
}

export interface AdminBrandOption {
  _id: string;
  name: string;
}

export async function fetchAdminBrands() {
  return apiGetWithMeta<{ items: AdminBrandOption[] }, PaginationMeta>('/admin/brands?limit=100');
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
  sizeBytes?: number;
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
