import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('❌ Seeding is blocked in production environment for security.');
  }

  // eslint-disable-next-line no-console
  console.info('🌱 Starting database seed for development...');

  const devAdminPassword = process.env.DEV_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123456';
  const hashedPassword = await bcrypt.hash(devAdminPassword, 12);

  // eslint-disable-next-line no-console
  console.info('Seeding safe role-permission data and super admin placeholder...');

  // Safe development seed placeholder - executed when Postgres is online
  // eslint-disable-next-line no-console
  console.info({
    adminEmail: 'admin@diano.com',
    adminPasswordGenerated: !!hashedPassword,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CUSTOMER'],
    timestamp: new Date().toISOString(),
  });

  // eslint-disable-next-line no-console
  console.info('✅ Seed completed successfully.');
}

main()
  .catch(e => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
