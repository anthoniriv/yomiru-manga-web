import { defineMiddleware } from 'astro:middleware';

declare global {
  // eslint-disable-next-line no-var
  var __ENV__: Record<string, string> | undefined;
}

const CACHEABLE_PATHS = [/^\/$/, /^\/mangas/, /^\/manga\/[^/]+$/];
const CACHE_TTL = 30;

export const onRequest = defineMiddleware(async (context, next) => {
  const runtimeEnv = (
    context.locals as { runtime?: { env?: Record<string, unknown> } }
  ).runtime?.env;
  if (runtimeEnv) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(runtimeEnv)) {
      if (typeof value === 'string') env[key] = value;
    }
    const hyperdrive = runtimeEnv.HYPERDRIVE as { connectionString?: string } | undefined;
    if (hyperdrive?.connectionString) {
      env.DATABASE_URL = hyperdrive.connectionString;
    }
    globalThis.__ENV__ = env;
  }

  const req = context.request;
  const url = new URL(req.url);
  const isCacheable =
    req.method === 'GET' &&
    CACHEABLE_PATHS.some((re) => re.test(url.pathname)) &&
    !req.headers.get('cookie')?.includes('admin=');

  if (isCacheable) {
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    if (cache) {
      const cacheKey = new Request(url.toString(), { method: 'GET' });
      const hit = await cache.match(cacheKey);
      if (hit) {
        const res = new Response(hit.body, hit);
        res.headers.set('x-cache', 'HIT');
        return res;
      }
      const response = await next();
      if (response.status === 200) {
        const cached = new Response(response.clone().body, response);
        cached.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`);
        cached.headers.set('x-cache', 'MISS');
        const execCtx = (context.locals as { runtime?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } } }).runtime?.ctx;
        execCtx?.waitUntil?.(cache.put(cacheKey, cached.clone()));
        return cached;
      }
      return response;
    }
  }

  return next();
});
