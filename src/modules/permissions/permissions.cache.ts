import type { IPermissionsRepository } from './permissions.repository';
import { permissionsRepository } from './permissions.repository';

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory cache
const ALL_PERMISSIONS_CACHE_KEY = '__SUPER_ADMIN_ALL_PERMISSIONS__';

export class PermissionsCache {
  private cache = new Map<string, CacheEntry>();

  async getRolePermissions(
    roleSlugs: string[],
    repo: IPermissionsRepository = permissionsRepository,
  ): Promise<Set<string>> {
    const sortedRolesKey = [...roleSlugs].sort().join(',');
    const now = Date.now();
    const cached = this.cache.get(sortedRolesKey);

    if (cached && cached.expiresAt > now) {
      return cached.permissions;
    }

    const perms = await repo.getPermissionsByRoles(roleSlugs);
    const permSet = new Set<string>(perms);

    this.cache.set(sortedRolesKey, {
      permissions: permSet,
      expiresAt: now + CACHE_TTL_MS,
    });

    return permSet;
  }

  async getAllPermissionSlugs(
    repo: IPermissionsRepository = permissionsRepository,
  ): Promise<string[]> {
    const now = Date.now();
    const cached = this.cache.get(ALL_PERMISSIONS_CACHE_KEY);
    if (cached && cached.expiresAt > now) {
      return Array.from(cached.permissions);
    }

    const allPerms = await repo.getAllPermissions();
    const slugs = allPerms.map(p => p.slug).sort();
    this.cache.set(ALL_PERMISSIONS_CACHE_KEY, {
      permissions: new Set(slugs),
      expiresAt: now + CACHE_TTL_MS,
    });
    return slugs;
  }

  async getEffectivePermissions(
    roleSlugs: string[],
    repo: IPermissionsRepository = permissionsRepository,
  ): Promise<string[]> {
    if (
      roleSlugs.length === 0 ||
      roleSlugs.every(r => r.toLowerCase() === 'customer')
    ) {
      return [];
    }

    const isSuperAdmin = roleSlugs.some(
      r => r.toLowerCase() === 'super-admin' || r.toLowerCase() === 'super_admin',
    );

    if (isSuperAdmin) {
      return this.getAllPermissionSlugs(repo);
    }

    const permSet = await this.getRolePermissions(roleSlugs, repo);
    return Array.from(permSet).sort();
  }

  async hasPermission(
    roleSlugs: string[],
    requiredPermission: string,
    repo: IPermissionsRepository = permissionsRepository,
  ): Promise<boolean> {
    // SUPER_ADMIN has blanket access to all capabilities
    if (
      roleSlugs.some(
        r => r.toLowerCase() === 'super-admin' || r.toLowerCase() === 'super_admin',
      )
    ) {
      return true;
    }

    const permissions = await this.getRolePermissions(roleSlugs, repo);
    return permissions.has(requiredPermission);
  }

  invalidateCache(roleSlug?: string): void {
    if (!roleSlug) {
      this.cache.clear();
      return;
    }
    this.cache.delete(ALL_PERMISSIONS_CACHE_KEY);
    for (const key of this.cache.keys()) {
      if (key.includes(roleSlug)) {
        this.cache.delete(key);
      }
    }
  }
}

export const permissionsCache = new PermissionsCache();
