import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

/**
 * Dedup capibara series duplicates created by collision-suffix logic.
 *
 * Group by stripping any "-{scanSlug}" suffix from slug. For each group of
 * 2+ capibara rows, keep the one with most chapters (tiebreak: most pages,
 * then most popularity). Delete the rest along with their chapters/pages.
 */

interface Row {
  id: string;
  slug: string;
  title: string;
  total_chapters: number;
  page_count: number;
  popularity: number;
  source_url: string;
  source_id: string | null;
}

function baseSlugFor(row: Row): string {
  // sourceId is "{scanSlug}/{mangaSlug}". If our ingest suffixed the slug
  // with "-{scanSlug}" to dodge a collision, strip that exact suffix.
  if (!row.source_id) return row.slug;
  const idx = row.source_id.indexOf('/');
  if (idx <= 0) return row.slug;
  const scanSlug = row.source_id.slice(0, idx).toLowerCase();
  const suffix = `-${scanSlug}`;
  if (row.slug.endsWith(suffix)) return row.slug.slice(0, -suffix.length);
  return row.slug;
}

async function main() {
  const db = getPgDb();
  const r = await db.execute<Row>(sql`
    SELECT
      s.id, s.slug, s.title, s.total_chapters, s.popularity, s.source_url, s.source_id,
      (SELECT COUNT(*) FROM manga.pages p
       JOIN manga.chapters c ON p.chapter_id = c.id
       WHERE c.series_id = s.id)::int AS page_count
    FROM manga.series s
    WHERE s.source_name = 'capibaratraductor.com'
  `);
  const rows: Row[] = (Array.isArray(r) ? r : (r as any).rows ?? []) as Row[];
  console.log(`[dedup] capibara series total: ${rows.length}`);

  // Group by stripped slug
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const base = baseSlugFor(row);
    (groups.get(base) ?? groups.set(base, []).get(base)!).push(row);
  }

  let deleted = 0;
  let groupsWithDups = 0;
  for (const [base, items] of groups) {
    if (items.length < 2) continue;
    groupsWithDups += 1;
    // Sort: most chapters → most pages → most popularity. Winner is items[0].
    items.sort(
      (a, b) =>
        b.total_chapters - a.total_chapters ||
        b.page_count - a.page_count ||
        b.popularity - a.popularity,
    );
    const winner = items[0];
    const losers = items.slice(1);
    console.log(
      `[dedup] ${base}: keep ${winner.slug} (${winner.total_chapters}c, ${winner.page_count}p) — drop ${losers.map((l) => `${l.slug} (${l.total_chapters}c, ${l.page_count}p)`).join(', ')}`,
    );
    for (const l of losers) {
      await db.execute(sql`DELETE FROM manga.pages WHERE chapter_id IN (SELECT id FROM manga.chapters WHERE series_id = ${l.id})`);
      await db.execute(sql`DELETE FROM manga.chapters WHERE series_id = ${l.id}`);
      await db.execute(sql`DELETE FROM manga.series WHERE id = ${l.id}`);
      deleted += 1;
    }
    // Also rename winner if it has a scan suffix (so the canonical slug is clean)
    if (winner.slug !== base) {
      // Check that base slug isn't taken by some non-capibara row
      const conflict = await db.execute<{ id: string }>(
        sql`SELECT id FROM manga.series WHERE slug = ${base} AND id <> ${winner.id} LIMIT 1`,
      );
      const cf: any = Array.isArray(conflict) ? conflict : (conflict as any).rows ?? [];
      if (cf.length === 0) {
        await db.execute(
          sql`UPDATE manga.series SET slug = ${base}, normalized_title = ${base} WHERE id = ${winner.id}`,
        );
        console.log(`         renamed winner ${winner.slug} → ${base}`);
      }
    }
  }

  console.log(`[dedup] groups with dups: ${groupsWithDups}, rows deleted: ${deleted}`);

  // Pass 2: cross-source dups. For each capibara row with a "-{scan}" suffix,
  // check if a non-capibara row exists at the base slug. If so, prefer the
  // non-capibara row (keeps R2 content) and delete the capibara dup.
  const capRows = await db.execute<Row>(sql`
    SELECT id, slug, title, total_chapters, popularity, source_url, source_id,
      (SELECT COUNT(*) FROM manga.pages p
       JOIN manga.chapters c ON p.chapter_id = c.id
       WHERE c.series_id = s.id)::int AS page_count
    FROM manga.series s
    WHERE source_name = 'capibaratraductor.com'
  `);
  const cap: Row[] = (Array.isArray(capRows) ? capRows : (capRows as any).rows ?? []) as Row[];
  let crossDeleted = 0;
  for (const c of cap) {
    const base = baseSlugFor(c);
    if (base === c.slug) continue; // not a suffixed dup
    const conflict = await db.execute<{ id: string; source_name: string }>(
      sql`SELECT id, source_name FROM manga.series WHERE slug = ${base} AND id <> ${c.id} LIMIT 1`,
    );
    const cf: any = Array.isArray(conflict) ? conflict : (conflict as any).rows ?? [];
    if (cf.length === 0) continue;
    const other = cf[0];
    if (other.source_name === 'capibaratraductor.com') continue; // same-source handled above
    // Cross-source: drop the capibara suffixed dup, keep the non-capibara row.
    await db.execute(sql`DELETE FROM manga.pages WHERE chapter_id IN (SELECT id FROM manga.chapters WHERE series_id = ${c.id})`);
    await db.execute(sql`DELETE FROM manga.chapters WHERE series_id = ${c.id}`);
    await db.execute(sql`DELETE FROM manga.series WHERE id = ${c.id}`);
    console.log(`[dedup] cross-source: drop capibara ${c.slug} (kept ${other.source_name} row)`);
    crossDeleted += 1;
  }
  console.log(`[dedup] cross-source dups deleted: ${crossDeleted}`);

  await closePgDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
