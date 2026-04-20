import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (!code) {
    return redirect(`/login?error=unknown`, 303);
  }

  const sb = createSupabaseServer(request, cookies);
  const { error } = await sb.auth.exchangeCodeForSession(code);

  if (error) {
    return redirect(`/login?error=unknown`, 303);
  }

  return redirect(`/login?info=verified&redirect=${encodeURIComponent(next)}`, 303);
};
