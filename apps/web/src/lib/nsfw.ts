import type { AstroCookies } from 'astro';

export const NSFW_COOKIE = 'yomiru_nsfw';

export function readShowAdult(_cookies: AstroCookies): boolean {
  return true;
}
