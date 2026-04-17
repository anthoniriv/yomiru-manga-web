import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import * as schema from './schema.js';

export type DB = BetterSQLite3Database<typeof schema>;

let _db: DB | null = null;
let _sqlite: Database.Database | null = null;
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

export function getDbPath(): string {
  loadEnvFile();
  return process.env.YOMIRU_DB_PATH
    ? resolve(process.env.YOMIRU_DB_PATH)
    : resolve(process.cwd(), 'storage/yomiru.db');
}

export function getDb(): DB {
  if (_db) return _db;
  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  _sqlite = new Database(path);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');
  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function closeDb(): void {
  _sqlite?.close();
  _sqlite = null;
  _db = null;
}
