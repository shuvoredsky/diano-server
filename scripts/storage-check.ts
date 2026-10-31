/**
 * Manual Cloudinary Storage Health Check Script
 * Run with: npm run storage:check
 *
 * Checks if Cloudinary credentials are configured, uploads a tiny test image,
 * verifies the URL generation, and cleans it up.
 * Never prints secrets or API keys.
 */
import { env } from '@/config/env.config';
import { CloudinaryAdapter } from '@/services/storage.service';

async function runStorageCheck(): Promise<void> {
  console.info('=== Cloudinary Storage Health Check ===');

  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    console.info('[Storage Check] Cloudinary credentials are not configured in .env.');
    console.info('[Storage Check] Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to enable cloud uploads.');
    console.info('[Storage Check] Local disk storage or disabled mode is active.');
    return;
  }

  console.info(`[Storage Check] Configured Cloud Name: ${env.CLOUDINARY_CLOUD_NAME}`);
  console.info('[Storage Check] Initializing CloudinaryAdapter and uploading 1x1 test PNG...');

  const adapter = new CloudinaryAdapter();

  // Valid 1x1 transparent PNG buffer
  const testPngBuffer = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e527defc0000000049454e44ae426082',
    'hex',
  );

  try {
    const uploadResult = await adapter.upload(
      {
        buffer: testPngBuffer,
        originalname: 'storage-check-probe.png',
        mimetype: 'image/png',
      },
      'diano/diagnostics',
    );

    console.info('[Storage Check] Upload SUCCESS!');
    console.info(`[Storage Check] Public ID: ${uploadResult.publicId}`);
    console.info(`[Storage Check] Secure URL: ${uploadResult.url}`);
    console.info(`[Storage Check] Dimensions: ${uploadResult.width}x${uploadResult.height}, Format: ${uploadResult.format}, Bytes: ${uploadResult.bytes}`);

    if (uploadResult.publicId) {
      console.info('[Storage Check] Cleaning up test asset from Cloudinary...');
      const deleted = await adapter.delete(uploadResult.publicId);
      console.info(`[Storage Check] Cleanup result: ${deleted ? 'SUCCESS' : 'PENDING'}`);
    }

    console.info('=== Storage Health Check Passed ===');
  } catch (error) {
    console.error('[Storage Check] FAILED with error:', (error as Error).message);
    process.exit(1);
  }
}

runStorageCheck().catch(err => {
  console.error('Fatal error in storage check:', err);
  process.exit(1);
});
