import http from 'node:http';
import https from 'node:https';

const DNS_FALLBACK_TIMEOUT_MS = 12000;
const DNS_FALLBACK_REDIRECT_LIMIT = 5;

interface RawResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export async function fetchTextWithDnsFallback(
  url: string,
  init: RequestInit = {},
): Promise<string> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    if (!isDnsResolutionError(error)) {
      throw error;
    }
  }

  const response = await requestViaDoh(url, init, DNS_FALLBACK_REDIRECT_LIMIT);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP ${response.statusCode} while requesting ${url}`);
  }

  return response.body;
}

export async function fetchJsonWithDnsFallback<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const text = await fetchTextWithDnsFallback(url, init);
  return JSON.parse(text) as T;
}

function isDnsResolutionError(error: unknown): boolean {
  if (!error) return false;
  const err = error as Error & {
    code?: string;
    cause?: { code?: string; message?: string };
  };
  const message = String(err.message || error);
  const causeMessage = String(err.cause?.message || '');
  const code = String(err.code || '');
  const causeCode = String(err.cause?.code || '');

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN') {
    return true;
  }

  return (
    message.includes('ENOTFOUND') ||
    message.includes('EAI_AGAIN') ||
    message.includes('ERR_NAME_NOT_RESOLVED') ||
    message.includes('Could not resolve host') ||
    causeMessage.includes('ENOTFOUND') ||
    causeMessage.includes('EAI_AGAIN')
  );
}

async function requestViaDoh(
  rawUrl: string,
  init: RequestInit,
  redirectsRemaining: number,
): Promise<RawResponse> {
  if (redirectsRemaining < 0) {
    throw new Error(`Too many redirects while requesting ${rawUrl}`);
  }

  const url = new URL(rawUrl);
  const method = normalizeMethod(init.method);
  const headers = normalizeHeaders(init.headers);
  const addresses = await resolveARecords(url.hostname);

  if (addresses.length === 0) {
    throw new Error(`DNS fallback could not resolve host: ${url.hostname}`);
  }

  let lastError: Error | null = null;
  for (const address of addresses) {
    try {
      const response = await requestByIp(url, address, method, headers);
      const location = response.headers.location;
      if (isRedirect(response.statusCode) && typeof location === 'string' && location.trim()) {
        const redirected = new URL(location, url).toString();
        return requestViaDoh(redirected, { ...init, method }, redirectsRemaining - 1);
      }
      return response;
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError || new Error(`DNS fallback failed for ${rawUrl}`);
}

function requestByIp(
  url: URL,
  ip: string,
  method: string,
  headers: Record<string, string>,
): Promise<RawResponse> {
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;
  const requestHeaders = {
    ...headers,
    Host: url.host,
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        host: ip,
        port: isHttps ? 443 : 80,
        method,
        path: `${url.pathname}${url.search}`,
        headers: requestHeaders,
        timeout: DNS_FALLBACK_TIMEOUT_MS,
        ...(isHttps ? { servername: url.hostname } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timed out requesting ${url.toString()} via ${ip}`));
    });
    req.end();
  });
}

function normalizeMethod(method: string | undefined): string {
  return (method || 'GET').toUpperCase();
}

function normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
  if (!headers) return {};

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}

function isRedirect(statusCode: number): boolean {
  return statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308;
}

async function resolveARecords(hostname: string): Promise<string[]> {
  const unique = new Set<string>();

  const cloudflareRecords = await resolveFromCloudflare(hostname);
  for (const address of cloudflareRecords) unique.add(address);

  const googleRecords = await resolveFromGoogle(hostname);
  for (const address of googleRecords) unique.add(address);

  return Array.from(unique);
}

async function resolveFromCloudflare(hostname: string): Promise<string[]> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
    const response = await fetch(url, {
      headers: { accept: 'application/dns-json' },
    });
    if (!response.ok) return [];

    const payload = await response.json() as {
      Answer?: Array<{ type?: number; data?: string }>;
    };
    return extractARecords(payload.Answer);
  } catch {
    return [];
  }
}

async function resolveFromGoogle(hostname: string): Promise<string[]> {
  try {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const payload = await response.json() as {
      Answer?: Array<{ type?: number; data?: string }>;
    };
    return extractARecords(payload.Answer);
  } catch {
    return [];
  }
}

function extractARecords(
  answers: Array<{ type?: number; data?: string }> | undefined,
): string[] {
  if (!answers || answers.length === 0) return [];
  return answers
    .filter((entry) => entry.type === 1 && typeof entry.data === 'string')
    .map((entry) => entry.data as string);
}
