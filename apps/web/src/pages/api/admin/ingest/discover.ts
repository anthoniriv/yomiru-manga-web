import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin';
import { getSafeRedirectPath, addSearchParam } from '../../../../lib/redirect';
import { enqueueDiscoverJob } from '../../../../lib/ingest';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const form = await request.formData();
  const redirectTo = getSafeRedirectPath(form.get('redirect'), '/admin');
  const url = String(form.get('url') ?? '').trim();
  const kind = String(form.get('kind') ?? 'manga') === 'book' ? 'book' : 'manga';
  const watchUpdates = form.get('watch_updates') === '1';
  const autoDownload = form.get('auto_download') === '1';
  const checkIntervalMinutes = Math.max(
    5,
    Math.min(720, Number.parseInt(String(form.get('check_interval_minutes') ?? '30'), 10) || 30),
  );

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return redirect(addSearchParam(redirectTo, 'ingest', 'invalid_url'), 303);
  }

  try {
    await enqueueDiscoverJob({
      url,
      kind,
      forceResync: false,
      watchUpdates,
      autoDownload,
      checkIntervalMinutes,
      jobId: `add-${Date.now()}`,
    });
    return redirect(addSearchParam(redirectTo, 'ingest', 'queued'), 303);
  } catch {
    return redirect(addSearchParam(redirectTo, 'ingest', 'queue_error'), 303);
  }
};
