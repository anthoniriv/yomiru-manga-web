import type { APIRoute } from 'astro';
import { getSafeRedirectPath } from '../../lib/redirect';

const COOKIE = 'yomiru_nsfw';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData().catch(() => null);
  const redirectTo = getSafeRedirectPath(form?.get('redirect'));

  cookies.set(COOKIE, '', {
    path: '/',
    maxAge: 0,
    httpOnly: false,
    sameSite: 'lax',
  });

  const response = redirect(redirectTo, 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
