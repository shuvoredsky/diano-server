import { defineConfig, env } from 'prisma/config';
import dotenv from 'dotenv';

dotenv.config();

// Prisma Migrate DDL & Shadow DB require an unpooled/direct connection.
// Neon PgBouncer transaction-mode pooler (-pooler) blocks CREATE DATABASE operations.
// Prefer explicit DIRECT_URL if set; otherwise automatically derive direct URL from DATABASE_URL if it contains '-pooler'.
const directUrl =
  process.env.DIRECT_URL ||
  (process.env.DATABASE_URL ? process.env.DATABASE_URL.replace('-pooler', '') : undefined);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: directUrl || env('DATABASE_URL'),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});

