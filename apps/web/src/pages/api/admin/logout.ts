import type { APIRoute } from 'astro';
import { ADMIN_COOKIE } from '../../../lib/admin';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete(ADMIN_COOKIE, { path: '/' });
  return redirect('/', 303);
};
