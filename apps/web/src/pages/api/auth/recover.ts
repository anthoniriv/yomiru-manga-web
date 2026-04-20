import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  if (!email) return redirect('/recuperar?error=1', 303);

  const sb = createSupabaseServer(request, cookies);
  const recoveryUrl = new URL('/auth/callback', url.origin);
  recoveryUrl.searchParams.set('flow', 'recovery');
  recoveryUrl.searchParams.set('next', '/restablecer');

  // Ignore result — always return same response to avoid email enumeration
  await sb.auth.resetPasswordForEmail(email, { redirectTo: recoveryUrl.toString() });
  return redirect('/recuperar?sent=1', 303);
};
