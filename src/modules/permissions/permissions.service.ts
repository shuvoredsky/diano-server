import type { IPermissionsRepository } from './permissions.repository';
import { permissionsRepository as defaultRepo } from './permissions.repository';
import type { Permission } from '@prisma/client';

export interface GroupedPermissions {
  [resource: string]: Array<{
    id: string;
    name: string;
    slug: string;
    action: string;
    description: string | null;
  }>;
}

export class PermissionsService {
  constructor(private readonly repo: IPermissionsRepository = defaultRepo) {}

  async getGroupedPermissions(): Promise<GroupedPermissions> {
    const permissions: Permission[] = await this.repo.getAllPermissions();
    const grouped: GroupedPermissions = {};

    for (const perm of permissions) {
      const list = grouped[perm.resource] ?? [];
      list.push({
        id: perm.id,
        name: perm.name,
        slug: perm.slug,
        action: perm.action,
        description: perm.description,
      });
      grouped[perm.resource] = list;
    }

    return grouped;
  }
}

export const permissionsService = new PermissionsService();
