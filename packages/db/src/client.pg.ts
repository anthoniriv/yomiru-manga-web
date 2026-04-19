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

// Extrae host+port+db para identificar "misma conexión lógica". Hyperdrive rota
// user/pass por request, pero el endpoint del proxy es estable dentro del isolate.
// Comparar URLs completas haría reconnect por request → explosion de pools.
function connectionKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return url;
  }
}

// Cache the connection pool per isolate. In Workers persiste entre requests
// warm del mismo isolate — skip TCP+TLS+auth handshake (~500ms).
export function getPgDb(): PgDB {
  const url = resolveUrl();
  const key = connectionKey(url);

  if (_db && _url === key) return _db;

  const sql = postgres(url, {
    max: isWorkers ? 3 : 10,
    prepare: false, // required for Supabase transaction pooler (port 6543)
    fetch_types: false,
    idle_timeout: isWorkers ? 20 : undefined,
  });
  const db = drizzle(sql, { schema });
  _sql = sql;
  _db = db;
  _url = key;
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
