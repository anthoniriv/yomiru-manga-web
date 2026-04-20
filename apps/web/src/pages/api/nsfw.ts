import type { APIRoute } from 'astro';
import { getSafeRedirectPath } from '../../lib/redirect';

const COOKIE = 'yomiru_nsfw';
const MAX_AGE = 60 * 60 * 24 * 365;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData().catch(() => null);
  const nextEnabled = form?.get('enabled') === '1';
  const redirectTo = getSafeRedirectPath(form?.get('redirect'));

  cookies.set(COOKIE, nextEnabled ? '1' : '0', {
    path: '/',
    maxAge: MAX_AGE,
    httpOnly: false,
    sameSite: 'lax',
  });

  const response = redirect(redirectTo, 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
