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

const isWorkers =
  typeof (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'string' &&
  (globalThis as { navigator: { userAgent: string } }).navigator.userAgent.includes('Cloudflare');

function resolveUrl(): string {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  const url = process.env.DATABASE_URL ?? globalEnv?.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL env var missing');
  return url;
}

// Cache the connection pool per isolate. In Workers this persists across
// warm requests served by the same isolate — skips TCP+TLS+auth handshake
// (~500ms) on subsequent requests. Hyperdrive drop-in later replaces only
// the URL returned by resolveUrl().
let _url: string | null = null;

export function getPgDb(): PgDB {
  const url = (() => {
    if (!isWorkers && !_envLoaded) loadEnvFile();
    return resolveUrl();
  })();

  if (_db && _url === url) return _db;

  const sql = postgres(url, {
    max: isWorkers ? 3 : 10,
    prepare: false, // required for Supabase transaction pooler (port 6543)
    fetch_types: false,
    idle_timeout: isWorkers ? 20 : undefined,
    connect_timeout: 10,
  });
  const db = drizzle(sql, { schema });
  _sql = sql;
  _db = db;
  _url = url;
  return db;
}

export async function closePgDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}
