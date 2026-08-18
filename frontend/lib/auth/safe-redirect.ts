export function getSafeRedirect(
  raw: string | string[] | null | undefined
): string {
  if (Array.isArray(raw)) return '';
  if (!raw) return '';

  if (raw.includes('\\')) return '';

  if (!raw.startsWith('/')) return '';
  if (raw.startsWith('//')) return '';
  if (raw.includes('://')) return '';

  try {
    const appOrigin = new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://devlovers.net'
    ).origin;
    const redirectUrl = new URL(raw, appOrigin);

    if (redirectUrl.origin !== appOrigin) return '';

    return raw;
  } catch {
    return '';
  }
}
