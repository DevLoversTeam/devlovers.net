export const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'received',
  'refunded',
] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];

const RETURN_ALLOWED_FROM: Record<ReturnStatus, readonly ReturnStatus[]> = {
  requested: [],
  approved: ['requested'],
  rejected: ['requested'],
  received: ['approved'],
  refunded: ['received'],
};
Object.values(RETURN_ALLOWED_FROM).forEach(arr => {
  Object.freeze(arr);
});
Object.freeze(RETURN_ALLOWED_FROM);

export function allowedFromReturnStatus(
  to: ReturnStatus,
  options?: { includeSame?: boolean }
): readonly ReturnStatus[] {
  const from = RETURN_ALLOWED_FROM[to];
  if (!options?.includeSame) return from;
  return Array.from(new Set([...from, to]));
}

export function isReturnStatusTransitionAllowed(
  from: string | null | undefined,
  to: ReturnStatus,
  options?: { includeSame?: boolean }
): boolean {
  if (!from) return false;
  const allowed = allowedFromReturnStatus(to, options);
  return allowed.includes(from as ReturnStatus);
}

export const __returnTransitionMatrix = RETURN_ALLOWED_FROM;

