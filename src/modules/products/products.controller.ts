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
} from './products.validation';
import { permissionsCache } from '@/modules/permissions/permissions.cache';
import { getPaginationMeta } from '@/utils/pagination';

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
    const product = await this.service.getPublicProductBySlug(req.params.slug as string);
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
}

export const productsController = new ProductsController();
