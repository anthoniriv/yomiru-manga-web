import type { APIRoute } from 'astro';
import { ADMIN_COOKIE, getAdminSecret } from '../../../lib/admin';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const secret = getAdminSecret();
  if (!secret) return new Response('ADMIN_SECRET not configured', { status: 500 });

  const form = await request.formData().catch(() => null);
  const pw = (form?.get('password') as string | null)?.trim() ?? '';
  const redirectTo = (form?.get('redirect') as string | null) ?? '/';

  if (pw !== secret) {
    return redirect(`/admin?error=1&redirect=${encodeURIComponent(redirectTo)}`, 303);
  }

  cookies.set(ADMIN_COOKIE, secret, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: 'lax',
  });
  return redirect(redirectTo, 303);
};
