import { supabase } from './supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function isHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

function resolveExpoHostApiUrl(): string | null {
  const defaultPort = process.env.EXPO_PUBLIC_API_PORT || '3001';
  const hostUri =
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri ||
    ((Constants as any).manifest2?.extra?.expoGo?.debuggerHost as string | undefined) ||
    ((Constants as any).manifest?.debuggerHost as string | undefined);

  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) {
      return normalizeBaseUrl(`http://${host}:${defaultPort}`);
    }
  }

  return null;
}

function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return normalizeBaseUrl(envUrl);
  }
  if (IS_DEV) {
    return normalizeBaseUrl(
      resolveExpoHostApiUrl() || `http://localhost:${process.env.EXPO_PUBLIC_API_PORT || '3001'}`,
    );
  }
  return '';
}

let activeApiUrl = resolveApiUrl();

function uniqueUrls(urls: (string | null | undefined)[]): string[] {
  return Array.from(new Set(urls.filter((u): u is string => !!u)));
}

function getCandidateApiUrls(): string[] {
  const defaultPort = process.env.EXPO_PUBLIC_API_PORT || '3001';
  const candidates = uniqueUrls([
    activeApiUrl,
    process.env.EXPO_PUBLIC_API_URL,
    IS_DEV ? resolveExpoHostApiUrl() : null,
    IS_DEV && Platform.OS === 'web' ? `http://localhost:${defaultPort}` : null,
  ]).map((url) => normalizeBaseUrl(url));

  if (IS_DEV) {
    return candidates;
  }

  return candidates.filter((url) => isHttpsUrl(url));
}

export function getApiUrl(): string {
  return activeApiUrl;
}

export function getReaderImageProxyUrl(imageUrl: string): string {
  if (/^data:/i.test(imageUrl)) {
    return imageUrl;
  }
  if (!/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }
  if (!activeApiUrl) {
    return imageUrl;
  }
  return `${activeApiUrl}/api/reader/image?url=${encodeURIComponent(imageUrl)}`;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

async function parseJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid server response (${response.status})`);
  }
}

async function requestWithFallback<T>(
  path: string,
  init: Omit<RequestInit, 'method'> & { method: 'GET' | 'POST' },
): Promise<T> {
  const candidates = getCandidateApiUrls();
  if (candidates.length === 0) {
    throw new Error(
      IS_DEV
        ? 'Backend URL is not configured.'
        : 'Missing secure backend URL. Set EXPO_PUBLIC_API_URL to an https:// endpoint.',
    );
  }
  const networkErrors: string[] = [];

  for (const baseUrl of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });

      const data = await parseJsonResponse(response);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || data?.details || `Request failed (${response.status})`);
      }

      activeApiUrl = baseUrl;
      return data.data as T;
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const isNetwork = error instanceof TypeError;
      if (isAbort || isNetwork) {
        networkErrors.push(`${baseUrl} (${isAbort ? 'timeout' : 'network'})`);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Backend unreachable. Tried: ${networkErrors.join(', ')}`);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  return requestWithFallback<T>(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders();
  return requestWithFallback<T>(path, {
    method: 'GET',
    headers,
  });
}
