import { RoleType } from '@prisma/client';

export const SYSTEM_ROLE_SLUGS = {
  SUPER_ADMIN: 'super-admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  ORDER_MANAGER: 'order-manager',
  INVENTORY_MANAGER: 'inventory-manager',
  SUPPORT_STAFF: 'support-staff',
  CUSTOMER: 'customer',
} as const;

export type SystemRoleSlug = (typeof SYSTEM_ROLE_SLUGS)[keyof typeof SYSTEM_ROLE_SLUGS];

/**
 * Role hierarchy levels (higher value indicates greater authority)
 * Used to enforce escalation safety: users cannot assign, elevate, or delete roles at or above their tier.
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  [SYSTEM_ROLE_SLUGS.SUPER_ADMIN]: 100,
  [SYSTEM_ROLE_SLUGS.ADMIN]: 80,
  [SYSTEM_ROLE_SLUGS.MANAGER]: 60,
  [SYSTEM_ROLE_SLUGS.ORDER_MANAGER]: 40,
  [SYSTEM_ROLE_SLUGS.INVENTORY_MANAGER]: 40,
  [SYSTEM_ROLE_SLUGS.SUPPORT_STAFF]: 20,
  [SYSTEM_ROLE_SLUGS.CUSTOMER]: 0,
};

/**
 * Slugs that belong to staff / administrative tiers
 */
export const ADMIN_ROLE_SLUGS: readonly string[] = [
  SYSTEM_ROLE_SLUGS.SUPER_ADMIN,
  SYSTEM_ROLE_SLUGS.ADMIN,
  SYSTEM_ROLE_SLUGS.MANAGER,
  SYSTEM_ROLE_SLUGS.ORDER_MANAGER,
  SYSTEM_ROLE_SLUGS.INVENTORY_MANAGER,
  SYSTEM_ROLE_SLUGS.SUPPORT_STAFF,
];

export interface SystemRoleDefinition {
  name: string;
  slug: string;
  type: RoleType;
  description: string;
  hierarchyLevel: number;
  isSystem: boolean;
}

export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    name: 'Super Administrator',
    slug: SYSTEM_ROLE_SLUGS.SUPER_ADMIN,
    type: RoleType.SUPER_ADMIN,
    description: 'Full root access to all store operations and platform administration',
    hierarchyLevel: 100,
    isSystem: true,
  },
  {
    name: 'Store Administrator',
    slug: SYSTEM_ROLE_SLUGS.ADMIN,
    type: RoleType.ADMIN,
    description: 'Store manager with comprehensive operational permissions',
    hierarchyLevel: 80,
    isSystem: true,
  },
  {
    name: 'General Manager',
    slug: SYSTEM_ROLE_SLUGS.MANAGER,
    type: RoleType.MANAGER,
    description: 'Operational oversight and reporting access',
    hierarchyLevel: 60,
    isSystem: true,
  },
  {
    name: 'Order Manager',
    slug: SYSTEM_ROLE_SLUGS.ORDER_MANAGER,
    type: RoleType.ORDER_MANAGER,
    description: 'Manages orders, shipments, returns, and customer service',
    hierarchyLevel: 40,
    isSystem: true,
  },
  {
    name: 'Inventory Manager',
    slug: SYSTEM_ROLE_SLUGS.INVENTORY_MANAGER,
    type: RoleType.INVENTORY_MANAGER,
    description: 'Manages products, warehouses, suppliers, and stock',
    hierarchyLevel: 40,
    isSystem: true,
  },
  {
    name: 'Support Staff',
    slug: SYSTEM_ROLE_SLUGS.SUPPORT_STAFF,
    type: RoleType.SUPPORT_STAFF,
    description: 'Customer support, order status reading, and review moderation',
    hierarchyLevel: 20,
    isSystem: true,
  },
  {
    name: 'Customer',
    slug: SYSTEM_ROLE_SLUGS.CUSTOMER,
    type: RoleType.CUSTOMER,
    description: 'Standard consumer account',
    hierarchyLevel: 0,
    isSystem: true,
  },
];

export const isSystemRole = (slug: string): boolean => {
  return Object.values(SYSTEM_ROLE_SLUGS).includes(slug.toLowerCase() as SystemRoleSlug);
};

export const isAdminRole = (slug: string): boolean => {
  return ADMIN_ROLE_SLUGS.includes(slug.toLowerCase());
};

export const getRoleHierarchyLevel = (slug: string): number => {
  return ROLE_HIERARCHY[slug.toLowerCase()] ?? 10;
};
