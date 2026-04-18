import { defineMiddleware } from 'astro:middleware';

// Copia env del runtime de Cloudflare Workers a process.env para que
// paquetes que leen process.env.* (getPgDb, @yomiru/r2) los encuentren.
export const onRequest = defineMiddleware((context, next) => {
  const runtimeEnv = (context.locals as { runtime?: { env?: Record<string, unknown> } }).runtime?.env;
  if (runtimeEnv) {
    const proc = (globalThis as { process?: { env?: Record<string, string> } }).process;
    if (proc?.env) {
      for (const [key, value] of Object.entries(runtimeEnv)) {
        if (typeof value === 'string' && proc.env[key] === undefined) {
          proc.env[key] = value;
        }
      }
    }
  }
  return next();
});
