import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StorageService,
  LocalDiskAdapter,
  CloudinaryAdapter,
  validateImageSignature,
} from '@/services/storage.service';
import { env } from '@/config/env.config';
import fs from 'fs/promises';

describe('StorageService & Image Security (Unit Tests)', () => {
  // Sample valid signatures
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const validWebpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Magic Byte Signature Verification', () => {
    it('should correctly identify valid JPEG image buffer', () => {
      const res = validateImageSignature(validJpegBuffer);
      expect(res.isValid).toBe(true);
      expect(res.mimeType).toBe('image/jpeg');
      expect(res.ext).toBe('jpg');
    });

    it('should correctly identify valid PNG image buffer', () => {
      const res = validateImageSignature(validPngBuffer);
      expect(res.isValid).toBe(true);
      expect(res.mimeType).toBe('image/png');
      expect(res.ext).toBe('png');
    });

    it('should correctly identify valid WebP image buffer', () => {
      const res = validateImageSignature(validWebpBuffer);
      expect(res.isValid).toBe(true);
      expect(res.mimeType).toBe('image/webp');
      expect(res.ext).toBe('webp');
    });

    it('should reject fake extension files with non-image magic bytes', () => {
      const fakeJpg = Buffer.from('console.log("malicious code masquerading as jpg");');
      const res = validateImageSignature(fakeJpg);
      expect(res.isValid).toBe(false);
    });

    it('should explicitly block SVG files to prevent XSS attacks', () => {
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      const res = validateImageSignature(svgBuffer);
      expect(res.isValid).toBe(false);
    });

    it('should reject executable binaries (MZ header)', () => {
      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
      const res = validateImageSignature(exeBuffer);
      expect(res.isValid).toBe(false);
    });
  });

  describe('StorageService Upload Security Rules', () => {
    it('should reject oversized image files (> 5MB)', async () => {
      const service = new StorageService();
      const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB

      await expect(
        service.uploadImage({
          buffer: oversizedBuffer,
          originalname: 'huge.jpg',
          mimetype: 'image/jpeg',
        }),
      ).rejects.toThrow(/exceeds maximum allowed limit of/);
    });

    it('should reject upload if magic-byte validation fails despite valid MIME header', async () => {
      const service = new StorageService();
      const fakeBuffer = Buffer.from('plain text masquerading as jpeg');

      await expect(
        service.uploadImage({
          buffer: fakeBuffer,
          originalname: 'invoice.jpg',
          mimetype: 'image/jpeg',
        }),
      ).rejects.toThrow('Invalid file type');
    });

    it('should neutralize path traversal attempts in filenames by generating a safe UUID filename', async () => {
      vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined as unknown as string);
      vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const localAdapter = new LocalDiskAdapter();
      const service = new StorageService(localAdapter);

      const result = await service.uploadImage(
        {
          buffer: validJpegBuffer,
          originalname: '../../../../etc/passwd.jpg',
          mimetype: 'image/jpeg',
        },
        'products',
      );

      // Key must not contain path traversal characters
      expect(result.key).not.toContain('..');
      expect(result.key).not.toContain('etc');
      expect(result.url).toMatch(/^\/uploads\/products\/[a-f0-9-]+\.jpg$/);
    });
  });

  describe('CloudinaryAdapter without credentials', () => {
    it('should throw an error and never fake success if Cloudinary credentials are missing', async () => {
      const origSecret = env.CLOUDINARY_API_SECRET;
      (env as Record<string, unknown>).CLOUDINARY_API_SECRET = '';
      try {
        const cloudinaryAdapter = new CloudinaryAdapter();

        await expect(
          cloudinaryAdapter.upload({
            buffer: validJpegBuffer,
            originalname: 'sample.jpg',
            mimetype: 'image/jpeg',
          }),
        ).rejects.toThrow(/Storage service is not configured/);
      } finally {
        (env as Record<string, unknown>).CLOUDINARY_API_SECRET = origSecret;
      }
    });
  });
});
