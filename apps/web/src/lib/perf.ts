// Performance instrumentation for Supabase/Postgres queries.
// Logs go to stdout; Cloudflare Workers surfaces them in `wrangler tail`.
// Disable in prod by setting PERF_LOG=0.

function perfEnabled(): boolean {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  const flag = globalEnv?.PERF_LOG ?? (typeof process !== 'undefined' ? process.env.PERF_LOG : undefined);
  return flag !== '0';
}

const ENABLED = perfEnabled();

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(now() - start);
    console.log(`[PERF] supabase query ${label}: ${ms}ms`);
  }
}

export function startRequestTimer(label: string): () => void {
  if (!ENABLED) return () => {};
  const start = now();
  return () => {
    const ms = Math.round(now() - start);
    console.log(`[PERF] total request time ${label}: ${ms}ms`);
  };
}
