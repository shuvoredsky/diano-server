import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@/utils/api-response';
import { pagesService, type PagesService } from './pages.service';
import { pageFilterSchema } from './pages.validation';
import type { ActorContext } from '@/services/audit.service';

export class PagesController {
  constructor(private readonly service: PagesService = pagesService) {}

  createPage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const page = await this.service.createPage(req.body, actor);
      ApiResponse.created(res, 'Page created successfully', page);
    } catch (error) {
      next(error);
    }
  };

  listPages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = pageFilterSchema.parse(req.query);
      const result = await this.service.listPages(filter);
      ApiResponse.paginated(res, 'Pages retrieved', result.items, {
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

  getPageById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = await this.service.getPageById(req.params.id as string);
      ApiResponse.success(res, 'Page details retrieved', page);
    } catch (error) {
      next(error);
    }
  };

  updatePage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const updated = await this.service.updatePage(req.params.id as string, req.body, actor);
      ApiResponse.success(res, 'Page updated successfully', updated);
    } catch (error) {
      next(error);
    }
  };

  deletePage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const deleted = await this.service.deletePage(req.params.id as string, actor);
      ApiResponse.success(res, 'Page deleted successfully', deleted);
    } catch (error) {
      next(error);
    }
  };

  publishPage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const published = await this.service.publishPage(req.params.id as string, actor);
      ApiResponse.success(res, 'Page published successfully and revision captured', published);
    } catch (error) {
      next(error);
    }
  };

  unpublishPage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const unpublished = await this.service.unpublishPage(req.params.id as string, actor);
      ApiResponse.success(res, 'Page unpublished to draft status', unpublished);
    } catch (error) {
      next(error);
    }
  };

  listRevisions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const revisions = await this.service.listRevisions(req.params.id as string);
      ApiResponse.success(res, 'Page revision history retrieved', revisions);
    } catch (error) {
      next(error);
    }
  };

  restoreRevision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const version = parseInt(req.params.version as string, 10);
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const restored = await this.service.restoreRevision(req.params.id as string, version, actor);
      ApiResponse.success(res, `Page restored to version ${version}`, restored);
    } catch (error) {
      next(error);
    }
  };

  getPublicPageBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = await this.service.getPublishedPageBySlug(req.params.slug as string);
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
      ApiResponse.success(res, 'Page retrieved successfully', page);
    } catch (error) {
      next(error);
    }
  };

  getPublicNavList = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const navList = await this.service.getPublicNavList();
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
      ApiResponse.success(res, 'Public pages navigation list', navList);
    } catch (error) {
      next(error);
    }
  };
}

export const pagesController = new PagesController();
