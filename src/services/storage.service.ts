import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';
import { logger } from '@/utils/logger';

export interface UploadResult {
  url: string;
  key: string;
}

export interface FileInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size?: number;
}

export interface IStorageAdapter {
  upload(file: FileInput, folder?: string): Promise<UploadResult>;
  delete(key: string): Promise<boolean>;
  getUrl(key: string): string;
}

/**
 * Validates magic-byte signature of image buffers.
 * Does NOT trust HTTP MIME headers or file extensions.
 * Explicitly rejects SVG, text, HTML, and unrecognized binaries.
 */
export function validateImageSignature(buffer: Buffer): {
  isValid: boolean;
  mimeType?: string;
  ext?: string;
} {
  if (!buffer || buffer.length < 12) {
    return { isValid: false };
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, mimeType: 'image/jpeg', ext: 'jpg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, mimeType: 'image/png', ext: 'png' };
  }

  // 3. WEBP: 'RIFF' (0-3) + 'WEBP' (8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { isValid: true, mimeType: 'image/webp', ext: 'webp' };
  }

  return { isValid: false };
}

/**
 * Local Disk Adapter (Development only)
 * Stores files to /uploads directory with secure randomized filenames.
 */
export class LocalDiskAdapter implements IStorageAdapter {
  private baseDir: string;

  constructor(baseDir = path.resolve(process.cwd(), 'uploads')) {
    this.baseDir = baseDir;
  }

  async upload(file: FileInput, folder = 'general'): Promise<UploadResult> {
    const signature = validateImageSignature(file.buffer);
    if (!signature.isValid || !signature.ext) {
      throw AppError.badRequest(
        'Invalid or corrupted image format. Only verified JPEG, PNG, and WebP are accepted.',
      );
    }

    // Cryptographically secure filename prevents path traversal and collisions
    const safeFilename = `${crypto.randomUUID()}.${signature.ext}`;
    const targetFolder = path.join(this.baseDir, folder);
    await fs.mkdir(targetFolder, { recursive: true });

    const filePath = path.join(targetFolder, safeFilename);
    await fs.writeFile(filePath, file.buffer);

    const relativeKey = `${folder}/${safeFilename}`;
    const url = `/uploads/${relativeKey}`;

    return { url, key: relativeKey };
  }

  async delete(key: string): Promise<boolean> {
    try {
      // Prevent directory traversal on deletion
      const safeKey = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
      const filePath = path.join(this.baseDir, safeKey);
      await fs.unlink(filePath);
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errorMsg, key }, 'Failed to delete local file or file not found');
      return false;
    }
  }

  getUrl(key: string): string {
    return `/uploads/${key}`;
  }
}

/**
 * Cloudinary Storage Adapter
 * Secure cloud storage using Cloudinary SDK
 */
export class CloudinaryAdapter implements IStorageAdapter {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = Boolean(
      env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
    );

    if (this.isConfigured) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: true,
      });
    }
  }

  async upload(file: FileInput, folder = 'diano/products'): Promise<UploadResult> {
    if (!this.isConfigured) {
      throw AppError.internal(
        'Cloudinary adapter selected but credentials (CLOUDINARY_CLOUD_NAME/KEY/SECRET) are not configured in environment',
      );
    }

    const signature = validateImageSignature(file.buffer);
    if (!signature.isValid) {
      throw AppError.badRequest('Invalid or unsupported image file signature');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          allowed_formats: ['jpg', 'png', 'webp'],
          public_id: crypto.randomUUID(),
        },
        (error, result) => {
          if (error || !result) {
            return reject(
              AppError.internal(`Cloudinary upload failed: ${error?.message || 'Unknown error'}`),
            );
          }
          resolve({
            url: result.secure_url,
            key: result.public_id,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  async delete(key: string): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn({ key }, 'Cloudinary delete skipped: credentials not configured');
      return false;
    }

    try {
      const result = await cloudinary.uploader.destroy(key);
      return result.result === 'ok';
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errorMsg, key }, 'Failed to delete Cloudinary asset');
      return false;
    }
  }

  getUrl(key: string): string {
    return cloudinary.url(key, { secure: true });
  }
}

/**
 * Storage Service - Coordinates adapters, magic-byte checks, and security restrictions
 */
export class StorageService {
  private adapter: IStorageAdapter;

  constructor(customAdapter?: IStorageAdapter) {
    if (customAdapter) {
      this.adapter = customAdapter;
    } else if (env.STORAGE_DRIVER === 'cloudinary') {
      this.adapter = new CloudinaryAdapter();
    } else {
      this.adapter = new LocalDiskAdapter();
    }
  }

  getAdapter(): IStorageAdapter {
    return this.adapter;
  }

  /**
   * Upload an image with strict security validation
   */
  async uploadImage(file: FileInput, folder = 'products'): Promise<UploadResult> {
    // 1. File size check
    if (file.buffer.length > env.MAX_FILE_SIZE_BYTES) {
      throw AppError.badRequest(
        `File size exceeds maximum allowed limit of ${Math.round(env.MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB`,
      );
    }

    // 2. Magic byte check (never trust MIME header from client)
    const signature = validateImageSignature(file.buffer);
    if (!signature.isValid) {
      throw AppError.badRequest(
        'Invalid file type. File header does not match permitted image types (JPEG, PNG, WebP). SVGs and executables are blocked.',
      );
    }

    return this.adapter.upload(file, folder);
  }

  /**
   * Delete an image by storage key
   */
  async deleteImage(key: string): Promise<boolean> {
    return this.adapter.delete(key);
  }
}

export const storageService = new StorageService();
