import { defineConfig, env } from 'prisma/config';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DIRECT_URL || (process.env.DATABASE_URL ? process.env.DATABASE_URL.replace('-pooler', '') : undefined);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: dbUrl || env('DATABASE_URL'),
  },
});
