import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve as resolvePath, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

for (const candidate of [
  resolvePath(process.cwd(), '.env'),
  resolvePath(process.cwd(), '../../.env'),
  resolvePath(process.cwd(), '../../../.env'),
]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

const { getDbPath } = await import('./client.js');
const path = getDbPath();
mkdirSync(dirname(path), { recursive: true });
const sqlite = new Database(path);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);

const migrationsFolder = resolvePath(
  new URL('.', import.meta.url).pathname,
  '../migrations',
);

console.log(`[db] migrating ${path} from ${migrationsFolder}`);
migrate(db, { migrationsFolder });
console.log('[db] migrations applied');
sqlite.close();
