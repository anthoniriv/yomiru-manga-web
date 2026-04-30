import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';

async function main() {
  const db = getPgDb();
  console.log('altering manga.pages.storage_path to nullable...');
  await db.execute(sql`ALTER TABLE manga.pages ALTER COLUMN storage_path DROP NOT NULL`);
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
