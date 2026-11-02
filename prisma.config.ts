import { defineConfig, env } from 'prisma/config';
import dotenv from 'dotenv';

dotenv.config();

// Prisma Migrate DDL & Shadow DB require an unpooled/direct connection.
// Neon PgBouncer transaction-mode pooler (-pooler) blocks CREATE DATABASE operations.
const baseDbUrl =
  process.env.PRISMA_TARGET_DB === 'test'
    ? process.env.TEST_DATABASE_URL
    : process.env.DIRECT_URL || process.env.DATABASE_URL;

const directUrl = baseDbUrl ? baseDbUrl.replace('-pooler', '') : undefined;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: directUrl || env('DATABASE_URL'),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});

