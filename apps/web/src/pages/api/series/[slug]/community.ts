import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../../../lib/supabase';

export const prerender = false;

interface CommunityCacheEntry {
  comments: unknown[];
  expiresAt: number;
}

const COMMUNITY_CACHE_TTL_MS = 120_000;

function getCommunityCacheStore() {
  const globalCache = globalThis as typeof globalThis & {
    __YOMIRU_COMMUNITY_CACHE__?: Map<string, CommunityCacheEntry>;
  };
  if (!globalCache.__YOMIRU_COMMUNITY_CACHE__) {
    globalCache.__YOMIRU_COMMUNITY_CACHE__ = new Map();
  }
  return globalCache.__YOMIRU_COMMUNITY_CACHE__;
}

export const GET: APIRoute = async ({ params, request, cookies }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cache = getCommunityCacheStore();
  const now = Date.now();
  const hit = cache.get(slug);
  if (hit && hit.expiresAt > now) {
    return new Response(JSON.stringify({ ok: true, comments: hit.comments }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=240',
      },
    });
  }

  try {
    const sb = createSupabaseServer(request, cookies, { persistCookies: false });
    const { data: comments } = await sb
      .from('series_comments')
      .select('id, author_name, body, created_at, user_id')
      .eq('series_slug', slug)
      .order('created_at', { ascending: false })
      .limit(20);

    cache.set(slug, {
      comments: comments ?? [],
      expiresAt: now + COMMUNITY_CACHE_TTL_MS,
    });

    return new Response(JSON.stringify({ ok: true, comments: comments ?? [] }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=240',
      },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, comments: [] }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  }
};
