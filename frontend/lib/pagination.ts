// frontend/lib/pagination.ts
export function parsePage(input?: string): number {
  const n = Number.parseInt(input ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
