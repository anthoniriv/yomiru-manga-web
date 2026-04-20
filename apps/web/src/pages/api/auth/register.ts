import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const redirectTo = String(form.get('redirect') ?? '/');

  if (!email || !password) {
    return redirect(`/registro?redirect=${encodeURIComponent(redirectTo)}&error=unknown`, 303);
  }

  const sb = createSupabaseServer(request, cookies);
  const emailRedirectTo = new URL('/auth/callback', url.origin);
  emailRedirectTo.searchParams.set('next', redirectTo);
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: emailRedirectTo.toString() },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    const code = msg.includes('already registered') || msg.includes('already exists') ? 'email_taken'
      : msg.includes('password') ? 'weak_password'
      : msg.includes('email') ? 'invalid_email'
      : 'unknown';
    return redirect(`/registro?redirect=${encodeURIComponent(redirectTo)}&error=${code}`, 303);
  }

  return redirect(`/login?info=verify&redirect=${encodeURIComponent(redirectTo)}`, 303);
};
