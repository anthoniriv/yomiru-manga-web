import type { APIRoute } from 'astro';
import { normalize } from 'node:path';
import { r2Get } from '@yomiru/r2';

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

function getMime(key: string): string {
  const ext = key.toLowerCase().match(/\.\w+$/)?.[0] ?? '';
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

export const GET: APIRoute = async ({ params, redirect }) => {
  const rawPath = (params.path as string | undefined) ?? '';
  const key = normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, '');
  if (!key || key === '.') return new Response('Not Found', { status: 404 });

  // If public URL configured, redirect to R2 CDN directly (faster, no proxy)
  if (R2_PUBLIC_URL) {
    return redirect(`${R2_PUBLIC_URL}/${key}`, 302);
  }

  // Fallback: proxy through R2 S3 API
  const stream = await r2Get(key);
  if (!stream) return new Response('Not Found', { status: 404 });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': getMime(key),
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
};
