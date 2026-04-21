import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

function isResponseAlreadySentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ResponseSentError' ||
    error.message.toLowerCase().includes('response has already been sent')
  );
}

function env(): { url: string; anonKey: string } {
  const url =
    process.env.PUBLIC_SUPABASE_URL ??
    (globalThis as any).__ENV__?.PUBLIC_SUPABASE_URL ??
    import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.PUBLIC_SUPABASE_ANON_KEY ??
    (globalThis as any).__ENV__?.PUBLIC_SUPABASE_ANON_KEY ??
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase env vars missing: PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY');
  return { url, anonKey };
}

export function createSupabaseServer(
  request: Request,
  cookies: AstroCookies,
  options: { persistCookies?: boolean } = {},
) {
  const { url, anonKey } = env();
  const persistCookies = options.persistCookies ?? true;
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        if (!persistCookies) return;
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookies.set(name, value, { ...options, path: options?.path ?? '/' });
          } catch (error) {
            if (!isResponseAlreadySentError(error)) throw error;
          }
        });
      },
    },
  });
}

export async function getUser(request: Request, cookies: AstroCookies) {
  const sb = createSupabaseServer(request, cookies, { persistCookies: false });
  const { data: { user } } = await sb.auth.getUser();
  return { supabase: sb, user };
}
