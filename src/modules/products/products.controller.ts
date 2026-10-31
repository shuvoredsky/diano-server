import type { Request, Response } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { productsService, type ProductsService } from './products.service';
import {
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
  updateProductFeaturedSchema,
  variantInputSchema,
  updateVariantSchema,
  productQuerySchema,
  updateProductImageSchema,
  reorderProductImagesSchema,
} from './products.validation';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { getPaginationMeta } from '@/utils/pagination';
import { AppError } from '@/utils/app-error';

export class ProductsController {
  constructor(private readonly service: ProductsService = productsService) {}

  // ================= Public Endpoints =================

  getPublicProducts = async (req: Request, res: Response): Promise<Response> => {
    const query = productQuerySchema.parse(req.query);
    const result = await this.service.getPublicProducts(query);
    return ApiResponse.paginated(
      res,
      'Products retrieved successfully',
      result.items,
      getPaginationMeta(result.total, result.page, result.limit),
    );
  };

  getPublicBySlug = async (req: Request, res: Response): Promise<Response> => {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';

    const product = await this.service.getPublicProductBySlug(
      req.params.slug as string,
      clientIp,
    );
    return ApiResponse.success(res, 'Product details retrieved successfully', product);
  };

  getPublicRelated = async (req: Request, res: Response): Promise<Response> => {
    const products = await this.service.getPublicRelatedProducts(req.params.slug as string);
    return ApiResponse.success(res, 'Related products retrieved successfully', products);
  };

  getPublicFeatured = async (req: Request, res: Response): Promise<Response> => {
    const limit = req.query.limit ? Math.min(50, Math.max(1, Number(req.query.limit))) : 10;
    const products = await this.service.getPublicFeaturedProducts(limit);
    return ApiResponse.success(res, 'Featured products retrieved successfully', products);
  };

  // ================= Admin Endpoints =================

  getAdminFormOptions = async (_req: Request, res: Response): Promise<Response> => {
    const options = await this.service.getAdminFormOptions();
    return ApiResponse.success(res, 'Admin product form options retrieved successfully', options);
  };

  getAdminProducts = async (req: Request, res: Response): Promise<Response> => {
    const query = productQuerySchema.parse(req.query);
    const canViewCost = req.user
      ? await permissionsCache.hasPermission(req.user.roles, 'product:view_cost')
      : false;

    const result = await this.service.getAdminProducts(query, canViewCost);
    return ApiResponse.paginated(
      res,
      'Admin products retrieved successfully',
      result.items,
      getPaginationMeta(result.total, result.page, result.limit),
    );
  };

  getAdminProductById = async (req: Request, res: Response): Promise<Response> => {
    const canViewCost = req.user
      ? await permissionsCache.hasPermission(req.user.roles, 'product:view_cost')
      : false;

    const product = await this.service.getAdminProductById(req.params.id as string, canViewCost);
    return ApiResponse.success(res, 'Product details retrieved successfully', product);
  };

  createProduct = async (req: Request, res: Response): Promise<Response> => {
    const input = createProductSchema.parse(req.body);
    const product = await this.service.createProduct(input, req.user);
    return ApiResponse.created(res, 'Product created successfully', product);
  };

  updateProduct = async (req: Request, res: Response): Promise<Response> => {
    const input = updateProductSchema.parse(req.body);
    const product = await this.service.updateProduct(req.params.id as string, input, req.user);
    return ApiResponse.success(res, 'Product updated successfully', product);
  };

  deleteProduct = async (req: Request, res: Response): Promise<Response> => {
    const deleted = await this.service.deleteProduct(req.params.id as string, req.user);
    return ApiResponse.success(res, 'Product deleted successfully', deleted);
  };

  updateStatus = async (req: Request, res: Response): Promise<Response> => {
    const input = updateProductStatusSchema.parse(req.body);
    const updated = await this.service.updateStatus(
      req.params.id as string,
      input.status,
      req.user,
    );
    return ApiResponse.success(res, 'Product status updated successfully', updated);
  };

  toggleFeatured = async (req: Request, res: Response): Promise<Response> => {
    const input = updateProductFeaturedSchema.parse(req.body);
    const updated = await this.service.toggleFeatured(
      req.params.id as string,
      input.isFeatured,
      req.user,
    );
    return ApiResponse.success(res, 'Product featured status updated successfully', updated);
  };

  addVariant = async (req: Request, res: Response): Promise<Response> => {
    const input = variantInputSchema.parse(req.body);
    const variant = await this.service.addVariant(req.params.id as string, input, req.user);
    return ApiResponse.created(res, 'Variant added successfully', variant);
  };

  updateVariant = async (req: Request, res: Response): Promise<Response> => {
    const input = updateVariantSchema.parse(req.body);
    const variant = await this.service.updateVariant(
      req.params.variantId as string,
      input,
      req.user,
    );
    return ApiResponse.success(res, 'Variant updated successfully', variant);
  };

  deleteVariant = async (req: Request, res: Response): Promise<Response> => {
    const deleted = await this.service.deleteVariant(req.params.variantId as string, req.user);
    return ApiResponse.success(res, 'Variant deleted successfully', deleted);
  };

  uploadThumbnail = async (req: Request, res: Response): Promise<Response> => {
    if (!req.file) {
      throw AppError.badRequest('No image file provided for thumbnail upload');
    }
    const image = await this.service.uploadSlotImage(
      req.params.id as string,
      'THUMBNAIL',
      req.file,
      req.user,
    );
    return ApiResponse.created(res, 'Thumbnail image uploaded successfully', image);
  };

  uploadBackview = async (req: Request, res: Response): Promise<Response> => {
    if (!req.file) {
      throw AppError.badRequest('No image file provided for backview upload');
    }
    const image = await this.service.uploadSlotImage(
      req.params.id as string,
      'BACKVIEW',
      req.file,
      req.user,
    );
    return ApiResponse.created(res, 'Backview image uploaded successfully', image);
  };

  uploadGallery = async (req: Request, res: Response): Promise<Response> => {
    if (!req.file) {
      throw AppError.badRequest('No image file provided for gallery upload');
    }
    const image = await this.service.uploadSlotImage(
      req.params.id as string,
      'GALLERY',
      req.file,
      req.user,
    );
    return ApiResponse.created(res, 'Gallery image uploaded successfully', image);
  };

  uploadImages = async (req: Request, res: Response): Promise<Response> => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw AppError.badRequest('No image files provided for upload');
    }

    const isPrimary = req.body.isPrimary === 'true' || req.body.isPrimary === true;
    const variantId = req.body.variantId ? String(req.body.variantId) : undefined;
    const altText = req.body.altText ? String(req.body.altText) : undefined;

    const images = await this.service.uploadProductImages(
      req.params.id as string,
      files,
      { variantId, isPrimary, altText },
      req.user,
    );
    return ApiResponse.created(res, 'Product images uploaded successfully', images);
  };

  updateImage = async (req: Request, res: Response): Promise<Response> => {
    const input = updateProductImageSchema.parse(req.body);
    const updated = await this.service.updateProductImage(
      req.params.imageId as string,
      input,
      req.user,
    );
    return ApiResponse.success(res, 'Product image updated successfully', updated);
  };

  deleteImage = async (req: Request, res: Response): Promise<Response> => {
    await this.service.deleteProductImage(req.params.imageId as string, req.user);
    return ApiResponse.success(res, 'Product image deleted successfully');
  };

  reorderImages = async (req: Request, res: Response): Promise<Response> => {
    const input = reorderProductImagesSchema.parse(req.body);
    await this.service.reorderProductImages(req.params.id as string, input.items, req.user);
    return ApiResponse.success(res, 'Product images reordered successfully');
  };
}

export const productsController = new ProductsController();
