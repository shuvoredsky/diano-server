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
