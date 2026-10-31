import { PrismaClient, RoleType, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { SYSTEM_ROLES } from '../src/constants/roles';

dotenv.config();

// Initialize DB client using PrismaPg adapter (Prisma 7 requirement)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 3000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const permissionsData = [
  // User Management
  { resource: 'user', action: 'read', name: 'Read Users', slug: 'user:read', description: 'View user accounts' },
  { resource: 'user', action: 'create', name: 'Create Users', slug: 'user:create', description: 'Create user accounts' },
  { resource: 'user', action: 'update', name: 'Update Users', slug: 'user:update', description: 'Modify user accounts' },
  { resource: 'user', action: 'delete', name: 'Delete Users', slug: 'user:delete', description: 'Soft-delete user accounts' },
  { resource: 'user', action: 'manage', name: 'Manage Users', slug: 'user:manage', description: 'Manage user roles and statuses' },

  // Role & Permissions
  { resource: 'role', action: 'read', name: 'Read Roles', slug: 'role:read', description: 'View roles and permissions' },
  { resource: 'role', action: 'create', name: 'Create Roles', slug: 'role:create', description: 'Create new RBAC roles' },
  { resource: 'role', action: 'update', name: 'Update Roles', slug: 'role:update', description: 'Modify roles and permissions' },
  { resource: 'role', action: 'delete', name: 'Delete Roles', slug: 'role:delete', description: 'Remove RBAC roles' },

  // Catalog
  { resource: 'product', action: 'read', name: 'Read Products', slug: 'product:read', description: 'View product catalog' },
  { resource: 'product', action: 'create', name: 'Create Products', slug: 'product:create', description: 'Add new products and variants' },
  { resource: 'product', action: 'update', name: 'Update Products', slug: 'product:update', description: 'Modify products and pricing' },
  { resource: 'product', action: 'delete', name: 'Delete Products', slug: 'product:delete', description: 'Soft-delete products' },
  { resource: 'product', action: 'publish', name: 'Publish Products', slug: 'product:publish', description: 'Publish or archive products' },

  { resource: 'category', action: 'read', name: 'Read Categories', slug: 'category:read', description: 'View product categories' },
  { resource: 'category', action: 'create', name: 'Create Categories', slug: 'category:create', description: 'Create categories' },
  { resource: 'category', action: 'update', name: 'Update Categories', slug: 'category:update', description: 'Modify categories' },
  { resource: 'category', action: 'delete', name: 'Delete Categories', slug: 'category:delete', description: 'Delete categories' },

  // Inventory & Warehouse
  { resource: 'inventory', action: 'read', name: 'Read Inventory', slug: 'inventory:read', description: 'View stock levels' },
  { resource: 'inventory', action: 'adjust', name: 'Adjust Stock', slug: 'inventory:adjust', description: 'Record manual stock adjustments' },
  { resource: 'inventory', action: 'audit', name: 'Audit Stock', slug: 'inventory:audit', description: 'Initiate and complete stock audits' },
  { resource: 'warehouse', action: 'manage', name: 'Manage Warehouses', slug: 'warehouse:manage', description: 'Manage warehouse facilities' },
  { resource: 'supplier', action: 'manage', name: 'Manage Suppliers', slug: 'supplier:manage', description: 'Manage suppliers and purchase orders' },

  // Orders
  { resource: 'order', action: 'read', name: 'Read Orders', slug: 'order:read', description: 'View customer orders' },
  { resource: 'order', action: 'create', name: 'Create Orders', slug: 'order:create', description: 'Create draft orders' },
  { resource: 'order', action: 'update_status', name: 'Update Order Status', slug: 'order:update_status', description: 'Transition order state machine' },
  { resource: 'order', action: 'cancel', name: 'Cancel Orders', slug: 'order:cancel', description: 'Cancel active orders' },

  // Payments & Refunds
  { resource: 'payment', action: 'read', name: 'Read Payments', slug: 'payment:read', description: 'View payment transactions' },
  { resource: 'payment', action: 'verify', name: 'Verify Payments', slug: 'payment:verify', description: 'Verify gateway IPN callbacks' },
  { resource: 'refund', action: 'approve', name: 'Approve Refunds', slug: 'refund:approve', description: 'Approve and process customer refunds' },

  // Shipping
  { resource: 'shipping', action: 'read', name: 'Read Shipping', slug: 'shipping:read', description: 'View shipments and tracking' },
  { resource: 'shipping', action: 'dispatch', name: 'Dispatch Shipments', slug: 'shipping:dispatch', description: 'Dispatch orders with couriers' },
  { resource: 'shipping', action: 'manage', name: 'Manage Shipping Zones', slug: 'shipping:manage', description: 'Configure shipping zones and rates' },

  // Coupons
  { resource: 'coupon', action: 'read', name: 'Read Coupons', slug: 'coupon:read', description: 'View promotional coupons' },
  { resource: 'coupon', action: 'manage', name: 'Manage Coupons', slug: 'coupon:manage', description: 'Create and edit coupons' },

  // Fraud Detection
  { resource: 'fraud', action: 'read', name: 'Read Fraud Assessments', slug: 'fraud:read', description: 'View fraud scores and assessments' },
  { resource: 'fraud', action: 'review', name: 'Review Fraud Flags', slug: 'fraud:review', description: 'Approve or reject flagged orders' },
  { resource: 'fraud', action: 'rule_manage', name: 'Manage Fraud Rules', slug: 'fraud:rule_manage', description: 'Configure scoring rules' },

  // Returns
  { resource: 'return', action: 'read', name: 'Read Returns', slug: 'return:read', description: 'View return requests' },
  { resource: 'return', action: 'approve', name: 'Approve Returns', slug: 'return:approve', description: 'Approve or reject return requests' },
  { resource: 'return', action: 'inspect', name: 'Inspect Returns', slug: 'return:inspect', description: 'Record item return conditions' },

  // Reviews
  { resource: 'review', action: 'read', name: 'Read Reviews', slug: 'review:read', description: 'Read customer reviews' },
  { resource: 'review', action: 'moderate', name: 'Moderate Reviews', slug: 'review:moderate', description: 'Approve, reject, or flag reviews' },

  // Notifications
  { resource: 'notification', action: 'read', name: 'Read Notifications', slug: 'notification:read', description: 'View notification logs' },
  { resource: 'notification', action: 'send', name: 'Send Notifications', slug: 'notification:send', description: 'Trigger manual notifications' },

  // Analytics & Audits
  { resource: 'analytics', action: 'view', name: 'View Analytics', slug: 'analytics:view', description: 'View sales and revenue metrics' },
  { resource: 'audit', action: 'view', name: 'View Audit Logs', slug: 'audit:view', description: 'Inspect system and security audit logs' },
  { resource: 'settings', action: 'update', name: 'Update Settings', slug: 'settings:update', description: 'Modify global store settings' },
];

export const rolesData = SYSTEM_ROLES;

export async function seedDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('❌ Refusing to run seed in production environment for security.');
  }

  // eslint-disable-next-line no-console
  console.info('🌱 Starting idempotent database seed...');

  // 1. Seed Permissions
  // eslint-disable-next-line no-console
  console.info(`Seeding ${permissionsData.length} granular permissions...`);
  const permissionMap = new Map<string, string>();

  for (const perm of permissionsData) {
    const record = await prisma.permission.upsert({
      where: { slug: perm.slug },
      update: { name: perm.name, description: perm.description },
      create: {
        name: perm.name,
        slug: perm.slug,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
      },
    });
    permissionMap.set(record.slug, record.id);
  }

  // 2. Seed Roles
  // eslint-disable-next-line no-console
  console.info(`Seeding ${rolesData.length} system roles...`);
  const roleMap = new Map<string, string>();

  for (const r of rolesData) {
    const record = await prisma.role.upsert({
      where: { slug: r.slug },
      update: { name: r.name, description: r.description, isSystem: true },
      create: {
        name: r.name,
        slug: r.slug,
        type: r.type,
        description: r.description,
        isSystem: true,
      },
    });
    roleMap.set(record.slug, record.id);
  }

  // 3. Seed Role-Permission Mappings
  // eslint-disable-next-line no-console
  console.info('Assigning permissions to roles...');
  const superAdminRoleId = roleMap.get('super-admin');
  if (superAdminRoleId) {
    for (const permId of permissionMap.values()) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdminRoleId,
            permissionId: permId,
          },
        },
        update: {},
        create: {
          roleId: superAdminRoleId,
          permissionId: permId,
        },
      });
    }
  }

  // 4. Seed Default Central Warehouse
  // eslint-disable-next-line no-console
  console.info('Seeding default warehouse...');
  await prisma.warehouse.upsert({
    where: { code: 'WH-DHK-01' },
    update: { isDefault: true, isActive: true },
    create: {
      name: 'Central Warehouse Dhaka',
      code: 'WH-DHK-01',
      address: 'Tejgaon Industrial Area, Dhaka 1208, Bangladesh',
      isDefault: true,
      isActive: true,
    },
  });

  // 5. Seed Shipping Zones and Methods
  // eslint-disable-next-line no-console
  console.info('Seeding shipping zones & methods...');
  const insideDhakaZone = await prisma.shippingZone.upsert({
    where: { id: 'zone-inside-dhaka' },
    update: {
      name: 'Inside Dhaka',
      districts: ['Dhaka', 'Gazipur', 'Narayanganj'],
      isActive: true,
    },
    create: {
      id: 'zone-inside-dhaka',
      name: 'Inside Dhaka',
      districts: ['Dhaka', 'Gazipur', 'Narayanganj'],
      isActive: true,
    },
  });

  await prisma.shippingMethod.upsert({
    where: { code: 'STD-DHK' },
    update: { baseCharge: '60.00', perKgCharge: '15.00', estimatedDays: '24-48 hours' },
    create: {
      shippingZoneId: insideDhakaZone.id,
      name: 'Standard Home Delivery - Inside Dhaka',
      code: 'STD-DHK',
      baseCharge: '60.00',
      perKgCharge: '15.00',
      estimatedDays: '24-48 hours',
      isActive: true,
    },
  });

  const outsideDhakaZone = await prisma.shippingZone.upsert({
    where: { id: 'zone-outside-dhaka' },
    update: {
      name: 'Outside Dhaka',
      districts: ['Chittagong', 'Sylhet', 'Rajshahi', 'Khulna', 'Barisal', 'Rangpur', 'Mymensingh', 'Comilla'],
      isActive: true,
    },
    create: {
      id: 'zone-outside-dhaka',
      name: 'Outside Dhaka',
      districts: ['Chittagong', 'Sylhet', 'Rajshahi', 'Khulna', 'Barisal', 'Rangpur', 'Mymensingh', 'Comilla'],
      isActive: true,
    },
  });

  await prisma.shippingMethod.upsert({
    where: { code: 'STD-OUT' },
    update: { baseCharge: '120.00', perKgCharge: '25.00', estimatedDays: '2-4 days' },
    create: {
      shippingZoneId: outsideDhakaZone.id,
      name: 'Courier Delivery - Outside Dhaka',
      code: 'STD-OUT',
      baseCharge: '120.00',
      perKgCharge: '25.00',
      estimatedDays: '2-4 days',
      isActive: true,
    },
  });

  // 6. Seed Default Fraud Rules
  // eslint-disable-next-line no-console
  console.info('Seeding default fraud detection rules...');
  const fraudRules = [
    {
      key: 'HIGH_ORDER_VALUE',
      name: 'High Order Value',
      description: 'Flags orders with grand total exceeding BDT 25,000 for manual verification',
      weight: 30,
      parameters: { thresholdBDT: 25000 },
    },
    {
      key: 'RAPID_ORDER_VELOCITY',
      name: 'Rapid Consecutive Orders',
      description: 'Flags customers placing more than 3 orders within 10 minutes',
      weight: 40,
      parameters: { maxOrders: 3, windowMinutes: 10 },
    },
    {
      key: 'MISMATCHED_DISTRICTS',
      name: 'Mismatched Shipping and Billing District',
      description: 'Elevates risk when billing and shipping districts differ',
      weight: 20,
      parameters: { checkDistrictMismatch: true },
    },
    {
      key: 'EXCESSIVE_FAILED_PAYMENTS',
      name: 'Multiple Failed Payment Attempts',
      description: 'Flags session with 3 or more failed payment transactions',
      weight: 35,
      parameters: { maxFailedAttempts: 3 },
    },
  ];

  for (const rule of fraudRules) {
    await prisma.fraudRule.upsert({
      where: { key: rule.key },
      update: {
        name: rule.name,
        description: rule.description,
        weight: rule.weight,
        parameters: rule.parameters,
      },
      create: {
        name: rule.name,
        key: rule.key,
        description: rule.description,
        weight: rule.weight,
        parameters: rule.parameters,
        isEnabled: true,
      },
    });
  }

  // 7. Seed Dev Super Admin (Only if credentials provided in env)
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    // eslint-disable-next-line no-console
    console.info(`Creating dev super admin user (${adminEmail})...`);
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const superAdminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        passwordHash,
        status: UserStatus.ACTIVE,
        isEmailVerified: true,
      },
      create: {
        email: adminEmail,
        passwordHash,
        name: 'Super Administrator',
        status: UserStatus.ACTIVE,
        isEmailVerified: true,
      },
    });

    if (superAdminRoleId) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: superAdminUser.id,
            roleId: superAdminRoleId,
          },
        },
        update: {},
        create: {
          userId: superAdminUser.id,
          roleId: superAdminRoleId,
        },
      });
    }
    // eslint-disable-next-line no-console
    console.info('✅ Dev super admin configured successfully.');
  } else {
    // eslint-disable-next-line no-console
    console.info('ℹ️ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set. Skipping dev super admin creation.');
  }

  // eslint-disable-next-line no-console
  console.info('🎉 Seed completed successfully.');
}

// Self-executing runner when executed via CLI
if (require.main === module) {
  seedDatabase()
    .catch(err => {
      // eslint-disable-next-line no-console
      console.error('❌ Seed execution failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
      await pool.end();
    });
}
