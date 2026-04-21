import type { APIRoute } from 'astro';
import { addSearchParam, getSafeRedirectPath } from '../../lib/redirect';
import { deliverContactSubmission, validateContactSubmission } from '../../lib/contact';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData().catch(() => null);
  const redirectTo = getSafeRedirectPath(form?.get('redirect'), '/contacto');

  if (!form) {
    return redirect(addSearchParam(redirectTo, 'status', 'invalid'), 303);
  }

  if (String(form.get('company') ?? '').trim()) {
    return redirect(addSearchParam(redirectTo, 'status', 'ok'), 303);
  }

  const validation = validateContactSubmission({
    kind: String(form.get('kind') ?? ''),
    name: String(form.get('name') ?? ''),
    email: String(form.get('email') ?? ''),
    subject: String(form.get('subject') ?? ''),
    mangaTitle: String(form.get('manga_title') ?? ''),
    chapterRef: String(form.get('chapter_ref') ?? ''),
    sourceUrl: String(form.get('source_url') ?? ''),
    message: String(form.get('message') ?? ''),
    pageUrl: String(form.get('page_url') ?? ''),
  });

  if (!validation.ok) {
    return redirect(
      addSearchParam(addSearchParam(redirectTo, 'status', 'invalid'), 'reason', validation.error),
      303,
    );
  }

  try {
    await deliverContactSubmission(validation.data);
    return redirect(addSearchParam(redirectTo, 'status', 'ok'), 303);
  } catch (error) {
    console.error('[contact] delivery failed', error);
    return redirect(addSearchParam(redirectTo, 'status', 'delivery_error'), 303);
  }
};
