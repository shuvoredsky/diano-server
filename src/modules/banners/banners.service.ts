import { AppError } from '@/utils/app-error';
import { auditService, recordAuditSafe, type ActorContext, type IAuditService } from '@/services/audit.service';
import type { Banner, BannerPlacement } from '@prisma/client';
import {
  type IBannersRepository,
  bannersRepository,
} from './banners.repository';
import type {
  CreateBannerInput,
  UpdateBannerInput,
  BannerFilterOptions,
  BannerReorderItem,
} from './banners.types';
import {
  createBannerSchema,
  updateBannerSchema,
  bannerReorderSchema,
} from './banners.validation';

export const MAX_ACTIVE_BANNERS_PER_PLACEMENT = 10;

export class BannersService {
  constructor(
    private readonly repo: IBannersRepository = bannersRepository,
    private readonly audit: IAuditService = auditService,
  ) {}

  async createBanner(input: CreateBannerInput, actor?: ActorContext): Promise<Banner> {
    const validated = createBannerSchema.parse(input);

    if (validated.isActive) {
      const activeCount = await this.repo.countActiveByPlacement(validated.placement);
      if (activeCount >= MAX_ACTIVE_BANNERS_PER_PLACEMENT) {
        throw AppError.badRequest(
          `Maximum active banner limit (${MAX_ACTIVE_BANNERS_PER_PLACEMENT}) reached for placement [${validated.placement}]. Please deactivate an existing banner first.`,
        );
      }
    }

    const banner = await this.repo.create(validated as CreateBannerInput);

    await recordAuditSafe(this.audit, actor, 'BANNER_CREATE', 'Banner', banner.id, {
      title: banner.title,
      placement: banner.placement,
      isActive: banner.isActive,
    });

    return banner;
  }

  async getBannerById(id: string): Promise<Banner> {
    const banner = await this.repo.findById(id);
    if (!banner) {
      throw AppError.notFound(`Banner with ID '${id}' not found`);
    }
    return banner;
  }

  async updateBanner(id: string, input: UpdateBannerInput, actor?: ActorContext): Promise<Banner> {
    const banner = await this.getBannerById(id);
    const validated = updateBannerSchema.parse(input);

    const targetPlacement = validated.placement ?? banner.placement;
    const willBeActive = validated.isActive !== undefined ? validated.isActive : banner.isActive;

    if (willBeActive && (!banner.isActive || validated.placement !== undefined)) {
      const activeCount = await this.repo.countActiveByPlacement(targetPlacement, id);
      if (activeCount >= MAX_ACTIVE_BANNERS_PER_PLACEMENT) {
        throw AppError.badRequest(
          `Maximum active banner limit (${MAX_ACTIVE_BANNERS_PER_PLACEMENT}) reached for placement [${targetPlacement}].`,
        );
      }
    }

    const updated = await this.repo.update(id, validated as UpdateBannerInput);

    await recordAuditSafe(this.audit, actor, 'BANNER_UPDATE', 'Banner', id, {
      before: {
        title: banner.title,
        placement: banner.placement,
        isActive: banner.isActive,
      },
      after: {
        title: updated.title,
        placement: updated.placement,
        isActive: updated.isActive,
      },
    });

    return updated;
  }

  async toggleActive(id: string, actor?: ActorContext): Promise<Banner> {
    const banner = await this.getBannerById(id);
    const newStatus = !banner.isActive;

    if (newStatus) {
      const activeCount = await this.repo.countActiveByPlacement(banner.placement, id);
      if (activeCount >= MAX_ACTIVE_BANNERS_PER_PLACEMENT) {
        throw AppError.badRequest(
          `Cannot activate banner: maximum limit (${MAX_ACTIVE_BANNERS_PER_PLACEMENT}) reached for [${banner.placement}].`,
        );
      }
    }

    const updated = await this.repo.update(id, { isActive: newStatus });

    await recordAuditSafe(this.audit, actor, 'BANNER_TOGGLE', 'Banner', id, {
      isActive: newStatus,
      placement: banner.placement,
    });

    return updated;
  }

  async deleteBanner(id: string, actor?: ActorContext): Promise<Banner> {
    const banner = await this.getBannerById(id);
    const deleted = await this.repo.delete(id);

    await recordAuditSafe(this.audit, actor, 'BANNER_DELETE', 'Banner', id, {
      title: banner.title,
      placement: banner.placement,
    });

    return deleted;
  }

  async reorderBanners(items: BannerReorderItem[], actor?: ActorContext): Promise<void> {
    const validated = bannerReorderSchema.parse({ items });
    await this.repo.reorder(validated.items);

    await recordAuditSafe(this.audit, actor, 'BANNER_REORDER', 'Banner', undefined, {
      count: validated.items.length,
    });
  }

  async listBanners(
    filter: BannerFilterOptions,
  ): Promise<{ items: Banner[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const { items, total } = await this.repo.findAll(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getActiveBanners(placement: BannerPlacement): Promise<Banner[]> {
    return this.repo.findActiveByPlacement(placement, new Date());
  }
}

export const bannersService = new BannersService();
