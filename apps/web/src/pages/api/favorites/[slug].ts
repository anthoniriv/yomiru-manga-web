import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';
import { createSupabaseServer } from '../../../lib/supabase';
import { getCoverUrl } from '../../../lib/db';
import { getSafeRedirectPath } from '../../../lib/redirect';

const { series } = pgSchema;

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const slug = params.slug;
  if (!slug) return new Response('missing slug', { status: 400 });

  const sb = createSupabaseServer(request, cookies);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return redirect(`/login?redirect=${encodeURIComponent(`/manga/${slug}`)}`, 303);
  }

  const form = await request.formData().catch(() => null);
  const action = String(form?.get('action') ?? 'toggle');
  const redirectTo = getSafeRedirectPath(form?.get('redirect'), `/manga/${slug}`);

  const db = getPgDb();
  const [row] = await db.select().from(series).where(eq(series.slug, slug)).limit(1);
  if (!row) return new Response('not found', { status: 404 });

  const cover = getCoverUrl(row);

  if (action === 'remove') {
    await sb.from('user_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('series_id', row.id);
  } else {
    const { data: existing } = await sb.from('user_favorites')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('series_id', row.id)
      .maybeSingle();

    if (existing && action === 'toggle') {
      await sb.from('user_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('series_id', row.id);
    } else if (!existing) {
      await sb.from('user_favorites').insert({
        user_id: user.id,
        series_id: row.id,
        series_slug: row.slug,
        series_title: row.title,
        cover_url: cover,
      });
    }
  }

  const response = redirect(redirectTo, 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
