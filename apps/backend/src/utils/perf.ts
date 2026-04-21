type MetricKind = 'request';

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

interface PerfStore {
  startedAt: number;
  metrics: Map<string, PerfMetricBucket>;
  slowEvents: PerfEvent[];
  alertCooldowns: Map<string, number>;
}

const MAX_SLOW_EVENTS = 50;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

function perfEnabled(): boolean {
  return process.env.PERF_LOG !== '0';
}

function slowRequestThresholdMs(): number {
  return Number(process.env.PERF_SLOW_REQUEST_MS ?? '800') || 800;
}

function perfWebhookUrl(): string {
  return (process.env.PERF_WEBHOOK_URL ?? '').trim();
}

function perfAdminToken(): string {
  return (process.env.PERF_ADMIN_TOKEN ?? '').trim();
}

function getStore(): PerfStore {
  const globalPerf = globalThis as typeof globalThis & { __YOMIRU_BACKEND_PERF__?: PerfStore };
  if (!globalPerf.__YOMIRU_BACKEND_PERF__) {
    globalPerf.__YOMIRU_BACKEND_PERF__ = {
      startedAt: Date.now(),
      metrics: new Map(),
      slowEvents: [],
      alertCooldowns: new Map(),
    };
  }
  return globalPerf.__YOMIRU_BACKEND_PERF__;
}

async function notifySlowMetric(key: string, ms: number, status?: number) {
  const webhookUrl = perfWebhookUrl();
  if (!webhookUrl) return;

  const store = getStore();
  const lastAlertAt = store.alertCooldowns.get(key) ?? 0;
  const currentTime = Date.now();
  if (currentTime - lastAlertAt < ALERT_COOLDOWN_MS) return;
  store.alertCooldowns.set(key, currentTime);

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Yomiru Perf',
        content: `Lenta en backend: \`${key}\` tardó ${ms}ms${status ? ` (status ${status})` : ''}.`,
      }),
    });
  } catch {
    // No bloquear requests por fallas de alerta.
  }
}

export function recordBackendRequestMetric(label: string, ms: number, status?: number) {
  if (!perfEnabled()) return;

  const store = getStore();
  const bucket = store.metrics.get(label) ?? {
    key: label,
    kind: 'request' as const,
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
  bucket.lastSeenAt = Date.now();
  if ((status ?? 200) >= 400) bucket.errorCount += 1;

  store.metrics.set(label, bucket);

  const rounded = Math.round(ms);
  console.log(`[PERF] backend request ${label}: ${rounded}ms${status ? ` status=${status}` : ''}`);
  if (rounded >= slowRequestThresholdMs()) {
    store.slowEvents.unshift({
      kind: 'request',
      key: label,
      ms: rounded,
      status,
      at: Date.now(),
    });
    if (store.slowEvents.length > MAX_SLOW_EVENTS) {
      store.slowEvents.length = MAX_SLOW_EVENTS;
    }
    void notifySlowMetric(label, rounded, status);
  }
}

export function getBackendPerfSnapshot() {
  const store = getStore();
  const metrics = Array.from(store.metrics.values())
    .map((bucket) => ({
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
    enabled: perfEnabled(),
    startedAt: new Date(store.startedAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - store.startedAt) / 1000),
    thresholds: {
      slowRequestMs: slowRequestThresholdMs(),
    },
    totals: {
      metrics: metrics.length,
      requestsTracked: metrics.reduce((sum, metric) => sum + metric.count, 0),
    },
    hottestRequests: metrics.slice(0, 15),
    recentSlowEvents: store.slowEvents.map((event) => ({
      ...event,
      at: new Date(event.at).toISOString(),
    })),
  };
}

export function isPerfRequestAuthorized(request: { url: string; headers: { authorization?: string } | Record<string, unknown> }): boolean {
  const token = perfAdminToken();
  if (!token) return true;

  const url = new URL(request.url, 'http://localhost');
  const rawAuthorization =
    typeof (request.headers as { authorization?: string }).authorization === 'string'
      ? (request.headers as { authorization?: string }).authorization
      : undefined;
  const bearer = rawAuthorization?.replace(/^Bearer\s+/i, '').trim();
  return bearer === token || url.searchParams.get('token') === token;
}
