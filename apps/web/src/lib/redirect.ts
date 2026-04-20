export function getSafeRedirectPath(value: FormDataEntryValue | string | null | undefined, fallback = '/'): string {
  if (typeof value !== 'string') return fallback;

  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;

  try {
    const url = new URL(path, 'https://yomiru.local');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
