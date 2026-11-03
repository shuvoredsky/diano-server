import { prisma } from '@/config/database';
import { generateAccessToken } from '@/utils/jwt.util';

export async function createTestSuperAdminAuth(): Promise<{
  token: string;
  userId: string;
  sessionId: string;
}> {
  // 1. Ensure 'super-admin' role exists
  const superAdminRole = await prisma.role.upsert({
    where: { slug: 'super-admin' },
    update: {},
    create: {
      name: 'Super Admin',
      slug: 'super-admin',
      description: 'Super Admin full access',
      isSystem: true,
    },
  });

  // 2. Ensure test super-admin user exists
  const email = `test_admin_${Date.now()}_${Math.floor(Math.random() * 10000)}@diano.internal`;
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Integration Test Admin',
      passwordHash: 'dummy_hash',
      status: 'ACTIVE',
      roles: {
        create: {
          roleId: superAdminRole.id,
        },
      },
    },
  });

  // 3. Create active session
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: `test_session_hash_${Date.now()}_${Math.random()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isRevoked: false,
    },
  });

  // 4. Generate signed JWT access token with roles: ['super-admin']
  const token = generateAccessToken({
    userId: user.id,
    email: user.email,
    roles: ['super-admin'],
    sessionId: session.id,
  });

  return { token, userId: user.id, sessionId: session.id };
}

export async function createTestCustomerAuth(): Promise<{
  token: string;
  userId: string;
  sessionId: string;
}> {
  const customerRole = await prisma.role.upsert({
    where: { slug: 'customer' },
    update: {},
    create: {
      name: 'Customer',
      slug: 'customer',
      description: 'Standard customer role',
      isSystem: true,
    },
  });

  const email = `test_cust_${Date.now()}_${Math.floor(Math.random() * 10000)}@diano.internal`;
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Integration Test Customer',
      passwordHash: 'dummy_hash',
      status: 'ACTIVE',
      roles: {
        create: {
          roleId: customerRole.id,
        },
      },
    },
  });

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: `test_session_hash_${Date.now()}_${Math.random()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isRevoked: false,
    },
  });

  const token = generateAccessToken({
    userId: user.id,
    email: user.email,
    roles: ['customer'],
    sessionId: session.id,
  });

  return { token, userId: user.id, sessionId: session.id };
}

export async function createTestUserWithPermissions(
  roleSlug: string,
  permissionSlugs: string[],
): Promise<{
  token: string;
  userId: string;
  sessionId: string;
}> {
  // 1. Ensure permissions exist
  const permIds: string[] = [];
  for (const slug of permissionSlugs) {
    const parts = slug.split(':');
    const resource = parts[0] || 'test';
    const action = parts[1] || 'manage';

    const perm = await prisma.permission.upsert({
      where: { slug },
      update: {},
      create: {
        name: slug,
        slug,
        resource,
        action,
        description: `Test permission for ${slug}`,
      },
    });
    permIds.push(perm.id);
  }

  // 2. Create or update role
  const role = await prisma.role.upsert({
    where: { slug: roleSlug },
    update: {},
    create: {
      name: roleSlug,
      slug: roleSlug,
      description: `Test role ${roleSlug}`,
      isSystem: false,
    },
  });

  // 3. Link permissions to role
  for (const permId of permIds) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permId,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: permId,
      },
    });
  }

  // 4. Create user
  const email = `test_${roleSlug}_${Date.now()}_${Math.floor(Math.random() * 10000)}@diano.internal`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Test User ${roleSlug}`,
      passwordHash: 'dummy_hash',
      status: 'ACTIVE',
      roles: {
        create: {
          roleId: role.id,
        },
      },
    },
  });

  // 5. Session and token
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: `test_session_hash_${Date.now()}_${Math.random()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isRevoked: false,
    },
  });

  const token = generateAccessToken({
    userId: user.id,
    email: user.email,
    roles: [roleSlug],
    sessionId: session.id,
  });

  return { token, userId: user.id, sessionId: session.id };
}
