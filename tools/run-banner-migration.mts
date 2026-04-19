import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const { getPgDb } = await import('@yomiru/db');
const { sql } = await import('drizzle-orm');

const migration = readFileSync(resolve(process.cwd(), 'tools/migrate-add-banner-cols.sql'), 'utf-8');
const db = getPgDb();
await db.execute(sql.raw(migration));
console.log('[ok] banner columns added');
process.exit(0);
