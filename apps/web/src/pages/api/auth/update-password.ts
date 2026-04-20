import type { APIRoute } from 'astro';
import { createSupabaseServer } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const confirmPassword = String(form.get('confirmPassword') ?? '');

  if (password.length < 6) {
    return redirect('/restablecer?error=weak_password', 303);
  }

  if (password !== confirmPassword) {
    return redirect('/restablecer?error=mismatch', 303);
  }

  const sb = createSupabaseServer(request, cookies);
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return redirect('/restablecer?error=invalid_link', 303);
  }

  const { error } = await sb.auth.updateUser({ password });

  if (error) {
    return redirect('/restablecer?error=unknown', 303);
  }

  await sb.auth.signOut();
  return redirect('/login?info=password_updated', 303);
};
