import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';
import { addSearchParam, getSafeRedirectPath } from '../../../../lib/redirect';
import { createSupabaseServer } from '../../../../lib/supabase';

const { series } = pgSchema;

export const prerender = false;

function displayName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const metadataName = user.user_metadata?.name ?? user.user_metadata?.full_name;
  if (typeof metadataName === 'string' && metadataName.trim()) return metadataName.trim().slice(0, 40);
  const emailName = user.email?.split('@')[0]?.trim();
  return emailName ? emailName.slice(0, 40) : 'Lector';
}

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const slug = params.slug;
  if (!slug) return new Response('missing slug', { status: 400 });

  const form = await request.formData();
  const redirectTo = getSafeRedirectPath(form.get('redirect'), `/manga/${slug}`);
  const body = String(form.get('body') ?? '').trim();

  if (body.length < 1 || body.length > 800) {
    return redirect(addSearchParam(redirectTo, 'comment', 'invalid'), 303);
  }

  const sb = createSupabaseServer(request, cookies);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`, 303);
  }

  const [row] = await getPgDb().select({ id: series.id, slug: series.slug }).from(series).where(eq(series.slug, slug)).limit(1);
  if (!row) return new Response('not found', { status: 404 });

  const { error } = await sb.from('series_comments').insert({
    series_id: row.id,
    series_slug: row.slug,
    user_id: user.id,
    author_name: displayName(user),
    body,
  });

  return redirect(addSearchParam(redirectTo, 'comment', error ? 'error' : 'ok'), 303);
};
