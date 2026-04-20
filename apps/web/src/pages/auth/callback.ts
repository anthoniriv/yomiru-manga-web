import type { APIRoute } from 'astro';
import { getSafeRedirectPath } from '../../lib/redirect';
import { createSupabaseServer } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const code = url.searchParams.get('code');
  const next = getSafeRedirectPath(url.searchParams.get('next'));
  const flow = url.searchParams.get('flow');

  if (!code) {
    return redirect(flow === 'recovery' ? '/recuperar?error=invalid_link' : '/login?error=unknown', 303);
  }

  const sb = createSupabaseServer(request, cookies);
  const { error } = await sb.auth.exchangeCodeForSession(code);

  if (error) {
    return redirect(flow === 'recovery' ? '/recuperar?error=invalid_link' : '/login?error=unknown', 303);
  }

  if (flow === 'recovery') {
    return redirect(next, 303);
  }

  return redirect(`/login?info=verified&redirect=${encodeURIComponent(next)}`, 303);
};
