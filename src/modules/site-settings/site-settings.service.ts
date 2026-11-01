import { AppError } from '@/utils/app-error';
import { validateImageSignature, storageService } from '@/services/storage.service';
import { auditService, recordAuditSafe, type ActorContext, type IAuditService } from '@/services/audit.service';
import {
  type ISiteSettingsRepository,
  siteSettingsRepository,
} from './site-settings.repository';
import {
  type SettingGroup,
  type StoreProfileSetting,
  type InvoiceSetting,
  type SeoDefaultsSetting,
  type ContactSetting,
  type PublicSiteConfig,
} from './site-settings.types';
import { getGroupSchema } from './site-settings.validation';
import type { Prisma } from '@prisma/client';

export const DEFAULT_SETTINGS: Record<SettingGroup, unknown> = {
  store_profile: {
    storeName: 'Diano Fashion',
    tagline: 'Premium Minimalist Fashion',
    phone: '+8801700000000',
    email: 'support@diano.com.bd',
    address: 'Dhaka, Bangladesh',
    socialLinks: {
      facebook: 'https://facebook.com/dianofashion',
      instagram: 'https://instagram.com/dianofashion',
    },
  } satisfies StoreProfileSetting,

  invoice: {
    prefix: 'INV',
    footerNote: 'Thank you for shopping with Diano.',
    termsNote: 'Please keep this invoice for any return or warranty queries within 7 days.',
    showLogo: true,
    signatureText: 'Authorized Signatory',
  } satisfies InvoiceSetting,

  seo_defaults: {
    titleTemplate: '%s | Diano Fashion',
    description: 'Curated premium fashion, apparel and lifestyle essentials in Bangladesh.',
  } satisfies SeoDefaultsSetting,

  contact: {
    supportPhone: '+8801700000000',
    supportEmail: 'support@diano.com.bd',
    address: 'Tejgaon Industrial Area, Dhaka 1208, Bangladesh',
    supportHours: 'Saturday - Thursday: 10:00 AM - 8:00 PM (Dhaka Time)',
  } satisfies ContactSetting,
};

export class SiteSettingsService {
  constructor(
    private readonly repo: ISiteSettingsRepository = siteSettingsRepository,
    private readonly audit: IAuditService = auditService,
  ) {}

  async getSettingGroup<T = unknown>(group: SettingGroup): Promise<T> {
    const record = await this.repo.findByKey(group);
    if (!record || !record.value) {
      return (DEFAULT_SETTINGS[group] ?? {}) as T;
    }
    return record.value as T;
  }

  async updateSettingGroup<T = unknown>(
    group: SettingGroup,
    data: unknown,
    actor?: ActorContext,
  ): Promise<T> {
    const schema = getGroupSchema(group);
    const parsed = schema.parse(data);

    const previousRecord = await this.repo.findByKey(group);
    const previousValue = previousRecord?.value ?? DEFAULT_SETTINGS[group];

    const isPublic = group !== 'invoice';
    const updated = await this.repo.upsert(
      group,
      parsed as Prisma.InputJsonValue,
      isPublic,
      `Site configuration group: ${group}`,
    );

    await recordAuditSafe(
      this.audit,
      actor,
      'SETTING_GROUP_UPDATE',
      'Setting',
      group,
      {
        group,
        before: previousValue as Record<string, unknown>,
        after: parsed as Record<string, unknown>,
      },
    );

    return updated.value as T;
  }

  async uploadLogo(
    fileBuffer: Buffer,
    originalname: string,
    mimetype: string,
    actor?: ActorContext,
  ): Promise<{ logoUrl: string }> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw AppError.badRequest('No image file provided');
    }

    // Explicitly reject SVG
    if (mimetype.includes('svg') || originalname.toLowerCase().endsWith('.svg')) {
      throw AppError.badRequest('SVG format is strictly prohibited for security.');
    }

    // Magic-byte signature verification
    const sig = validateImageSignature(fileBuffer);
    if (!sig.isValid || !sig.mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(sig.mimeType)) {
      throw AppError.badRequest('Invalid image file. Only PNG, JPEG, and WebP are allowed for store logo.');
    }

    const uploadRes = await storageService.getAdapter().upload(
      {
        buffer: fileBuffer,
        originalname,
        mimetype: sig.mimeType,
        size: fileBuffer.length,
      },
      'settings',
    );

    const currentProfile = await this.getSettingGroup<StoreProfileSetting>('store_profile');
    const beforeLogo = currentProfile.logo;

    const updatedProfile: StoreProfileSetting = {
      ...currentProfile,
      logo: uploadRes.url,
    };

    await this.repo.upsert('store_profile', updatedProfile as unknown as Prisma.InputJsonValue, true);

    await recordAuditSafe(this.audit, actor, 'SETTING_LOGO_UPDATE', 'Setting', 'store_profile', {
      before: beforeLogo,
      after: uploadRes.url,
    });

    return { logoUrl: uploadRes.url };
  }

  async uploadFavicon(
    fileBuffer: Buffer,
    originalname: string,
    mimetype: string,
    actor?: ActorContext,
  ): Promise<{ faviconUrl: string }> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw AppError.badRequest('No favicon file provided');
    }

    // Max 1MB for favicon
    if (fileBuffer.length > 1024 * 1024) {
      throw AppError.badRequest('Favicon file exceeds maximum limit of 1MB');
    }

    // Reject SVG
    if (mimetype.includes('svg') || originalname.toLowerCase().endsWith('.svg')) {
      throw AppError.badRequest('SVG format is strictly prohibited for security.');
    }

    // Check magic bytes for ICO, PNG, WEBP, JPEG
    let detectedMime: string;
    const isIco =
      fileBuffer.length >= 4 &&
      fileBuffer[0] === 0x00 &&
      fileBuffer[1] === 0x00 &&
      fileBuffer[2] === 0x01 &&
      fileBuffer[3] === 0x00;

    if (isIco) {
      detectedMime = 'image/x-icon';
    } else {
      const sig = validateImageSignature(fileBuffer);
      if (!sig.isValid || !sig.mimeType) {
        throw AppError.badRequest('Invalid favicon file signature. Allowed: ICO, PNG, WebP, JPEG.');
      }
      detectedMime = sig.mimeType;
    }

    const uploadRes = await storageService.getAdapter().upload(
      {
        buffer: fileBuffer,
        originalname,
        mimetype: detectedMime,
        size: fileBuffer.length,
      },
      'settings',
    );

    const currentProfile = await this.getSettingGroup<StoreProfileSetting>('store_profile');
    const beforeFavicon = currentProfile.favicon;

    const updatedProfile: StoreProfileSetting = {
      ...currentProfile,
      favicon: uploadRes.url,
    };

    await this.repo.upsert('store_profile', updatedProfile as unknown as Prisma.InputJsonValue, true);

    await recordAuditSafe(this.audit, actor, 'SETTING_FAVICON_UPDATE', 'Setting', 'store_profile', {
      before: beforeFavicon,
      after: uploadRes.url,
    });

    return { faviconUrl: uploadRes.url };
  }

  async getPublicSiteConfig(): Promise<PublicSiteConfig> {
    const [profile, seo, contact] = await Promise.all([
      this.getSettingGroup<StoreProfileSetting>('store_profile'),
      this.getSettingGroup<SeoDefaultsSetting>('seo_defaults'),
      this.getSettingGroup<ContactSetting>('contact'),
    ]);

    // Return strictly sanitized public fields - exclude BIN/VAT/internal notes
    return {
      storeName: profile.storeName,
      tagline: profile.tagline,
      logo: profile.logo,
      favicon: profile.favicon,
      phone: profile.phone,
      email: profile.email,
      address: profile.address,
      socialLinks: profile.socialLinks,
      seoDefaults: {
        titleTemplate: seo.titleTemplate,
        description: seo.description,
        ogImage: seo.ogImage,
      },
      contact: {
        supportPhone: contact.supportPhone,
        supportEmail: contact.supportEmail,
        address: contact.address,
        supportHours: contact.supportHours,
      },
    };
  }
}

export const siteSettingsService = new SiteSettingsService();
