import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { bannersService, type BannersService } from './banners.service';
import {
  bannerFilterSchema,
  publicBannerQuerySchema,
} from './banners.validation';
import type { ActorContext } from '@/services/audit.service';

export class BannersController {
  constructor(private readonly service: BannersService = bannersService) {}

  createBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const banner = await this.service.createBanner(req.body, actor);
      ApiResponse.created(res, 'Banner created successfully', banner);
    } catch (error) {
      next(error);
    }
  };

  listBanners = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = bannerFilterSchema.parse(req.query);
      const result = await this.service.listBanners(filter);
      ApiResponse.paginated(res, 'Banners retrieved', result.items, {
        page: result.page,
        limit: result.limit,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.page < result.totalPages,
        hasPrevPage: result.page > 1,
      });
    } catch (error) {
      next(error);
    }
  };

  getBannerById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const banner = await this.service.getBannerById(req.params.id as string);
      ApiResponse.success(res, 'Banner details retrieved', banner);
    } catch (error) {
      next(error);
    }
  };

  updateBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const updated = await this.service.updateBanner(req.params.id as string, req.body, actor);
      ApiResponse.success(res, 'Banner updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  toggleActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const toggled = await this.service.toggleActive(req.params.id as string, actor);
      ApiResponse.success(
        res,
        `Banner ${toggled.isActive ? 'activated' : 'deactivated'} successfully`,
        toggled,
      );
    } catch (error) {
      next(error);
    }
  };

  deleteBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const deleted = await this.service.deleteBanner(req.params.id as string, actor);
      ApiResponse.success(res, 'Banner deleted successfully', deleted);
    } catch (error) {
      next(error);
    }
  };

  reorderBanners = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      await this.service.reorderBanners(req.body.items, actor);
      ApiResponse.success(res, 'Banners reordered successfully');
    } catch (error) {
      next(error);
    }
  };

  getPublicBanners = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { placement } = publicBannerQuerySchema.parse(req.query);
      const banners = await this.service.getActiveBanners(placement);

      res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600');
      ApiResponse.success(res, `Active banners for ${placement}`, banners);
    } catch (error) {
      next(error);
    }
  };
}

export const bannersController = new BannersController();
