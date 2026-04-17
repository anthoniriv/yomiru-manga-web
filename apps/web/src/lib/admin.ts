import type { AstroCookies } from 'astro';

export const ADMIN_COOKIE = 'yomiru_admin';

export function getAdminSecret(): string | null {
  const s = process.env.ADMIN_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}

export function isAdmin(cookies: AstroCookies): boolean {
  const secret = getAdminSecret();
  if (!secret) return false;
  return cookies.get(ADMIN_COOKIE)?.value === secret;
}
