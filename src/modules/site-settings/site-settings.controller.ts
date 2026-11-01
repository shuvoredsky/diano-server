import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ApiResponse } from '@/utils/api-response';
import { AppError } from '@/utils/app-error';
import { siteSettingsService, type SiteSettingsService } from './site-settings.service';
import { settingGroupParamSchema } from './site-settings.validation';
import type { SettingGroup } from './site-settings.types';
import type { ActorContext } from '@/services/audit.service';

export class SiteSettingsController {
  constructor(private readonly service: SiteSettingsService = siteSettingsService) {}

  getGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { group } = settingGroupParamSchema.parse(req.params);
      const data = await this.service.getSettingGroup(group as SettingGroup);
      ApiResponse.success(res, `Settings for [${group}] retrieved`, data);
    } catch (error) {
      next(error);
    }
  };

  updateGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { group } = settingGroupParamSchema.parse(req.params);
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const updated = await this.service.updateSettingGroup(group as SettingGroup, req.body, actor);
      ApiResponse.success(res, `Settings for [${group}] updated successfully`, updated);
    } catch (error) {
      next(error);
    }
  };

  uploadLogo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        throw AppError.badRequest('No image file uploaded');
      }
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const result = await this.service.uploadLogo(
        file.buffer,
        file.originalname,
        file.mimetype,
        actor,
      );
      ApiResponse.success(res, 'Logo uploaded and updated successfully', result);
    } catch (error) {
      next(error);
    }
  };

  uploadFavicon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        throw AppError.badRequest('No favicon file uploaded');
      }
      const actor: ActorContext = {
        userId: req.user?.userId,
        email: req.user?.email,
        actorType: 'USER',
      };
      const result = await this.service.uploadFavicon(
        file.buffer,
        file.originalname,
        file.mimetype,
        actor,
      );
      ApiResponse.success(res, 'Favicon uploaded and updated successfully', result);
    } catch (error) {
      next(error);
    }
  };

  getPublicSiteConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await this.service.getPublicSiteConfig();
      const serialized = JSON.stringify(config);
      const etag = `W/"${crypto.createHash('md5').update(serialized).digest('hex')}"`;

      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
      res.setHeader('ETag', etag);

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && (clientEtag === etag || clientEtag === etag.replace('W/', ''))) {
        res.status(304).end();
        return;
      }

      ApiResponse.success(res, 'Public site configuration retrieved', config);
    } catch (error) {
      next(error);
    }
  };
}

export const siteSettingsController = new SiteSettingsController();
