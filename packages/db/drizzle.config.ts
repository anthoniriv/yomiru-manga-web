import type { Config } from 'drizzle-kit';
import { resolve } from 'node:path';

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.YOMIRU_DB_PATH ?? resolve(process.cwd(), 'storage/yomiru.db'),
  },
} satisfies Config;
