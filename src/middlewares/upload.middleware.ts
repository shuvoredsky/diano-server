import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { env } from '@/config/env.config';
import { AppError } from '@/utils/app-error';

const storage = multer.memoryStorage();

const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void => {
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(AppError.badRequest('Only JPEG, PNG, and WebP image files are allowed. SVG and other files are blocked.'));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_IMAGE_SIZE_MB * 1024 * 1024,
    files: 10,
  },
  fileFilter,
});

export const handleUploadSingle = (fieldName = 'image') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    upload.single(fieldName)(req, res, err => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            AppError.badRequest(
              `File exceeds size limit of ${env.MAX_IMAGE_SIZE_MB}MB`,
            ),
          );
        }
        return next(AppError.badRequest(`File upload error: ${err.message}`));
      }
      if (err) {
        return next(err);
      }
      next();
    });
  };
};

export const handleUploadMultiple = (fieldName = 'images', maxCount = 10) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    upload.array(fieldName, maxCount)(req, res, err => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            AppError.badRequest(
              `One or more files exceed the size limit of ${env.MAX_IMAGE_SIZE_MB}MB`,
            ),
          );
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(AppError.badRequest(`Cannot upload more than ${maxCount} files at once`));
        }
        return next(AppError.badRequest(`File upload error: ${err.message}`));
      }
      if (err) {
        return next(err);
      }
      next();
    });
  };
};
