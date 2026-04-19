import type { APIRoute } from 'astro';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';
import { isAdmin } from '../../../lib/admin';
import { findMalForSeries } from '../../../lib/mal';

const { series, seriesGenres, chapters } = pgSchema;

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const form = await request.formData().catch(() => null);
  const url = new URL(request.url);
  const limit = parseInt((form?.get('limit') as string | null) ?? url.searchParams.get('limit') ?? '50', 10);
  const force = (form?.get('force') as string | null) === 'true' || url.searchParams.get('force') === 'true';

  const db = getPgDb();

  const baseWhere = sql`${series.id} IN (SELECT DISTINCT series_id FROM ${chapters} WHERE download_status='completed')`;
  const candidates = await db
    .select()
    .from(series)
    .where(
      force
        ? baseWhere
        : and(
            baseWhere,
            or(isNull(series.rating), isNull(series.year), isNull(series.author), eq(series.status, 'unknown'))!,
          ),
    )
    .limit(Math.max(1, Math.min(limit, 3000)));

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));

      send({ event: 'start', total: candidates.length });

      let ok = 0;
      let miss = 0;
      for (const row of candidates) {
        const alt = Array.isArray(row.altTitles) ? (row.altTitles as string[]) : [];
        try {
          const mal = await findMalForSeries(row.title, alt);
          if (!mal) {
            miss++;
            send({ event: 'miss', slug: row.slug, title: row.title });
            await new Promise((r) => setTimeout(r, 1100));
            continue;
          }
          const patch: Record<string, unknown> = {};
          if (force || row.rating == null) if (mal.score != null) patch.rating = mal.score;
          if (force || (row.voteCount ?? 0) === 0) if (mal.scoredBy) patch.voteCount = mal.scoredBy;
          if (force || row.year == null) if (mal.year != null) patch.year = mal.year;
          if (force || !row.author) if (mal.authors.length > 0) patch.author = mal.authors[0];
          if (force || !row.description || row.description.length < 40) if (mal.synopsis) patch.description = mal.synopsis;
          if (force || row.status === 'unknown' || !row.status) if (mal.status !== 'unknown') patch.status = mal.status;
          if (mal.isAdult) patch.isAdult = true;
          if (force || !row.coverSourceUrl) if (mal.coverUrl) patch.coverSourceUrl = mal.coverUrl;
          patch.updatedAt = new Date();

          await db.update(series).set(patch).where(eq(series.id, row.id));

          const genres = [...new Set([...mal.genres, ...mal.themes, ...mal.demographics])];
          if (force) {
            await db.delete(seriesGenres).where(eq(seriesGenres.seriesId, row.id));
          }
          if (genres.length > 0) {
            await db
              .insert(seriesGenres)
              .values(genres.map((g) => ({ seriesId: row.id, genre: g })))
              .onConflictDoNothing();
          }
          ok++;
          send({ event: 'ok', slug: row.slug, title: row.title, patched: Object.keys(patch) });
        } catch (e) {
          send({ event: 'error', slug: row.slug, error: String(e) });
        }
        await new Promise((r) => setTimeout(r, 1100));
      }
      send({ event: 'done', ok, miss, total: candidates.length });
      controller.close();
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
};
