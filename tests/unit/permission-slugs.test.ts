import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { permissionsData } from '../../prisma/seed';

function collectRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.routes.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractRequirePermissionSlugs(fileContent: string): string[] {
  const callRegex = /requirePermission\(([^)]+)\)/g;
  const slugs: string[] = [];
  let callMatch: RegExpExecArray | null;

  while ((callMatch = callRegex.exec(fileContent)) !== null) {
    const argsText = callMatch[1] ?? '';
    const stringRegex = /['"]([^'"]+)['"]/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = stringRegex.exec(argsText)) !== null) {
      if (strMatch[1]) {
        slugs.push(strMatch[1]);
      }
    }
  }
  return slugs;
}

describe('RBAC Permission Slugs Integrity (Routes vs Seed)', () => {
  const seedSlugs = new Set(permissionsData.map(p => p.slug));
  const srcDir = path.resolve(__dirname, '../../src');
  const routeFiles = collectRouteFiles(srcDir);

  it('seeds unique, well-formed resource:action permission slugs', () => {
    expect(permissionsData.length).toBeGreaterThanOrEqual(74);
    expect(seedSlugs.size).toBe(permissionsData.length);

    for (const perm of permissionsData) {
      expect(perm.slug).toBe(`${perm.resource}:${perm.action}`);
    }
  });

  it('includes customer:read, customer:manage, and notification:manage in seed', () => {
    expect(seedSlugs.has('customer:read')).toBe(true);
    expect(seedSlugs.has('customer:manage')).toBe(true);
    expect(seedSlugs.has('notification:manage')).toBe(true);
  });

  it('unifies legacy fraud:rule_manage into fraud:manage across seed and routes', () => {
    expect(seedSlugs.has('fraud:manage')).toBe(true);
    expect(seedSlugs.has('fraud:rule_manage')).toBe(false);

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const usedSlugs = extractRequirePermissionSlugs(content);
      expect(usedSlugs).not.toContain('fraud:rule_manage');
    }
  });

  it('ensures every requirePermission() slug used in any route file exists in prisma/seed.ts', () => {
    const missingByFile: Array<{ file: string; slug: string }> = [];

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const usedSlugs = extractRequirePermissionSlugs(content);
      for (const slug of usedSlugs) {
        if (!seedSlugs.has(slug)) {
          missingByFile.push({
            file: path.relative(srcDir, file),
            slug,
          });
        }
      }
    }

    expect(missingByFile).toEqual([]);
  });
});

