import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import { ApiResponse } from '@/utils/api-response';

const mockResponse = () => {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('ApiResponse Utility', () => {
  it('should format success response correctly with default status 200', () => {
    const res = mockResponse();
    const data = { id: 1, name: 'Diano' };

    ApiResponse.success(res, 'Operation successful', data);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        statusCode: 200,
        message: 'Operation successful',
        data,
      }),
    );
  });

  it('should format created response with status 201', () => {
    const res = mockResponse();
    const createdItem = { id: 101, title: 'Item Created' };

    ApiResponse.created(res, 'Item created successfully', createdItem);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        statusCode: 201,
        message: 'Item created successfully',
        data: createdItem,
      }),
    );
  });

  it('should format paginated response with metadata', () => {
    const res = mockResponse();
    const items = [{ id: 1 }, { id: 2 }];
    const meta = {
      page: 1,
      limit: 10,
      totalItems: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    };

    ApiResponse.paginated(res, 'Items retrieved', items, meta);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        statusCode: 200,
        data: items,
        meta: { pagination: meta },
      }),
    );
  });

  it('should format error response with custom status code', () => {
    const res = mockResponse();
    const errorDetails = [{ field: 'email', message: 'Invalid email' }];

    ApiResponse.error(res, 'Validation failed', 400, errorDetails);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        errors: errorDetails,
      }),
    );
  });
});
