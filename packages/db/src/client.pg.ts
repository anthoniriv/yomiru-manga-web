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
let _url: string | null = null;

const isWorkers =
  typeof (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'string' &&
  (globalThis as { navigator: { userAgent: string } }).navigator.userAgent.includes('Cloudflare');

function loadEnvFile(): void {
  if (_envLoaded || isWorkers) return;
  _envLoaded = true;
  try {
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
    // fs unavailable — env provided by runtime
  }
}

function resolveUrl(): string {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  const envUrl = typeof process !== 'undefined' ? process.env?.DATABASE_URL : undefined;
  const url = envUrl ?? globalEnv?.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL env var missing');
  return url;
}

// En Cloudflare Workers NO se puede reusar I/O (sockets, streams) entre requests:
//   "Cannot perform I/O on behalf of a different request"
// Hyperdrive hace el pooling real — cada request crea postgres() fresh que
// conecta al proxy local (<10ms overhead).
// En Node (dev/scripts) cacheamos para evitar handshake repetido.
export function getPgDb(): PgDB {
  if (!isWorkers) loadEnvFile();
  const url = resolveUrl();

  if (!isWorkers && _db && _url === url) return _db;

  const sql = postgres(url, {
    max: isWorkers ? 5 : 10,
    prepare: false, // required for Supabase transaction pooler (port 6543)
    fetch_types: false,
    idle_timeout: isWorkers ? 10 : undefined,
  });
  const db = drizzle(sql, { schema });
  if (!isWorkers) {
    _sql = sql;
    _db = db;
    _url = url;
  }
  return db;
}

// For scripts (CLI, migrations): ensure .env is loaded before calling getPgDb.
export async function ensureEnvLoaded(): Promise<void> {
  if (!isWorkers) loadEnvFile();
}

export async function closePgDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}
