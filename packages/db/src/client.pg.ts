import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import * as schema from './schema.pg.js';

export type PgDB = PostgresJsDatabase<typeof schema>;

let _db: PgDB | null = null;
let _sql: ReturnType<typeof postgres> | null = null;
let _envLoaded = false;

function loadEnvFile(): void {
  if (_envLoaded) return;
  _envLoaded = true;
  for (const candidate of [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(process.cwd(), '../../../.env'),
  ]) {
    if (existsSync(candidate)) {
      loadEnv({ path: candidate });
      return;
    }
  }
}

export function getPgDb(): PgDB {
  if (_db) return _db;
  loadEnvFile();
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  const url = process.env.DATABASE_URL ?? globalEnv?.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL env var missing');
  _sql = postgres(url, {
    max: 10,
    prepare: false, // required for Supabase transaction pooler (port 6543)
  });
  _db = drizzle(_sql, { schema });
  return _db;
}

export async function closePgDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}
