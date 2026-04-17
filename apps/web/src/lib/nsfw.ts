import type { AstroCookies } from 'astro';

export const NSFW_COOKIE = 'yomiru_nsfw';

export function readShowAdult(cookies: AstroCookies): boolean {
  return cookies.get(NSFW_COOKIE)?.value === '1';
}
