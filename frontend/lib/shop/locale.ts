export function localeToCountry(input: string | null | undefined): string | null {
  const locale = (input ?? '').trim().toLowerCase();
  if (!locale) return null;

  const primary = locale.split(/[-_]/)[0]?.toLowerCase() ?? '';
  if (primary === 'uk') return 'UA';

  return null;
}