import { defineMiddleware } from 'astro:middleware';

declare global {
  // eslint-disable-next-line no-var
  var __ENV__: Record<string, string> | undefined;
}

// Astro Cloudflare adapter expone bindings vía Astro.locals.runtime.env
// pero no los copia a process.env (puede estar congelado en Workers).
// Guardamos el env en globalThis para que paquetes del monorepo lo lean.
export const onRequest = defineMiddleware((context, next) => {
  const runtime = (context.locals as { runtime?: { env?: Record<string, unknown> } }).runtime;
  const runtimeEnv = runtime?.env;
  console.log('[mw] locals keys:', Object.keys(context.locals));
  console.log('[mw] runtime?', !!runtime, 'env keys:', runtimeEnv ? Object.keys(runtimeEnv) : 'none');
  if (runtimeEnv) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(runtimeEnv)) {
      if (typeof value === 'string') env[key] = value;
    }
    globalThis.__ENV__ = env;

    const proc = (globalThis as { process?: { env?: Record<string, string> } })
      .process;
    if (proc?.env) {
      try {
        for (const [key, value] of Object.entries(env)) {
          if (proc.env[key] === undefined) proc.env[key] = value;
        }
      } catch {
        // process.env puede estar congelado; __ENV__ es el fallback.
      }
    }
  }
  return next();
});
