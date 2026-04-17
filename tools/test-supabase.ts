import 'dotenv/config';
import { getPgDb, pgSchema } from '../packages/db/src/index.js';
import { sql } from 'drizzle-orm';

const { series, chapters, pages } = pgSchema;

async function main() {
  console.log('Connecting to Supabase...');
  const db = getPgDb();

  const [s, c, p] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(series),
    db.select({ count: sql<number>`count(*)` }).from(chapters),
    db.select({ count: sql<number>`count(*)` }).from(pages),
  ]);

  console.log('Connected!');
  console.log(`  series:   ${s[0]?.count}`);
  console.log(`  chapters: ${c[0]?.count}`);
  console.log(`  pages:    ${p[0]?.count}`);
}

main().catch((err) => { console.error('FAIL:', err.message); process.exit(1); });
