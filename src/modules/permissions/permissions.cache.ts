import type { IPermissionsRepository } from './permissions.repository';
import { permissionsRepository } from './permissions.repository';

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory cache

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

  async hasPermission(
    roleSlugs: string[],
    requiredPermission: string,
    repo: IPermissionsRepository = permissionsRepository,
  ): Promise<boolean> {
    // SUPER_ADMIN has blanket access to all capabilities
    if (roleSlugs.includes('super-admin') || roleSlugs.includes('SUPER_ADMIN')) {
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
    for (const key of this.cache.keys()) {
      if (key.includes(roleSlug)) {
        this.cache.delete(key);
      }
    }
  }
}

export const permissionsCache = new PermissionsCache();
