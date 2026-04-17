import type { APIRoute } from 'astro';

const COOKIE = 'yomiru_nsfw';
const MAX_AGE = 60 * 60 * 24 * 365;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData().catch(() => null);
  const nextEnabled = form?.get('enabled') === '1';
  const redirectTo = (form?.get('redirect') as string | null) ?? '/';

  cookies.set(COOKIE, nextEnabled ? '1' : '0', {
    path: '/',
    maxAge: MAX_AGE,
    httpOnly: false,
    sameSite: 'lax',
  });

  return redirect(redirectTo, 303);
};
