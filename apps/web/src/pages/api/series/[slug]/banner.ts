import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';
import { r2Upload } from '@yomiru/r2';
import { isAdmin } from '../../../../lib/admin';
import { findBannerForSeries } from '../../../../lib/anilist';

const { series } = pgSchema;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const slug = params.slug;
  if (!slug) return new Response('missing slug', { status: 400 });

  const db = getPgDb();
  const [row] = await db.select().from(series).where(eq(series.slug, slug)).limit(1);
  if (!row) return new Response('not found', { status: 404 });

  const asJson = request.headers.get('accept')?.includes('json');
  const form = await request.formData().catch(() => null);
  const redirectTo = (form?.get('redirect') as string | null) ?? `/manga/${slug}`;

  const alt = Array.isArray(row.altTitles) ? (row.altTitles as string[]) : [];
  const hit = await findBannerForSeries(row.title, alt);

  if (!hit?.bannerImage) {
    if (asJson) return Response.json({ ok: false, reason: 'no_banner' }, { status: 404 });
    return redirect(`${redirectTo}?banner=not_found`, 303);
  }

  const res = await fetch(hit.bannerImage, { headers: { 'User-Agent': 'yomiru/1.0' } });
  if (!res.ok) {
    if (asJson) return Response.json({ ok: false, reason: 'fetch_failed', status: res.status }, { status: 502 });
    return redirect(`${redirectTo}?banner=fetch_failed`, 303);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const key = `manga/${row.slug}/banner.${ext}`;

  await r2Upload(key, buf, contentType);
  await db.update(series).set({
    bannerPath: key,
    bannerSourceUrl: hit.bannerImage,
    updatedAt: new Date(),
  }).where(eq(series.id, row.id));

  if (asJson) return Response.json({ ok: true, bannerPath: key, anilistId: hit.anilistId });
  return redirect(`${redirectTo}?banner=ok`, 303);
};
