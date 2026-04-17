import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';
import { isAdmin } from '../../../../lib/admin';

const { series } = pgSchema;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const slug = params.slug;
  if (!slug) return new Response('missing slug', { status: 400 });

  const form = await request.formData().catch(() => null);
  const nextVal = form?.get('value') === '1';
  const redirectTo = (form?.get('redirect') as string | null) ?? `/manga/${slug}`;

  await getPgDb().update(series).set({ isAdult: nextVal }).where(eq(series.slug, slug));
  return redirect(redirectTo, 303);
};
