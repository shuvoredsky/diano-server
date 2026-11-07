import { PrismaClient, RoleType, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { SYSTEM_ROLES } from '../src/constants/roles';

dotenv.config();

const seedDbUrl =
  (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL)
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: seedDbUrl,
  connectionTimeoutMillis: 20000,
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
  { resource: 'product', action: 'view_cost', name: 'View Product Cost Price', slug: 'product:view_cost', description: 'View supplier cost prices for product variants' },

  { resource: 'category', action: 'read', name: 'Read Categories', slug: 'category:read', description: 'View product categories' },
  { resource: 'category', action: 'create', name: 'Create Categories', slug: 'category:create', description: 'Create categories' },
  { resource: 'category', action: 'update', name: 'Update Categories', slug: 'category:update', description: 'Modify categories' },
  { resource: 'category', action: 'delete', name: 'Delete Categories', slug: 'category:delete', description: 'Delete categories' },

  // Inventory & Warehouse
  { resource: 'inventory', action: 'read', name: 'Read Inventory', slug: 'inventory:read', description: 'View stock levels' },
  { resource: 'inventory', action: 'manage', name: 'Manage Inventory', slug: 'inventory:manage', description: 'Perform stock mutations (receive, adjust, damage, transfer)' },
  { resource: 'inventory', action: 'adjust', name: 'Adjust Stock', slug: 'inventory:adjust', description: 'Record manual stock adjustments' },
  { resource: 'inventory', action: 'audit', name: 'Audit Stock', slug: 'inventory:audit', description: 'Initiate and complete stock audits' },
  { resource: 'inventory', action: 'view_cost', name: 'View Cost & Stock Value', slug: 'inventory:view_cost', description: 'View confidential costPrice and total inventory valuation' },
  { resource: 'warehouse', action: 'manage', name: 'Manage Warehouses', slug: 'warehouse:manage', description: 'Manage warehouse facilities' },
  { resource: 'supplier', action: 'read', name: 'Read Suppliers', slug: 'supplier:read', description: 'View suppliers and purchase orders' },
  { resource: 'supplier', action: 'manage', name: 'Manage Suppliers', slug: 'supplier:manage', description: 'Manage suppliers and purchase orders' },

  // Orders
  { resource: 'order', action: 'read', name: 'Read Orders', slug: 'order:read', description: 'View customer orders' },
  { resource: 'order', action: 'create', name: 'Create Orders', slug: 'order:create', description: 'Create draft orders' },
  { resource: 'order', action: 'update_status', name: 'Update Order Status', slug: 'order:update_status', description: 'Transition order state machine' },
  { resource: 'order', action: 'cancel', name: 'Cancel Orders', slug: 'order:cancel', description: 'Cancel active orders' },

  // Payments & Refunds
  { resource: 'payment', action: 'read', name: 'Read Payments', slug: 'payment:read', description: 'View payment transactions' },
  { resource: 'payment', action: 'verify', name: 'Verify Payments', slug: 'payment:verify', description: 'Verify gateway IPN callbacks' },
  { resource: 'payment', action: 'manage', name: 'Manage Payments', slug: 'payment:manage', description: 'Operational control over payment transactions' },
  { resource: 'payment', action: 'refund', name: 'Refund Payments', slug: 'payment:refund', description: 'Authorize and initiate customer refunds' },
  { resource: 'refund', action: 'read', name: 'Read Refunds', slug: 'refund:read', description: 'View customer refund records' },
  { resource: 'refund', action: 'approve', name: 'Approve Refunds', slug: 'refund:approve', description: 'Approve and process customer refunds' },
  { resource: 'refund', action: 'manage', name: 'Manage Refunds', slug: 'refund:manage', description: 'Full operational control over refund issuance' },

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
  { resource: 'fraud', action: 'manage', name: 'Manage Fraud Rules', slug: 'fraud:manage', description: 'Configure scoring rules and thresholds' },
  { resource: 'fraud', action: 'rule_manage', name: 'Manage Fraud Rules Legacy', slug: 'fraud:rule_manage', description: 'Configure scoring rules' },

  // Returns
  { resource: 'return', action: 'read', name: 'Read Returns', slug: 'return:read', description: 'View return requests' },
  { resource: 'return', action: 'approve', name: 'Approve Returns', slug: 'return:approve', description: 'Approve or reject return requests' },
  { resource: 'return', action: 'inspect', name: 'Inspect Returns', slug: 'return:inspect', description: 'Record item return conditions' },
  { resource: 'return', action: 'manage', name: 'Manage Returns', slug: 'return:manage', description: 'Full operational control over customer returns' },

  // Reviews
  { resource: 'review', action: 'read', name: 'Read Reviews', slug: 'review:read', description: 'Read customer reviews' },
  { resource: 'review', action: 'moderate', name: 'Moderate Reviews', slug: 'review:moderate', description: 'Approve, reject, or flag reviews' },

  // Notifications
  { resource: 'notification', action: 'read', name: 'Read Notifications', slug: 'notification:read', description: 'View notification logs' },
  { resource: 'notification', action: 'send', name: 'Send Notifications', slug: 'notification:send', description: 'Trigger manual notifications' },

  // Analytics & Audits
  { resource: 'analytics', action: 'view', name: 'View Analytics', slug: 'analytics:view', description: 'View sales and revenue metrics' },
  { resource: 'analytics', action: 'view_finance', name: 'View Financial Analytics', slug: 'analytics:view_finance', description: 'View cost, margins, gross and net profit' },
  { resource: 'report', action: 'export', name: 'Export Reports', slug: 'report:export', description: 'Export tabular reports to CSV, XLSX, and PDF' },
  { resource: 'report', action: 'export_pii', name: 'Export Customer PII in Reports', slug: 'report:export_pii', description: 'Include customer phone, email, and address in report exports' },
  { resource: 'expense', action: 'manage', name: 'Manage Operating Expenses', slug: 'expense:manage', description: 'Create, update, view, and delete business expenses' },
  { resource: 'audit', action: 'view', name: 'View Audit Logs', slug: 'audit:view', description: 'Inspect system and security audit logs' },
  { resource: 'settings', action: 'read', name: 'Read Settings', slug: 'settings:read', description: 'View system and store configuration' },
  { resource: 'settings', action: 'update', name: 'Update Settings', slug: 'settings:update', description: 'Modify global store settings' },

  // CMS
  { resource: 'banner', action: 'manage', name: 'Manage Banners', slug: 'banner:manage', description: 'Create, update, reorder and delete promotional banners' },
  { resource: 'page', action: 'manage', name: 'Manage Pages', slug: 'page:manage', description: 'Create, update, publish and restore CMS pages' },

  // Checkout & Abandoned Checkout
  { resource: 'checkout', action: 'read', name: 'Read Checkout', slug: 'checkout:read', description: 'View checkout sessions' },
  { resource: 'abandoned_checkout', action: 'read', name: 'Read Abandoned Checkouts', slug: 'abandoned_checkout:read', description: 'View abandoned checkout metrics and sessions' },
  { resource: 'abandoned_checkout', action: 'manage', name: 'Manage Abandoned Checkouts', slug: 'abandoned_checkout:manage', description: 'Trigger recovery actions and manage sessions' },

  // Order Extensions
  { resource: 'order', action: 'confirm', name: 'Confirm Orders', slug: 'order:confirm', description: 'Confirm pending customer orders' },
  { resource: 'order', action: 'ship', name: 'Ship Orders', slug: 'order:ship', description: 'Mark orders as shipped and dispatch' },
  { resource: 'order', action: 'manage', name: 'Manage Orders', slug: 'order:manage', description: 'Full operational management over orders' },
  { resource: 'order', action: 'view_cost', name: 'View Order Costs & Margins', slug: 'order:view_cost', description: 'View confidential costPrice and gross margins on orders' },
];

export const rolesData = SYSTEM_ROLES;

export async function seedDatabase() {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ALLOW_PRODUCTION_SEED !== 'true') {
      throw new Error('❌ Refusing to run seed in production environment for security. To override, explicitly set ALLOW_PRODUCTION_SEED=true');
    }
    // eslint-disable-next-line no-console
    console.warn(
      '\n' +
      '********************************************************************************\n' +
      '🚨 🚨 🚨  WARNING: SEEDING PRODUCTION DATABASE VIA ALLOW_PRODUCTION_SEED=true  🚨 🚨 🚨\n' +
      '********************************************************************************\n' +
      '⚠️  This should ONLY be run ONCE during initial bootstrap deployment.\n' +
      '⚠️  CRITICAL: You MUST IMMEDIATELY REMOVE ALLOW_PRODUCTION_SEED from Render\n' +
      '    environment variables after deployment to prevent accidental re-seeding!\n' +
      '********************************************************************************\n'
    );
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
  const rolePermissionRows: Array<{ roleId: string; permissionId: string }> = [];

  const superAdminRoleId = roleMap.get('super-admin');
  if (superAdminRoleId) {
    for (const permId of permissionMap.values()) {
      rolePermissionRows.push({ roleId: superAdminRoleId, permissionId: permId });
    }
  }

  const adminRoleId = roleMap.get('admin');
  if (adminRoleId) {
    for (const permId of permissionMap.values()) {
      rolePermissionRows.push({ roleId: adminRoleId, permissionId: permId });
    }
  }

  const managerRoleId = roleMap.get('manager');
  if (managerRoleId) {
    const managerAllowedPrefixes = [
      'product:read',
      'product:update',
      'category:read',
      'inventory:read',
      'inventory:manage',
      'order:read',
      'order:manage',
      'order:update_status',
      'order:confirm',
      'order:ship',
      'order:cancel',
      'shipping:',
      'coupon:',
      'fraud:read',
      'fraud:review',
      'return:',
      'refund:',
      'review:read',
      'review:moderate',
      'analytics:view',
      'analytics:view_finance',
      'report:export',
      'expense:manage',
      'settings:read',
      'banner:manage',
      'page:manage',
      'payment:read',
      'payment:manage',
      'payment:refund',
    ];
    for (const [slug, permId] of permissionMap.entries()) {
      if (managerAllowedPrefixes.some(p => slug.startsWith(p) || slug === p)) {
        rolePermissionRows.push({ roleId: managerRoleId, permissionId: permId });
      }
    }
  }

  const orderManagerRoleId = roleMap.get('order-manager');
  if (orderManagerRoleId) {
    const orderManagerAllowedPrefixes = [
      'order:',
      'shipping:',
      'coupon:read',
      'fraud:read',
      'fraud:review',
      'return:',
      'refund:',
      'payment:read',
      'inventory:read',
    ];
    for (const [slug, permId] of permissionMap.entries()) {
      if (orderManagerAllowedPrefixes.some(p => slug.startsWith(p) || slug === p)) {
        rolePermissionRows.push({ roleId: orderManagerRoleId, permissionId: permId });
      }
    }
  }

  if (rolePermissionRows.length > 0) {
    await prisma.rolePermission.createMany({
      data: rolePermissionRows,
      skipDuplicates: true,
    });
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
      key: 'REPEATED_COD_CANCELLATIONS',
      name: 'Repeated COD Cancellations',
      description: 'Flags customer or phone with repeated COD order cancellations',
      weight: 35,
      parameters: { threshold: 2, windowDays: 30 },
    },
    {
      key: 'MULTIPLE_ORDERS_SAME_PHONE',
      name: 'Multiple Orders with Same Phone',
      description: 'Flags multiple orders placed with the same phone in a short time window',
      weight: 30,
      parameters: { threshold: 3, windowHours: 24 },
    },
    {
      key: 'HIGH_ORDER_FREQUENCY',
      name: 'High Order Velocity',
      description: 'Flags unusual burst of orders placed by customer within 24 hours',
      weight: 25,
      parameters: { threshold: 5 },
    },
    {
      key: 'UNUSUAL_ORDER_VALUE_OR_QUANTITY',
      name: 'Unusual Quantity or Value',
      description: 'Flags orders with grand total or item quantity exceeding normal thresholds',
      weight: 25,
      parameters: { thresholdValue: 50000, thresholdQuantity: 15 },
    },
    {
      key: 'REPEATED_PAYMENT_FAILURES',
      name: 'Repeated Payment Failures',
      description: 'Flags sessions with repeated online payment transaction failures',
      weight: 30,
      parameters: { threshold: 3 },
    },
    {
      key: 'PREVIOUS_CONFIRMED_FRAUD',
      name: 'Previous Confirmed Fraud Record',
      description: 'Flags accounts or phone numbers previously rejected for confirmed fraud by staff',
      weight: 50,
      parameters: {},
    },
    {
      key: 'ADDRESS_REUSE_ACROSS_ACCOUNTS',
      name: 'Address Reused Across Multiple Accounts',
      description: 'Flags shipping address shared across multiple distinct user accounts',
      weight: 30,
      parameters: { threshold: 3 },
    },
    {
      key: 'NEW_ACCOUNT_HIGH_VALUE_COD',
      name: 'New Account High Value COD',
      description: 'Flags newly created accounts or guest checkouts placing high value COD orders',
      weight: 35,
      parameters: { codValueThreshold: 15000, accountAgeHours: 24 },
    },
    {
      key: 'SUSPICIOUS_DEVICE_PATTERN',
      name: 'Suspicious Device Pattern',
      description: 'Weak signal rule for automated bots or proxy client patterns (max 15 points cap)',
      weight: 15,
      parameters: {},
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

  // 6b. Seed Default Fashion Specification Template
  // eslint-disable-next-line no-console
  console.info('Seeding default fashion specification template...');
  const fashionSpecificationTemplate = [
    {
      key: 'colour',
      label: 'Colour',
      type: 'text',
      required: true,
      options: [],
      sortOrder: 1,
    },
    {
      key: 'fabric',
      label: 'Fabric',
      type: 'select',
      required: true,
      options: ['100% Cotton', 'Linen', 'Denim', 'Silk', 'Viscose', 'Polyester Blend'],
      sortOrder: 2,
    },
    {
      key: 'fit',
      label: 'Fit',
      type: 'select',
      required: true,
      options: ['Slim Fit', 'Regular Fit', 'Relaxed Fit', 'Oversized'],
      sortOrder: 3,
    },
    {
      key: 'sleeve',
      label: 'Sleeve',
      type: 'select',
      required: false,
      options: ['Full Sleeve', 'Half Sleeve', 'Sleeveless'],
      sortOrder: 4,
    },
    {
      key: 'collar',
      label: 'Collar',
      type: 'select',
      required: false,
      options: ['Spread Collar', 'Button-Down Collar', 'Mandarin Collar', 'Cuban Collar', 'Round Neck', 'V-Neck'],
      sortOrder: 5,
    },
    {
      key: 'pocket',
      label: 'Pocket',
      type: 'select',
      required: false,
      options: ['Single Chest Pocket', 'No Pocket', 'Double Flap Pockets'],
      sortOrder: 6,
    },
    {
      key: 'length',
      label: 'Length',
      type: 'text',
      required: false,
      options: [],
      sortOrder: 7,
    },
    {
      key: 'care',
      label: 'Care Instructions',
      type: 'text',
      required: false,
      options: [],
      sortOrder: 8,
    },
  ];

  await prisma.category.upsert({
    where: { slug: 'apparel' },
    update: {
      specificationTemplate: fashionSpecificationTemplate,
    },
    create: {
      name: 'Apparel',
      slug: 'apparel',
      description: 'Men & Women Fashion Apparel',
      specificationTemplate: fashionSpecificationTemplate,
      isActive: true,
      sortOrder: 1,
    },
  });

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

  // 8. Seed Default Settings
  // eslint-disable-next-line no-console
  console.info('Seeding default store settings...');
  const defaultSettings = [
    {
      key: 'store_profile',
      isPublic: true,
      description: 'Public store profile information',
      value: {
        storeName: 'Diano Fashion',
        tagline: 'Premium Minimalist Fashion',
        phone: '+8801700000000',
        email: 'support@diano.com.bd',
        address: 'Tejgaon Industrial Area, Dhaka 1208, Bangladesh',
        socialLinks: {
          facebook: 'https://facebook.com/dianofashion',
          instagram: 'https://instagram.com/dianofashion',
        },
      },
    },
    {
      key: 'invoice',
      isPublic: false,
      description: 'Order invoice settings',
      value: {
        prefix: 'INV',
        footerNote: 'Thank you for shopping with Diano.',
        termsNote: 'Please keep this invoice for returns within 7 days.',
        showLogo: true,
        signatureText: 'Authorized Signatory',
      },
    },
    {
      key: 'seo_defaults',
      isPublic: true,
      description: 'Default SEO metadata',
      value: {
        titleTemplate: '%s | Diano Fashion',
        description: 'Curated premium fashion, apparel and lifestyle essentials in Bangladesh.',
      },
    },
    {
      key: 'contact',
      isPublic: true,
      description: 'Support and contact details',
      value: {
        supportPhone: '+8801700000000',
        supportEmail: 'support@diano.com.bd',
        address: 'Tejgaon Industrial Area, Dhaka 1208, Bangladesh',
        supportHours: 'Saturday - Thursday: 10:00 AM - 8:00 PM (Dhaka Time)',
      },
    },
  ];

  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: {
        key: s.key,
        value: s.value,
        isPublic: s.isPublic,
        description: s.description,
      },
    });
  }

  // 9. Seed Default System Pages (Draft placeholders, no dummy legal text)
  // eslint-disable-next-line no-console
  console.info('Seeding default system pages (drafts)...');
  const systemPages = [
    { slug: 'privacy-policy', type: 'POLICY' as const, title: 'Privacy Policy' },
    { slug: 'terms', type: 'POLICY' as const, title: 'Terms & Conditions' },
    { slug: 'return-policy', type: 'POLICY' as const, title: 'Return & Refund Policy' },
    { slug: 'shipping-policy', type: 'POLICY' as const, title: 'Shipping & Delivery Policy' },
    { slug: 'about-us', type: 'ABOUT' as const, title: 'About Us' },
    { slug: 'faq', type: 'FAQ' as const, title: 'Frequently Asked Questions' },
  ];

  for (const p of systemPages) {
    await prisma.page.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        type: p.type,
        title: p.title,
        status: 'DRAFT',
        content: [
          { type: 'heading', level: 1, text: p.title },
          { type: 'richText', html: '<p>Content will be published soon by store administration.</p>' },
        ],
      },
    });
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
