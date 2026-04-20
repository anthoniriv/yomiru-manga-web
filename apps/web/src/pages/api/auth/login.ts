import type { APIRoute } from 'astro';
import { getSafeRedirectPath } from '../../../lib/redirect';
import { createSupabaseServer } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const redirectTo = getSafeRedirectPath(form.get('redirect'));

  if (!email || !password) {
    return redirect(`/login?redirect=${encodeURIComponent(redirectTo)}&error=unknown`, 303);
  }

  const sb = createSupabaseServer(request, cookies);
  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    const msg = error.message.toLowerCase();
    const code = msg.includes('invalid') ? 'invalid_credentials'
      : msg.includes('not confirmed') ? 'email_not_confirmed'
      : 'unknown';
    return redirect(`/login?redirect=${encodeURIComponent(redirectTo)}&error=${code}`, 303);
  }

  return redirect(redirectTo, 303);
};
