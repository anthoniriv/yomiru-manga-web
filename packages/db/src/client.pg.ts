import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.pg.js';

export type PgDB = PostgresJsDatabase<typeof schema>;

let _db: PgDB | null = null;
let _sql: ReturnType<typeof postgres> | null = null;
let _envLoaded = false;
let _url: string | null = null;

const isWorkers =
  typeof (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'string' &&
  (globalThis as { navigator: { userAgent: string } }).navigator.userAgent.includes('Cloudflare');

async function loadEnvFile(): Promise<void> {
  if (_envLoaded || isWorkers) return;
  _envLoaded = true;
  try {
    const [{ existsSync }, { resolve }, { config: loadEnv }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('dotenv'),
    ]);
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
  } catch {
    // dotenv missing or fs unavailable — env should be provided by runtime
  }
}

function resolveUrl(): string {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  const envUrl = typeof process !== 'undefined' ? process.env?.DATABASE_URL : undefined;
  const url = envUrl ?? globalEnv?.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL env var missing');
  return url;
}

// Cache the connection pool per isolate. In Workers this persists across
// warm requests served by the same isolate — skips TCP+TLS+auth handshake
// (~500ms) on subsequent requests. Hyperdrive replaces only the URL via
// middleware — no code change here.
export function getPgDb(): PgDB {
  const url = resolveUrl();

  if (_db && _url === url) return _db;

  const sql = postgres(url, {
    max: isWorkers ? 3 : 10,
    prepare: false, // required for Supabase transaction pooler (port 6543)
    fetch_types: false,
    idle_timeout: isWorkers ? 20 : undefined,
  });
  const db = drizzle(sql, { schema });
  _sql = sql;
  _db = db;
  _url = url;
  return db;
}

// For scripts (CLI, migrations): ensure .env is loaded before calling getPgDb.
export async function ensureEnvLoaded(): Promise<void> {
  if (!isWorkers) await loadEnvFile();
}

export async function closePgDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}
