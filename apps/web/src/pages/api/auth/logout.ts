import type { APIRoute } from 'astro';
import { getSafeRedirectPath } from '../../../lib/redirect';
import { createSupabaseServer } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const sb = createSupabaseServer(request, cookies);
  await sb.auth.signOut();
  const form = await request.formData().catch(() => null);
  const redirectTo = getSafeRedirectPath(form?.get('redirect'));
  return redirect(redirectTo, 303);
};
