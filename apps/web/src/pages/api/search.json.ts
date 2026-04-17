import type { APIRoute } from 'astro';
import { searchSeries, getCoverUrl } from '../../lib/db';
import { readShowAdult } from '../../lib/nsfw';

export const GET: APIRoute = async ({ url, cookies }) => {
  const q = url.searchParams.get('q')?.trim() ?? '';

  if (!q || q.length < 2) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const showAdult = readShowAdult(cookies);
  const results = await searchSeries(q, 20, { showAdult });
  const payload = results.map((s) => ({
    slug: s.slug,
    title: s.title,
    coverUrl: getCoverUrl(s),
  }));

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
