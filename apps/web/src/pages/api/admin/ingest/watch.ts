import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin';
import { getSafeRedirectPath, addSearchParam } from '../../../../lib/redirect';
import { getWatchedSeriesForAdmin, updateSeriesMonitorSettings } from '../../../../lib/db';
import { enqueueDiscoverJob } from '../../../../lib/ingest';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const form = await request.formData();
  const redirectTo = getSafeRedirectPath(form.get('redirect'), '/admin');
  const limit = Math.max(1, Math.min(100, Number.parseInt(String(form.get('limit') ?? '20'), 10) || 20));
  const watched = await getWatchedSeriesForAdmin(limit);

  try {
    for (const item of watched) {
      await updateSeriesMonitorSettings(item.slug, { lastCheckedAt: new Date() });
      await enqueueDiscoverJob({
        url: item.sourceUrl,
        kind: item.kind,
        forceResync: true,
        jobId: `watch-${item.id}-${Date.now()}`,
      });
    }
    return redirect(addSearchParam(addSearchParam(redirectTo, 'ingest', 'watch_queued'), 'count', String(watched.length)), 303);
  } catch {
    return redirect(addSearchParam(redirectTo, 'ingest', 'queue_error'), 303);
  }
};
