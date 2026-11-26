export function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}
