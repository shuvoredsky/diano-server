import { describe, it, expect } from 'vitest';
import {
  SYSTEM_ROLES,
  SYSTEM_ROLE_SLUGS,
  ROLE_HIERARCHY,
  ADMIN_ROLE_SLUGS,
  isSystemRole,
  isAdminRole,
  getRoleHierarchyLevel,
} from '@/constants/roles';
import { rolesData } from '../../prisma/seed';
import { RoleType } from '@prisma/client';

describe('Role Identifiers & Hierarchy Single Source of Truth', () => {
  it('should have seed.ts rolesData identically matching SYSTEM_ROLES constants', () => {
    expect(rolesData).toEqual(SYSTEM_ROLES);
    expect(rolesData).toHaveLength(7);
  });

  it('should contain all required system roles with valid Prisma RoleType mappings', () => {
    const slugs = SYSTEM_ROLES.map(r => r.slug);
    expect(slugs).toContain(SYSTEM_ROLE_SLUGS.SUPER_ADMIN);
    expect(slugs).toContain(SYSTEM_ROLE_SLUGS.ADMIN);
    expect(slugs).toContain(SYSTEM_ROLE_SLUGS.MANAGER);
    expect(slugs).toContain(SYSTEM_ROLE_SLUGS.ORDER_MANAGER);
    expect(slugs).toContain(SYSTEM_ROLE_SLUGS.INVENTORY_MANAGER);
    expect(slugs).toContain(SYSTEM_ROLE_SLUGS.SUPPORT_STAFF);
    expect(slugs).toContain(SYSTEM_ROLE_SLUGS.CUSTOMER);

    // Ensure all slugs and names are unique
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(SYSTEM_ROLES.length);

    const names = SYSTEM_ROLES.map(r => r.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(SYSTEM_ROLES.length);

    // Verify RoleType mappings
    const superAdmin = SYSTEM_ROLES.find(r => r.slug === 'super-admin');
    expect(superAdmin?.type).toBe(RoleType.SUPER_ADMIN);

    const customer = SYSTEM_ROLES.find(r => r.slug === 'customer');
    expect(customer?.type).toBe(RoleType.CUSTOMER);
  });

  it('should correctly evaluate role hierarchy levels', () => {
    expect(getRoleHierarchyLevel('super-admin')).toBe(100);
    expect(getRoleHierarchyLevel('admin')).toBe(80);
    expect(getRoleHierarchyLevel('manager')).toBe(60);
    expect(getRoleHierarchyLevel('order-manager')).toBe(40);
    expect(getRoleHierarchyLevel('inventory-manager')).toBe(40);
    expect(getRoleHierarchyLevel('support-staff')).toBe(20);
    expect(getRoleHierarchyLevel('customer')).toBe(0);

    // Super admin hierarchy must be strictly greater than admin
    expect(ROLE_HIERARCHY['super-admin']).toBeGreaterThan(ROLE_HIERARCHY['admin']);
    expect(ROLE_HIERARCHY['admin']).toBeGreaterThan(ROLE_HIERARCHY['manager']);
    expect(ROLE_HIERARCHY['manager']).toBeGreaterThan(ROLE_HIERARCHY['support-staff']);
    expect(ROLE_HIERARCHY['support-staff']).toBeGreaterThan(ROLE_HIERARCHY['customer']);
  });

  it('should accurately identify system and administrative roles', () => {
    expect(isSystemRole('super-admin')).toBe(true);
    expect(isSystemRole('customer')).toBe(true);
    expect(isSystemRole('custom-vendor-role')).toBe(false);

    expect(isAdminRole('super-admin')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('manager')).toBe(true);
    expect(isAdminRole('support-staff')).toBe(true);
    expect(isAdminRole('customer')).toBe(false);
    expect(ADMIN_ROLE_SLUGS).not.toContain('customer');
  });
});
