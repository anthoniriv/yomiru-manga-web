import type { APIRoute } from 'astro';
import { getPerfSnapshot, isPerfRequestAuthorized } from '../../lib/perf';

export const GET: APIRoute = async ({ request }) => {
  if (!isPerfRequestAuthorized(request)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'unauthorized' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      source: 'web',
      snapshot: getPerfSnapshot(),
    }, null, 2),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
};
