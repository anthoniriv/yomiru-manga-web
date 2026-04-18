import { defineMiddleware } from 'astro:middleware';

declare global {
  // eslint-disable-next-line no-var
  var __ENV__: Record<string, string> | undefined;
}

// Expone los bindings del Worker a través de globalThis.__ENV__ para
// que paquetes del monorepo (getPgDb, @yomiru/r2) los encuentren. En
// Workers process.env está congelado, por eso no lo tocamos acá.
export const onRequest = defineMiddleware((context, next) => {
  const runtimeEnv = (
    context.locals as { runtime?: { env?: Record<string, unknown> } }
  ).runtime?.env;
  if (runtimeEnv) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(runtimeEnv)) {
      if (typeof value === 'string') env[key] = value;
    }
    globalThis.__ENV__ = env;
  }
  return next();
});
