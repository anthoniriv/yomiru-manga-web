import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin';
import { getSafeRedirectPath, addSearchParam } from '../../../../lib/redirect';
import { enqueueMirrorJob } from '../../../../lib/ingest';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isAdmin(cookies)) return new Response('forbidden', { status: 403 });

  const form = await request.formData();
  const redirectTo = getSafeRedirectPath(form.get('redirect'), '/admin');
  const limit = Math.max(1, Math.min(200, Number.parseInt(String(form.get('limit') ?? '50'), 10) || 50));

  try {
    await enqueueMirrorJob({ limit, retryFailed: form.get('retry_failed') === '1', jobId: `mirror-${Date.now()}` });
    return redirect(addSearchParam(redirectTo, 'ingest', 'mirror_queued'), 303);
  } catch {
    return redirect(addSearchParam(redirectTo, 'ingest', 'queue_error'), 303);
  }
};
