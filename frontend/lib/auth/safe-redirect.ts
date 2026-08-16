export function getSafeRedirect(
  raw: string | string[] | null | undefined
): string {
  if (Array.isArray(raw)) return '';
  if (!raw) return '';

  if (raw.includes('\\')) return '';

  if (!raw.startsWith('/')) return '';
  if (raw.startsWith('//')) return '';
  if (raw.includes('://')) return '';

  return raw;
}
