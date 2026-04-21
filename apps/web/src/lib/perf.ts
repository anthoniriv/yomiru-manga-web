type MetricKind = 'request' | 'query';

interface PerfMetricSummary {
  key: string;
  kind: MetricKind;
  count: number;
  errorCount: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
  lastMs: number;
  lastStatus?: number;
  lastSeenAt: string;
}

interface PerfStore {
  startedAt: number;
  metrics: Map<string, PerfMetricBucket>;
  slowEvents: PerfEvent[];
  alertCooldowns: Map<string, number>;
}

interface PerfMetricBucket {
  key: string;
  kind: MetricKind;
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  lastStatus?: number;
  lastSeenAt: number;
}

interface PerfEvent {
  kind: MetricKind;
  key: string;
  ms: number;
  status?: number;
  at: number;
}

function perfEnabled(): boolean {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  const flag = globalEnv?.PERF_LOG ?? (typeof process !== 'undefined' ? process.env.PERF_LOG : undefined);
  return flag !== '0';
}

function slowRequestThresholdMs(): number {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  const raw = globalEnv?.PERF_SLOW_REQUEST_MS ?? process.env.PERF_SLOW_REQUEST_MS ?? '800';
  return Number(raw) || 800;
}

function slowQueryThresholdMs(): number {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  const raw = globalEnv?.PERF_SLOW_QUERY_MS ?? process.env.PERF_SLOW_QUERY_MS ?? '250';
  return Number(raw) || 250;
}

function perfWebhookUrl(): string {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  return globalEnv?.PERF_WEBHOOK_URL ?? process.env.PERF_WEBHOOK_URL ?? '';
}

function perfAdminToken(): string {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  return globalEnv?.PERF_ADMIN_TOKEN ?? process.env.PERF_ADMIN_TOKEN ?? '';
}

const ENABLED = perfEnabled();
const MAX_SLOW_EVENTS = 50;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function epochNow(): number {
  return Date.now();
}

function getStore(): PerfStore {
  const globalPerf = globalThis as typeof globalThis & { __YOMIRU_WEB_PERF__?: PerfStore };
  if (!globalPerf.__YOMIRU_WEB_PERF__) {
    globalPerf.__YOMIRU_WEB_PERF__ = {
      startedAt: epochNow(),
      metrics: new Map(),
      slowEvents: [],
      alertCooldowns: new Map(),
    };
  }
  return globalPerf.__YOMIRU_WEB_PERF__;
}

function upsertMetric(kind: MetricKind, key: string, ms: number, status?: number) {
  const store = getStore();
  const bucket = store.metrics.get(`${kind}:${key}`) ?? {
    key,
    kind,
    count: 0,
    errorCount: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
    lastStatus: undefined,
    lastSeenAt: 0,
  };

  bucket.count += 1;
  bucket.totalMs += ms;
  bucket.maxMs = Math.max(bucket.maxMs, ms);
  bucket.lastMs = ms;
  bucket.lastStatus = status;
  bucket.lastSeenAt = epochNow();
  if ((status ?? 200) >= 400) bucket.errorCount += 1;

  store.metrics.set(`${kind}:${key}`, bucket);
}

function pushSlowEvent(kind: MetricKind, key: string, ms: number, status?: number) {
  const store = getStore();
  store.slowEvents.unshift({ kind, key, ms, status, at: epochNow() });
  if (store.slowEvents.length > MAX_SLOW_EVENTS) {
    store.slowEvents.length = MAX_SLOW_EVENTS;
  }
}

async function notifySlowMetric(kind: MetricKind, key: string, ms: number, status?: number) {
  const webhookUrl = perfWebhookUrl();
  if (!webhookUrl) return;

  const store = getStore();
  const cooldownKey = `${kind}:${key}`;
  const lastAlertAt = store.alertCooldowns.get(cooldownKey) ?? 0;
  const currentTime = epochNow();
  if (currentTime - lastAlertAt < ALERT_COOLDOWN_MS) return;
  store.alertCooldowns.set(cooldownKey, currentTime);

  const body = {
    username: 'Yomiru Perf',
    content:
      kind === 'request'
        ? `Lenta en web: \`${key}\` tardó ${ms}ms${status ? ` (status ${status})` : ''}.`
        : `Query lenta en web: \`${key}\` tardó ${ms}ms.`,
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Silenciar alertas fallidas para no afectar requests.
  }
}

function trackMetric(kind: MetricKind, key: string, ms: number, status?: number) {
  if (!ENABLED) return;
  upsertMetric(kind, key, ms, status);

  const rounded = Math.round(ms);
  if (kind === 'request') {
    console.log(`[PERF] web request ${key}: ${rounded}ms${status ? ` status=${status}` : ''}`);
  } else {
    console.log(`[PERF] web query ${key}: ${rounded}ms`);
  }

  const threshold = kind === 'request' ? slowRequestThresholdMs() : slowQueryThresholdMs();
  if (rounded >= threshold) {
    pushSlowEvent(kind, key, rounded, status);
    void notifySlowMetric(kind, key, rounded, status);
  }
}

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = now();
  try {
    return await fn();
  } finally {
    trackMetric('query', label, now() - start);
  }
}

export function startRequestTimer(label: string): (status?: number) => void {
  if (!ENABLED) return () => {};
  const start = now();
  return (status?: number) => {
    trackMetric('request', label, now() - start, status);
  };
}

export function recordRequestMetric(label: string, ms: number, status?: number) {
  trackMetric('request', label, ms, status);
}

export function getPerfSnapshot() {
  const store = getStore();
  const metrics = Array.from(store.metrics.values())
    .map<PerfMetricSummary>((bucket) => ({
      key: bucket.key,
      kind: bucket.kind,
      count: bucket.count,
      errorCount: bucket.errorCount,
      totalMs: Math.round(bucket.totalMs),
      avgMs: Math.round(bucket.totalMs / bucket.count),
      maxMs: Math.round(bucket.maxMs),
      lastMs: Math.round(bucket.lastMs),
      lastStatus: bucket.lastStatus,
      lastSeenAt: new Date(bucket.lastSeenAt).toISOString(),
    }))
    .sort((a, b) => b.avgMs - a.avgMs);

  return {
    enabled: ENABLED,
    startedAt: new Date(store.startedAt).toISOString(),
    uptimeSeconds: Math.round((epochNow() - store.startedAt) / 1000),
    thresholds: {
      slowRequestMs: slowRequestThresholdMs(),
      slowQueryMs: slowQueryThresholdMs(),
    },
    totals: {
      metrics: metrics.length,
      requestsTracked: metrics
        .filter((metric) => metric.kind === 'request')
        .reduce((sum, metric) => sum + metric.count, 0),
      queriesTracked: metrics
        .filter((metric) => metric.kind === 'query')
        .reduce((sum, metric) => sum + metric.count, 0),
    },
    hottestRequests: metrics.filter((metric) => metric.kind === 'request').slice(0, 10),
    hottestQueries: metrics.filter((metric) => metric.kind === 'query').slice(0, 10),
    recentSlowEvents: store.slowEvents.map((event) => ({
      ...event,
      at: new Date(event.at).toISOString(),
    })),
  };
}

export function isPerfRequestAuthorized(request: Request): boolean {
  const token = perfAdminToken();
  if (!token) return true;

  const url = new URL(request.url);
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return bearer === token || url.searchParams.get('token') === token;
}
