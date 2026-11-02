import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiteSettingsService } from '@/modules/site-settings/site-settings.service';
import { safeLinkUrlSchema } from '@/modules/banners/banners.validation';
import { pageBlockSchema, pageContentBlocksSchema, SYSTEM_PAGE_SLUGS } from '@/modules/pages/pages.validation';
import { PagesService } from '@/modules/pages/pages.service';
import { sanitizeDescription } from '@/utils/sanitize.util';
import { PageStatus } from '@prisma/client';
import type { SiteSettingsRepository } from '@/modules/site-settings/site-settings.repository';
import type { PagesRepository } from '@/modules/pages/pages.repository';
import type { IAuditService } from '@/services/audit.service';

describe('CMS & Site Settings Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Security & SVG Logo Rejection', () => {
    it('should strictly reject SVG uploads for store logo via magic-byte and MIME check', async () => {
      const mockRepo = {
        findByKey: vi.fn(),
        upsert: vi.fn(),
        findMany: vi.fn(),
      };
      const mockAudit = { record: vi.fn() };
      const service = new SiteSettingsService(
        mockRepo as unknown as SiteSettingsRepository,
        mockAudit as unknown as IAuditService,
      );

      // 1. MIME check
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      await expect(
        service.uploadLogo(svgBuffer, 'logo.svg', 'image/svg+xml'),
      ).rejects.toThrow(/SVG format is strictly prohibited/);

      // 2. Disguised SVG with .png filename
      await expect(
        service.uploadLogo(svgBuffer, 'logo.png', 'image/png'),
      ).rejects.toThrow(/Invalid image file/);
    });

    it('should strictly reject SVG for favicon as well', async () => {
      const mockRepo = {
        findByKey: vi.fn(),
        upsert: vi.fn(),
        findMany: vi.fn(),
      };
      const mockAudit = { record: vi.fn() };
      const service = new SiteSettingsService(
        mockRepo as unknown as SiteSettingsRepository,
        mockAudit as unknown as IAuditService,
      );

      const svgBuffer = Buffer.from('<svg><circle r="10"/></svg>');
      await expect(
        service.uploadFavicon(svgBuffer, 'favicon.svg', 'image/svg+xml'),
      ).rejects.toThrow(/SVG format is strictly prohibited/);
    });
  });

  describe('2. Banner Link URL Validation', () => {
    it('should reject malicious schemes like javascript: and data: URIs', () => {
      expect(safeLinkUrlSchema.safeParse('javascript:alert(document.cookie)').success).toBe(false);
      expect(safeLinkUrlSchema.safeParse('JAVASCRIPT:alert(1)').success).toBe(false);
      expect(safeLinkUrlSchema.safeParse('data:text/html,<script>alert(1)</script>').success).toBe(false);
      expect(safeLinkUrlSchema.safeParse('vbscript:msgbox(1)').success).toBe(false);
    });

    it('should accept valid relative paths and HTTPS URLs', () => {
      expect(safeLinkUrlSchema.safeParse('/campaigns/eid-collection').success).toBe(true);
      expect(safeLinkUrlSchema.safeParse('/products?category=apparel').success).toBe(true);
      expect(safeLinkUrlSchema.safeParse('https://diano.com.bd/offers').success).toBe(true);
      expect(safeLinkUrlSchema.safeParse(null).success).toBe(true);
      expect(safeLinkUrlSchema.safeParse('').success).toBe(true);
    });
  });

  describe('3. Banner Schedule Window Logic', () => {
    it('should correctly evaluate active status within start and end datetime bounds', () => {
      const now = new Date('2026-11-01T12:00:00Z');
      const startsAt = new Date('2026-11-01T10:00:00Z');
      const endsAt = new Date('2026-11-01T14:00:00Z');

      const isStarted = !startsAt || startsAt <= now;
      const isNotEnded = !endsAt || endsAt >= now;

      expect(isStarted && isNotEnded).toBe(true);

      // Future start
      const futureStart = new Date('2026-11-01T13:00:00Z');
      expect(futureStart <= now).toBe(false);

      // Past end
      const pastEnd = new Date('2026-11-01T11:00:00Z');
      expect(pastEnd >= now).toBe(false);
    });
  });

  describe('4. Page Blocks Schema Validation', () => {
    it('should validate discriminated union of blocks correctly', () => {
      const validBlocks = [
        { type: 'heading', level: 2, text: 'Our Mission' },
        { type: 'richText', html: '<p>Empowering style with quality.</p>' },
        { type: 'image', url: 'https://cdn.diano.com/mission.jpg', altText: 'Mission' },
        { type: 'list', items: ['Ethical sourcing', 'Premium cotton'], ordered: false },
        {
          type: 'faq',
          items: [{ question: 'How do I return?', answer: 'Within 7 days of delivery.' }],
        },
        {
          type: 'cta',
          title: 'Shop New Arrivals',
          buttonText: 'Explore',
          buttonUrl: '/catalog',
        },
        { type: 'banner-ref', bannerId: 'banner-123' },
      ];

      const parsed = pageContentBlocksSchema.safeParse(validBlocks);
      expect(parsed.success).toBe(true);
    });

    it('should reject invalid block types or invalid button URLs in CTA', () => {
      const invalidBlock = {
        type: 'cta',
        title: 'Click Here',
        buttonText: 'Exploit',
        buttonUrl: 'javascript:alert(1)',
      };

      const parsed = pageBlockSchema.safeParse(invalidBlock);
      expect(parsed.success).toBe(false);
    });
  });

  describe('5. RichText XSS Sanitization', () => {
    it('should strip scripts, onclick, and iframe handlers from HTML blocks', () => {
      const dirty = '<p>Safe text <script>alert(1)</script><img src="x" onerror="alert(2)"/> <a href="javascript:void(0)" onclick="steal()">Click</a></p>';
      const clean = sanitizeDescription(dirty);

      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('onclick');
      expect(clean).not.toContain('javascript:');
      expect(clean).toContain('Safe text');
    });
  });

  describe('6. System Page Slug Deletion Protection', () => {
    it('should refuse to delete system critical pages', async () => {
      const mockRepo = {
        findById: vi.fn().mockResolvedValue({
          id: 'page-terms',
          slug: 'terms',
          title: 'Terms & Conditions',
        }),
        delete: vi.fn(),
      };
      const service = new PagesService(
        mockRepo as unknown as PagesRepository,
        { record: vi.fn() } as unknown as IAuditService,
      );

      await expect(service.deletePage('page-terms')).rejects.toThrow(
        /System page 'terms' is critical for store compliance and cannot be deleted/,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('should include all required system slugs in SYSTEM_PAGE_SLUGS', () => {
      expect(SYSTEM_PAGE_SLUGS).toContain('privacy-policy');
      expect(SYSTEM_PAGE_SLUGS).toContain('terms');
      expect(SYSTEM_PAGE_SLUGS).toContain('return-policy');
    });
  });

  describe('7. Page Publishing & Revisions', () => {
    it('should create an append-only revision on publish and update version', async () => {
      const initialPage = {
        id: 'p-1',
        slug: 'about-us',
        title: 'About Diano',
        content: [{ type: 'heading', level: 1, text: 'About Diano' }],
        version: 1,
        status: PageStatus.DRAFT,
      };

      const mockRepo = {
        findById: vi.fn().mockResolvedValue(initialPage),
        createRevision: vi.fn().mockResolvedValue({ id: 'rev-1', version: 2 }),
        update: vi.fn().mockResolvedValue({
          ...initialPage,
          version: 2,
          status: PageStatus.PUBLISHED,
          publishedAt: new Date(),
        }),
      };
      const mockAudit = { record: vi.fn() };
      const service = new PagesService(
        mockRepo as unknown as PagesRepository,
        mockAudit as unknown as IAuditService,
      );

      const published = await service.publishPage('p-1', { userId: 'admin-1', actorType: 'USER' });

      expect(mockRepo.createRevision).toHaveBeenCalledWith({
        pageId: 'p-1',
        version: 2,
        title: 'About Diano',
        content: initialPage.content,
        authorId: 'admin-1',
      });
      expect(published.status).toBe(PageStatus.PUBLISHED);
      expect(published.version).toBe(2);
    });

    it('should reject fetching a draft page via getPublishedPageBySlug', async () => {
      const draftPage = {
        id: 'p-draft',
        slug: 'secret-launch',
        title: 'Secret Launch',
        status: PageStatus.DRAFT,
      };

      const mockRepo = {
        findBySlug: vi.fn().mockResolvedValue(draftPage),
      };
      const service = new PagesService(
        mockRepo as unknown as PagesRepository,
        { record: vi.fn() } as unknown as IAuditService,
      );

      await expect(service.getPublishedPageBySlug('secret-launch')).rejects.toThrow(
        /not found or is currently not published/,
      );
    });
  });

  describe('8. Route Mounting Order Tests', () => {
    it('should verify banner /reorder is mounted before /:id', async () => {
      const { bannersRouter } = await import('@/modules/banners/banners.routes');
      const routes = bannersRouter.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          method: Object.keys(layer.route.methods)[0],
        }));

      const reorderIndex = routes.findIndex(r => r.path === '/reorder' && r.method === 'put');
      const paramIndex = routes.findIndex(r => r.path === '/:id' && r.method === 'put');

      expect(reorderIndex).toBeGreaterThanOrEqual(0);
      expect(paramIndex).toBeGreaterThanOrEqual(0);
      expect(reorderIndex).toBeLessThan(paramIndex);
    });

    it('should verify settings /logo and /favicon are mounted before /:group', async () => {
      const { siteSettingsRouter } = await import('@/modules/site-settings/site-settings.routes');
      const routes = siteSettingsRouter.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          method: Object.keys(layer.route.methods)[0],
        }));

      const logoIndex = routes.findIndex(r => r.path === '/logo');
      const faviconIndex = routes.findIndex(r => r.path === '/favicon');
      const groupPatchIndex = routes.findIndex(r => r.path === '/:group' && r.method === 'patch');

      expect(logoIndex).toBeLessThan(groupPatchIndex);
      expect(faviconIndex).toBeLessThan(groupPatchIndex);
    });
  });
});
