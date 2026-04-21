export type ContactKind = 'new_manga' | 'chapter_error' | 'manga_error' | 'general';

export interface ContactSubmission {
  kind: ContactKind;
  name: string;
  email: string;
  subject: string;
  mangaTitle: string;
  chapterRef: string;
  sourceUrl: string;
  message: string;
  pageUrl: string;
}

const KIND_LABELS: Record<ContactKind, string> = {
  new_manga: 'Solicitud de nuevo manga',
  chapter_error: 'Error de capítulo',
  manga_error: 'Error de manga/ficha',
  general: 'Consulta general',
};

function env(name: string): string {
  return (
    process.env[name] ??
    (globalThis as { __ENV__?: Record<string, string> }).__ENV__?.[name] ??
    ''
  ).trim();
}

export function getContactRecipient(): string {
  return env('CONTACT_EMAIL_TO') || 'contacto.onilabs@gmail.com';
}

function getContactSender(): string {
  return env('CONTACT_EMAIL_FROM') || 'Yomiru <contacto@onilabs.site>';
}

function getDiscordWebhookUrl(): string {
  return env('DISCORD_CONTACT_WEBHOOK_URL');
}

function getResendApiKey(): string {
  return env('RESEND_API_KEY');
}

export function validateContactSubmission(
  raw: Partial<Record<keyof ContactSubmission, string>>,
): { ok: true; data: ContactSubmission } | { ok: false; error: string } {
  const kind = (raw.kind ?? 'general') as ContactKind;
  const allowedKinds = new Set<ContactKind>([
    'new_manga',
    'chapter_error',
    'manga_error',
    'general',
  ]);
  if (!allowedKinds.has(kind)) {
    return { ok: false, error: 'invalid_kind' };
  }

  const name = String(raw.name ?? '').trim().slice(0, 120);
  const email = String(raw.email ?? '').trim().slice(0, 160);
  const subject = String(raw.subject ?? '').trim().slice(0, 160);
  const mangaTitle = String(raw.mangaTitle ?? '').trim().slice(0, 200);
  const chapterRef = String(raw.chapterRef ?? '').trim().slice(0, 120);
  const sourceUrl = String(raw.sourceUrl ?? '').trim().slice(0, 500);
  const message = String(raw.message ?? '').trim().slice(0, 5000);
  const pageUrl = String(raw.pageUrl ?? '').trim().slice(0, 500);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'invalid_email' };
  }

  if (!message || message.length < 12) {
    return { ok: false, error: 'message_too_short' };
  }

  if (!subject) {
    return { ok: false, error: 'missing_subject' };
  }

  if (kind === 'new_manga' && !mangaTitle && !sourceUrl) {
    return { ok: false, error: 'missing_manga_reference' };
  }

  return {
    ok: true,
    data: {
      kind,
      name,
      email,
      subject,
      mangaTitle,
      chapterRef,
      sourceUrl,
      message,
      pageUrl,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderField(label: string, value: string): string {
  if (!value) return '';
  return `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #27272a;color:#a1a1aa;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-top:1px solid #27272a;color:#fafafa;font-size:14px;line-height:1.6;">${escapeHtml(value)}</td>
    </tr>
  `;
}

function buildEmailHtml(submission: ContactSubmission): string {
  const kindLabel = KIND_LABELS[submission.kind];
  return `
    <div style="background:#09090b;padding:32px;font-family:Inter,Arial,sans-serif;color:#fafafa;">
      <div style="max-width:720px;margin:0 auto;border:1px solid #27272a;border-radius:20px;background:#111114;overflow:hidden;">
        <div style="padding:28px 28px 20px;background:linear-gradient(135deg,#18181b 0%,#0f0f12 100%);border-bottom:1px solid #27272a;">
          <div style="display:inline-flex;align-items:center;gap:12px;">
            <div style="width:44px;height:44px;border-radius:12px;background:#f97316;color:#09090b;font-size:26px;font-weight:900;display:flex;align-items:center;justify-content:center;">読</div>
            <div>
              <div style="color:#f97316;font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;">Contacto</div>
              <div style="margin-top:4px;font-size:28px;font-weight:900;line-height:1;">${escapeHtml(kindLabel)}</div>
            </div>
          </div>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 22px;color:#d4d4d8;font-size:15px;line-height:1.7;">
            Llegó una nueva solicitud desde la web. Aquí tienes el contexto completo para revisar el caso.
          </p>
          <table style="width:100%;border-collapse:collapse;">
            ${renderField('Tipo', kindLabel)}
            ${renderField('Asunto', submission.subject)}
            ${renderField('Nombre', submission.name || 'Anónimo')}
            ${renderField('Email', submission.email)}
            ${renderField('Manga', submission.mangaTitle)}
            ${renderField('Capítulo', submission.chapterRef)}
            ${renderField('URL reportada', submission.sourceUrl)}
            ${renderField('Página desde donde escribió', submission.pageUrl)}
          </table>
          <div style="margin-top:22px;border:1px solid #27272a;border-radius:16px;padding:18px 20px;background:#0b0b0e;">
            <div style="margin-bottom:8px;color:#a1a1aa;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Mensaje</div>
            <div style="white-space:pre-wrap;color:#fafafa;font-size:14px;line-height:1.7;">${escapeHtml(submission.message)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildEmailText(submission: ContactSubmission): string {
  const kindLabel = KIND_LABELS[submission.kind];
  return [
    `Tipo: ${kindLabel}`,
    `Asunto: ${submission.subject}`,
    `Nombre: ${submission.name || 'Anonimo'}`,
    `Email: ${submission.email}`,
    submission.mangaTitle ? `Manga: ${submission.mangaTitle}` : '',
    submission.chapterRef ? `Capitulo: ${submission.chapterRef}` : '',
    submission.sourceUrl ? `URL reportada: ${submission.sourceUrl}` : '',
    submission.pageUrl ? `Pagina: ${submission.pageUrl}` : '',
    '',
    'Mensaje:',
    submission.message,
  ]
    .filter(Boolean)
    .join('\n');
}

async function sendEmail(submission: ContactSubmission): Promise<void> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    throw new Error('missing_resend_api_key');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getContactSender(),
      to: [getContactRecipient()],
      reply_to: submission.email,
      subject: `[Yomiru] ${KIND_LABELS[submission.kind]} · ${submission.subject}`,
      html: buildEmailHtml(submission),
      text: buildEmailText(submission),
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`resend_failed:${response.status}:${details}`);
  }
}

async function sendDiscord(submission: ContactSubmission): Promise<void> {
  const webhookUrl = getDiscordWebhookUrl();
  if (!webhookUrl) {
    throw new Error('missing_discord_webhook');
  }

  const kindLabel = KIND_LABELS[submission.kind];
  const fields = [
    { name: 'Tipo', value: kindLabel, inline: true },
    { name: 'Email', value: submission.email, inline: true },
    { name: 'Nombre', value: submission.name || 'Anónimo', inline: true },
  ];

  if (submission.mangaTitle) {
    fields.push({ name: 'Manga', value: submission.mangaTitle.slice(0, 1024), inline: false });
  }
  if (submission.chapterRef) {
    fields.push({ name: 'Capítulo', value: submission.chapterRef.slice(0, 1024), inline: true });
  }
  if (submission.sourceUrl) {
    fields.push({ name: 'URL reportada', value: submission.sourceUrl.slice(0, 1024), inline: false });
  }
  if (submission.pageUrl) {
    fields.push({ name: 'Página', value: submission.pageUrl.slice(0, 1024), inline: false });
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Yomiru Contacto',
      embeds: [
        {
          title: `${kindLabel} · ${submission.subject}`,
          description: submission.message.slice(0, 4000),
          color: 0xf97316,
          fields,
          footer: {
            text: 'Nuevo reporte desde el formulario de contacto',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`discord_failed:${response.status}:${details}`);
  }
}

export async function deliverContactSubmission(submission: ContactSubmission): Promise<void> {
  await Promise.all([sendEmail(submission), sendDiscord(submission)]);
}

export function contactKindLabel(kind: ContactKind): string {
  return KIND_LABELS[kind];
}
