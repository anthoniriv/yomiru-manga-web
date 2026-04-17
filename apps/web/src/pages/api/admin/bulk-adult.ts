import type { APIRoute } from 'astro';
import { inArray } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';
import { isAdmin } from '../../../lib/admin';

const { series } = pgSchema;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const body = await request.json().catch(() => null) as { ids?: unknown; value?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const value = body?.value === true;

  if (ids.length === 0) {
    return Response.json({ updated: 0 });
  }

  await getPgDb().update(series).set({ isAdult: value }).where(inArray(series.id, ids));
  return Response.json({ updated: ids.length, value });
};
