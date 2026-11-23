import type { Request, Response } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { getPaginationMeta } from '@/utils/pagination';
import { sectionsService, type SectionsService } from './sections.service';
import {
  assignSectionProductsSchema,
  createSectionSchema,
  reorderSectionProductsSchema,
  reorderSectionsSchema,
  sectionProductsQuerySchema,
  updateSectionSchema,
} from './sections.validation';

export class SectionsController {
  constructor(private readonly service: SectionsService = sectionsService) {}

  // ================= Admin Endpoints =================

  getAdminSections = async (_req: Request, res: Response): Promise<Response> => {
    const sections = await this.service.getAdminSections();
    return ApiResponse.success(res, 'Sections retrieved successfully', sections);
  };

  getSectionById = async (req: Request, res: Response): Promise<Response> => {
    const section = await this.service.getSectionById(req.params.id as string);
    return ApiResponse.success(res, 'Section retrieved successfully', section);
  };

  createSection = async (req: Request, res: Response): Promise<Response> => {
    const input = createSectionSchema.parse(req.body);
    const created = await this.service.createSection(input, req.user);
    return ApiResponse.created(res, 'Section created successfully', created);
  };

  updateSection = async (req: Request, res: Response): Promise<Response> => {
    const input = updateSectionSchema.parse(req.body);
    const updated = await this.service.updateSection(req.params.id as string, input, req.user);
    return ApiResponse.success(res, 'Section updated successfully', updated);
  };

  deleteSection = async (req: Request, res: Response): Promise<Response> => {
    const deleted = await this.service.deleteSection(req.params.id as string, req.user);
    return ApiResponse.success(res, 'Section deleted successfully', deleted);
  };

  toggleActive = async (req: Request, res: Response): Promise<Response> => {
    const updated = await this.service.toggleActive(req.params.id as string, req.user);
    return ApiResponse.success(res, 'Section status updated successfully', updated);
  };

  reorderSections = async (req: Request, res: Response): Promise<Response> => {
    const input = reorderSectionsSchema.parse(req.body);
    await this.service.reorderSections(input.items, req.user);
    return ApiResponse.success(res, 'Sections reordered successfully');
  };

  assignProducts = async (req: Request, res: Response): Promise<Response> => {
    const input = assignSectionProductsSchema.parse(req.body);
    await this.service.assignProducts(req.params.id as string, input, req.user);
    return ApiResponse.success(res, 'Products assigned to section successfully');
  };

  removeProduct = async (req: Request, res: Response): Promise<Response> => {
    await this.service.removeProduct(
      req.params.id as string,
      req.params.productId as string,
      req.user,
    );
    return ApiResponse.success(res, 'Product removed from section successfully');
  };

  reorderProducts = async (req: Request, res: Response): Promise<Response> => {
    const input = reorderSectionProductsSchema.parse(req.body);
    await this.service.reorderProducts(req.params.id as string, input, req.user);
    return ApiResponse.success(res, 'Section products reordered successfully');
  };

  // ================= Public Endpoints =================

  getPublicSections = async (_req: Request, res: Response): Promise<Response> => {
    const sections = await this.service.getPublicSections();
    return ApiResponse.success(res, 'Storefront sections retrieved successfully', sections);
  };

  getPublicSectionProducts = async (req: Request, res: Response): Promise<Response> => {
    const query = sectionProductsQuerySchema.parse(req.query);
    const result = await this.service.getPublicSectionProducts(
      req.params.slug as string,
      query.page,
      query.limit,
    );
    return ApiResponse.paginated(
      res,
      'Section products retrieved successfully',
      result.items,
      getPaginationMeta(result.total, result.page, result.limit),
    );
  };
}

export const sectionsController = new SectionsController();

