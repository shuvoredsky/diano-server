import { describe, it, expect } from 'vitest';
import { checkOpenApiCoverage } from '../../scripts/openapi-coverage';

describe('OpenAPI Coverage Verification', () => {
  it('should achieve 100% route coverage with zero undocumented endpoints', () => {
    const { totalEndpoints, documentedCount, undocumentedRoutes } = checkOpenApiCoverage();

    expect(totalEndpoints).toBeGreaterThanOrEqual(253);
    expect(documentedCount).toBeGreaterThanOrEqual(253);
    expect(undocumentedRoutes).toEqual([]);
  });
});
