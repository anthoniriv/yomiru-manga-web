import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

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
) {
  const { url, anonKey } = env();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, { ...options, path: options?.path ?? '/' });
        });
      },
    },
  });
}

export async function getUser(request: Request, cookies: AstroCookies) {
  const sb = createSupabaseServer(request, cookies);
  const { data: { user } } = await sb.auth.getUser();
  return { supabase: sb, user };
}
