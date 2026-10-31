import { describe, it, expect } from 'vitest';
import { getPagination, getPaginationMeta, paginationQuerySchema } from '@/utils/pagination';

describe('Pagination Utility', () => {
  it('should calculate skip and take correctly', () => {
    const res = getPagination({ page: 2, limit: 15 });
    expect(res.page).toBe(2);
    expect(res.limit).toBe(15);
    expect(res.skip).toBe(15);
    expect(res.take).toBe(15);
  });

  it('should apply default values for invalid or missing parameters', () => {
    const res = getPagination({ page: -5, limit: 'invalid' as unknown as number });
    expect(res.page).toBe(1);
    expect(res.limit).toBe(20);
    expect(res.skip).toBe(0);
    expect(res.take).toBe(20);
  });

  it('should respect maxLimit cap', () => {
    const res = getPagination({ page: 1, limit: 500, maxLimit: 50 });
    expect(res.limit).toBe(50);
    expect(res.take).toBe(50);
  });

  it('should compute comprehensive pagination metadata', () => {
    const meta = getPaginationMeta(95, 2, 20);
    expect(meta.totalItems).toBe(95);
    expect(meta.totalPages).toBe(5);
    expect(meta.page).toBe(2);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPrevPage).toBe(true);

    const firstPageMeta = getPaginationMeta(10, 1, 20);
    expect(firstPageMeta.hasNextPage).toBe(false);
    expect(firstPageMeta.hasPrevPage).toBe(false);
  });

  it('should parse and coerce query parameters with paginationQuerySchema', () => {
    const parsed = paginationQuerySchema.parse({
      page: '3',
      limit: '25',
      search: '  laptop  ',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(25);
    expect(parsed.search).toBe('laptop');
    expect(parsed.sortBy).toBe('name');
    expect(parsed.sortOrder).toBe('asc');
  });
});
