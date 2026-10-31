import type { Response } from 'express';

export interface ApiResponsePayload<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export class ApiResponse {
  static success<T>(
    res: Response,
    message = 'Success',
    data?: T,
    statusCode = 200,
    meta?: Record<string, unknown>,
  ): Response {
    const payload: ApiResponsePayload<T> = {
      success: true,
      statusCode,
      message,
      ...(data !== undefined && { data }),
      ...(meta !== undefined && { meta }),
      timestamp: new Date().toISOString(),
    };
    return res.status(statusCode).json(payload);
  }

  static created<T>(
    res: Response,
    message = 'Created successfully',
    data?: T,
    meta?: Record<string, unknown>,
  ): Response {
    return this.success(res, message, data, 201, meta);
  }

  static paginated<T>(
    res: Response,
    message = 'Data retrieved successfully',
    items: T[],
    paginationMeta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    },
  ): Response {
    return this.success(res, message, items, 200, { pagination: paginationMeta });
  }

  static error(
    res: Response,
    message = 'An error occurred',
    statusCode = 500,
    errors?: unknown,
  ): Response {
    const payload: ApiResponsePayload<unknown> & { errors?: unknown } = {
      success: false,
      statusCode,
      message,
      ...(errors !== undefined && { errors }),
      timestamp: new Date().toISOString(),
    };
    return res.status(statusCode).json(payload);
  }
}
