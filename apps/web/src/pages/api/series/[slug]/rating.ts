import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';
import { addSearchParam, getSafeRedirectPath } from '../../../../lib/redirect';
import { createSupabaseServer } from '../../../../lib/supabase';

const { series } = pgSchema;

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const slug = params.slug;
  if (!slug) return new Response('missing slug', { status: 400 });

  const form = await request.formData();
  const redirectTo = getSafeRedirectPath(form.get('redirect'), `/manga/${slug}`);
  const rating = Number(form.get('rating'));

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return redirect(addSearchParam(redirectTo, 'rating', 'invalid'), 303);
  }

  const sb = createSupabaseServer(request, cookies);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`, 303);
  }

  const [row] = await getPgDb().select({ id: series.id, slug: series.slug }).from(series).where(eq(series.slug, slug)).limit(1);
  if (!row) return new Response('not found', { status: 404 });

  const { error } = await sb.from('series_ratings').upsert({
    user_id: user.id,
    series_id: row.id,
    series_slug: row.slug,
    rating,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,series_id' });

  return redirect(addSearchParam(redirectTo, 'rating', error ? 'error' : 'ok'), 303);
};
