import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

async function main() {
  const db = getPgDb();
  for (const t of ['series', 'chapters', 'pages']) {
    const r = await db.execute<any>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='manga' AND table_name=${t}
      ORDER BY ordinal_position
    `);
    console.log(`-- ${t} --`);
    console.log(r.map((x: any) => x.column_name).join(', '));
  }
  await closePgDb();
}
main();
