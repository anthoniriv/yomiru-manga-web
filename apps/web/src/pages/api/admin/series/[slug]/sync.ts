import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../../lib/admin';
import { getSafeRedirectPath, addSearchParam } from '../../../../../lib/redirect';
import { getSeriesMonitorSettingsBySlug } from '../../../../../lib/db';
import { enqueueDiscoverJob, enqueueMirrorJob } from '../../../../../lib/ingest';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const slug = params.slug;
  if (!slug) return new Response('missing slug', { status: 400 });

  const form = await request.formData();
  const redirectTo = getSafeRedirectPath(form.get('redirect'), `/manga/${slug}`);
  const action = String(form.get('action') ?? 'sync');
  const series = await getSeriesMonitorSettingsBySlug(slug);

  if (!series) {
    return redirect(addSearchParam(redirectTo, 'monitor', 'missing'), 303);
  }

  try {
    if (action === 'mirror') {
      await enqueueMirrorJob({ limit: 50, retryFailed: true, jobId: `mirror-${Date.now()}` });
    } else {
      await enqueueDiscoverJob({
        url: series.sourceUrl,
        kind: series.kind,
        forceResync: true,
        jobId: `sync-${series.id}-${Date.now()}`,
      });
    }
    return redirect(addSearchParam(redirectTo, 'monitor', 'queued'), 303);
  } catch {
    return redirect(addSearchParam(redirectTo, 'monitor', 'queue_error'), 303);
  }
};
