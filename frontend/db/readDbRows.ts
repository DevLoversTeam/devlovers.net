export function readDbRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];

  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export function readOptionalDbRows<T>(result: unknown): T[] {
  return result == null ? [] : readDbRows<T>(result);
}
