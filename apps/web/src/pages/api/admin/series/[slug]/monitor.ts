import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../../lib/admin';
import { addSearchParam, getSafeRedirectPath } from '../../../../../lib/redirect';
import { updateSeriesMonitorSettings } from '../../../../../lib/db';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const slug = params.slug;
  if (!slug) return new Response('missing slug', { status: 400 });

  const form = await request.formData();
  const redirectTo = getSafeRedirectPath(form.get('redirect'), `/manga/${slug}`);
  const watchUpdates = form.get('watch_updates') === '1';
  const autoDownload = form.get('auto_download') === '1';
  const checkIntervalMinutes = Math.max(
    5,
    Math.min(720, Number.parseInt(String(form.get('check_interval_minutes') ?? '30'), 10) || 30),
  );

  await updateSeriesMonitorSettings(slug, {
    watchUpdates,
    autoDownload,
    checkIntervalMinutes,
  });

  return redirect(addSearchParam(redirectTo, 'monitor', 'ok'), 303);
};
