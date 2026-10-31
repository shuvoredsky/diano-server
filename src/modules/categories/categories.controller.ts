import type { Request, Response } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { categoriesService, type CategoriesService } from './categories.service';
import {
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
  reorderCategoriesSchema,
  updateCategoryImageSchema,
  deleteCategoryQuerySchema,
  updateSpecificationTemplateSchema,
} from './categories.validation';

export class CategoriesController {
  constructor(private readonly service: CategoriesService = categoriesService) {}

  // ================= Public Endpoints =================

  getPublicTree = async (_req: Request, res: Response): Promise<Response> => {
    const tree = await this.service.getPublicCategoriesTree();
    return ApiResponse.success(res, 'Active categories retrieved successfully', tree);
  };

  getPublicBySlug = async (req: Request, res: Response): Promise<Response> => {
    const category = await this.service.getPublicCategoryBySlug(req.params.slug as string);
    return ApiResponse.success(res, 'Category details retrieved successfully', category);
  };

  // ================= Admin Endpoints =================

  getAdminCategories = async (_req: Request, res: Response): Promise<Response> => {
    const categories = await this.service.getAdminCategories();
    return ApiResponse.success(res, 'Categories retrieved successfully', categories);
  };

  getCategoryById = async (req: Request, res: Response): Promise<Response> => {
    const category = await this.service.getCategoryById(req.params.id as string);
    return ApiResponse.success(res, 'Category details retrieved successfully', category);
  };

  createCategory = async (req: Request, res: Response): Promise<Response> => {
    const input = createCategorySchema.parse(req.body);
    const category = await this.service.createCategory(input, req.user);
    return ApiResponse.created(res, 'Category created successfully', category);
  };

  updateCategory = async (req: Request, res: Response): Promise<Response> => {
    const input = updateCategorySchema.parse(req.body);
    const category = await this.service.updateCategory(req.params.id as string, input, req.user);
    return ApiResponse.success(res, 'Category updated successfully', category);
  };

  deleteCategory = async (req: Request, res: Response): Promise<Response> => {
    const query = deleteCategoryQuerySchema.parse(req.query);
    const deleted = await this.service.deleteCategory(
      req.params.id as string,
      query.reassignToId,
      req.user,
    );
    return ApiResponse.success(res, 'Category deleted successfully', deleted);
  };

  updateStatus = async (req: Request, res: Response): Promise<Response> => {
    const input = updateCategoryStatusSchema.parse(req.body);
    const updated = await this.service.updateStatus(
      req.params.id as string,
      input.isActive,
      req.user,
    );
    return ApiResponse.success(res, 'Category status updated successfully', updated);
  };

  updateImage = async (req: Request, res: Response): Promise<Response> => {
    const input = updateCategoryImageSchema.parse(req.body);
    const updated = await this.service.updateImage(
      req.params.id as string,
      input.image,
      req.user,
    );
    return ApiResponse.success(res, 'Category image updated successfully', updated);
  };

  uploadImage = async (req: Request, res: Response): Promise<Response> => {
    if (!req.file) {
      throw AppError.badRequest('No image file provided');
    }
    const updated = await this.service.uploadCategoryImage(
      req.params.id as string,
      req.file,
      req.user,
    );
    return ApiResponse.success(res, 'Category image uploaded successfully', updated);
  };

  reorderCategories = async (req: Request, res: Response): Promise<Response> => {
    const input = reorderCategoriesSchema.parse(req.body);
    await this.service.reorderCategories(input.items, req.user);
    return ApiResponse.success(res, 'Categories reordered successfully');
  };

  getProductFormSchema = async (req: Request, res: Response): Promise<Response> => {
    const schema = await this.service.getProductFormSchema(req.params.id as string);
    return ApiResponse.success(res, 'Category product form schema retrieved successfully', schema);
  };

  updateSpecificationTemplate = async (req: Request, res: Response): Promise<Response> => {
    const input = updateSpecificationTemplateSchema.parse(req.body);
    const updated = await this.service.updateSpecificationTemplate(
      req.params.id as string,
      input.template,
      req.user,
    );
    return ApiResponse.success(
      res,
      'Category specification template updated successfully',
      updated,
    );
  };
}

export const categoriesController = new CategoriesController();
