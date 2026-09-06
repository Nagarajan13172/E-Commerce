import type { RequestHandler } from 'express';
import type {
  AdminProductQuery,
  BulkProductActionInput,
  ConfirmUploadInput,
  CreateBrandInput,
  CreateCategoryInput,
  CreateProductInput,
  PresignUploadInput,
  ReorderCategoriesInput,
  UpdateBrandInput,
  UpdateCategoryInput,
  UpdateProductInput,
} from '@ecom/shared';
import * as productService from '../../services/product.service.js';
import * as categoryService from '../../services/category.service.js';
import * as brandService from '../../services/brand.service.js';
import * as mediaService from '../../services/media.service.js';
import { validatedBody, validatedParams, validatedQuery } from '../../middleware/validate.js';
import {
  buildPaginationMeta,
  sendCreated,
  sendNoContent,
  sendSuccess,
} from '../../utils/apiResponse.js';

/** Admin catalog management. Authorization is enforced by route middleware. */

// ── Products ────────────────────────────────────────────────────────────────

export const listProducts: RequestHandler = async (req, res) => {
  const query = validatedQuery<AdminProductQuery>(req);
  const { items, total, page, limit } = await productService.listProductsForAdmin(query);

  sendSuccess(res, { items }, { meta: buildPaginationMeta(page, limit, total) });
};

export const getProduct: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  sendSuccess(res, { product: await productService.getProductForAdmin(id) });
};

export const createProduct: RequestHandler = async (req, res) => {
  const product = await productService.createProduct(validatedBody<CreateProductInput>(req));
  sendCreated(res, { product }, 'Product created');
};

export const updateProduct: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const product = await productService.updateProduct(id, validatedBody<UpdateProductInput>(req));
  sendSuccess(res, { product }, { message: 'Product updated' });
};

export const deleteProduct: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  await productService.softDeleteProduct(id);
  // Soft delete: orders reference products, so the row is archived, not removed.
  sendSuccess(res, null, { message: 'Product archived' });
};

export const restoreProduct: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const product = await productService.restoreProduct(id);
  sendSuccess(res, { product }, { message: 'Product restored as a draft' });
};

export const duplicateProduct: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const product = await productService.duplicateProduct(id);
  sendCreated(res, { product }, 'Product duplicated as a draft');
};

export const bulkProductAction: RequestHandler = async (req, res) => {
  const { ids, action } = validatedBody<BulkProductActionInput>(req);
  const modified = await productService.bulkAction(ids, action);

  sendSuccess(res, { modified }, { message: `${modified} product(s) updated` });
};

// ── Categories ──────────────────────────────────────────────────────────────

export const listCategories: RequestHandler = async (_req, res) => {
  // Admins see inactive categories too — they need to find one to re-enable it.
  sendSuccess(res, { items: await categoryService.getCategoryTree(true) });
};

export const createCategory: RequestHandler = async (req, res) => {
  const category = await categoryService.createCategory(validatedBody<CreateCategoryInput>(req));
  sendCreated(res, { category }, 'Category created');
};

export const updateCategory: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const category = await categoryService.updateCategory(
    id,
    validatedBody<UpdateCategoryInput>(req),
  );
  sendSuccess(res, { category }, { message: 'Category updated' });
};

export const deleteCategory: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  await categoryService.deleteCategory(id);
  sendNoContent(res);
};

export const reorderCategories: RequestHandler = async (req, res) => {
  const { items } = validatedBody<ReorderCategoriesInput>(req);
  await categoryService.reorderCategories(items);
  sendSuccess(res, null, { message: 'Order saved' });
};

// ── Brands ──────────────────────────────────────────────────────────────────

export const listBrands: RequestHandler = async (_req, res) => {
  sendSuccess(res, { items: await brandService.listBrands(true) });
};

export const createBrand: RequestHandler = async (req, res) => {
  const brand = await brandService.createBrand(validatedBody<CreateBrandInput>(req));
  sendCreated(res, { brand }, 'Brand created');
};

export const updateBrand: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const brand = await brandService.updateBrand(id, validatedBody<UpdateBrandInput>(req));
  sendSuccess(res, { brand }, { message: 'Brand updated' });
};

export const deleteBrand: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  await brandService.deleteBrand(id);
  sendNoContent(res);
};

// ── Media ───────────────────────────────────────────────────────────────────

export const presignUpload: RequestHandler = async (req, res) => {
  const input = validatedBody<PresignUploadInput>(req);
  const presigned = await mediaService.createPresignedUpload(input, req.user!.id);

  sendSuccess(res, presigned);
};

export const confirmUpload: RequestHandler = async (req, res) => {
  const input = validatedBody<ConfirmUploadInput>(req);
  const media = await mediaService.confirmUpload(input, req.user!.id);

  sendCreated(res, { media }, 'Image uploaded');
};

export const listMedia: RequestHandler = async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const { items, total, limit } = await mediaService.listMedia({ page });

  sendSuccess(res, { items }, { meta: buildPaginationMeta(page, limit, total) });
};

export const deleteMedia: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  await mediaService.deleteMedia(id);
  sendNoContent(res);
};
