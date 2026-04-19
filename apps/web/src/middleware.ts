import { defineMiddleware } from 'astro:middleware';

declare global {
  // eslint-disable-next-line no-var
  var __ENV__: Record<string, string> | undefined;
}

const CACHEABLE_PATHS = [
  /^\/$/,
  /^\/mangas/,
  /^\/manga\/[^/]+$/,
  /^\/manga\/[^/]+\/[^/]+/,
];
const FRESH_TTL = 300; // 5 min — dentro de esto, HIT instant sin refresh
const STALE_TTL = 86400; // 24h — se sirve stale y refresca en background

// Cache key incluye commit SHA → cada deploy invalida automático.
// CF Pages expone CF_PAGES_COMMIT_SHA en runtime env.
function getCacheVersion(): string {
  const env = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  return env?.CF_PAGES_COMMIT_SHA?.slice(0, 12) ?? env?.CACHE_VERSION ?? 'v4';
}

export const onRequest = defineMiddleware(async (context, next) => {
  const reqStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const logTotal = (label: string) => {
    const endNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    console.log(`[PERF] total request time ${label}: ${Math.round(endNow - reqStart)}ms`);
  };

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

  if (!isCacheable) {
    const res = await next();
    logTotal(`${url.pathname} [no-cache]`);
    return res;
  }

  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  if (!cache) {
    const res = await next();
    logTotal(`${url.pathname} [no-cache-api]`);
    return res;
  }

  const cacheKey = new Request(`${url.toString()}#${getCacheVersion()}`, { method: 'GET' });
  const execCtx = (
    context.locals as { runtime?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } } }
  ).runtime?.ctx;

  const hit = await cache.match(cacheKey);
  if (hit) {
    const storedAt = Number(hit.headers.get('x-stored-at') ?? 0);
    const ageSeconds = (Date.now() - storedAt) / 1000;
    const isStale = ageSeconds > FRESH_TTL;

    if (isStale) {
      // Sirve el stale ya y refresca en background.
      execCtx?.waitUntil?.(
        (async () => {
          try {
            const freshRes = await next();
            if (freshRes.status === 200) {
              await cache.put(cacheKey, buildCacheable(freshRes));
            }
          } catch {
            // silenciar: mantenemos el stale
          }
        })(),
      );
    }

    const res = new Response(hit.body, hit);
    res.headers.set('x-cache', isStale ? 'STALE' : 'HIT');
    res.headers.set('age', String(Math.floor(ageSeconds)));
    logTotal(`${url.pathname} [${isStale ? 'STALE' : 'HIT'}]`);
    return res;
  }

  const response = await next();
  if (response.status === 200) {
    const cached = buildCacheable(response.clone());
    cached.headers.set('x-cache', 'MISS');
    execCtx?.waitUntil?.(cache.put(cacheKey, cached.clone()));
    logTotal(`${url.pathname} [MISS]`);
    return cached;
  }
  logTotal(`${url.pathname} [${response.status}]`);
  return response;
});

function buildCacheable(res: Response): Response {
  const out = new Response(res.body, res);
  // max-age=0: browser siempre revalida (evita HTML con _astro/CSS stale tras redeploy).
  // s-maxage: edge CF sirve cached fresco FRESH_TTL, stale hasta STALE_TTL.
  out.headers.set(
    'Cache-Control',
    `public, max-age=0, must-revalidate, s-maxage=${FRESH_TTL}, stale-while-revalidate=${STALE_TTL}`,
  );
  out.headers.set('x-stored-at', String(Date.now()));
  return out;
}
