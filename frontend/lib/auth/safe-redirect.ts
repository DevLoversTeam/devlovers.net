export function getSafeRedirect(raw: string | null | undefined): string {
  if (!raw) return '';

  if (raw.includes('\\')) return '';

  if (!raw.startsWith('/')) return '';
  if (raw.startsWith('//')) return '';
  if (raw.includes('://')) return '';

  return raw;
}
