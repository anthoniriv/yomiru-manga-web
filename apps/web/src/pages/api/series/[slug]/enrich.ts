import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';
import { isAdmin } from '../../../../lib/admin';
import { findMalForSeries } from '../../../../lib/mal';

const { series, seriesGenres } = pgSchema;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const slug = params.slug;
  if (!slug) return new Response('missing slug', { status: 400 });

  const db = getPgDb();
  const [row] = await db.select().from(series).where(eq(series.slug, slug)).limit(1);
  if (!row) return new Response('not found', { status: 404 });

  const alt = Array.isArray(row.altTitles) ? (row.altTitles as string[]) : [];
  const mal = await findMalForSeries(row.title, alt);

  const form = await request.formData().catch(() => null);
  const url = new URL(request.url);
  const redirectTo = (form?.get('redirect') as string | null) ?? `/manga/${slug}`;
  const asJson = request.headers.get('accept')?.includes('json');
  const force = (form?.get('force') as string | null) === 'true' || url.searchParams.get('force') === 'true';

  if (!mal) {
    if (asJson) return new Response(JSON.stringify({ ok: false, reason: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return redirect(`${redirectTo}?enrich=not_found`, 303);
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

  if (asJson) {
    return new Response(JSON.stringify({ ok: true, mal_id: mal.malId, patched: Object.keys(patch) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return redirect(`${redirectTo}?enrich=ok`, 303);
};
