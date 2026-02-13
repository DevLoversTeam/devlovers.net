export function buildStripeAttemptIdempotencyKey(
  provider: 'stripe',
  orderId: string,
  attemptNo: number
): string {
  return `pi:${provider}:${orderId}:${attemptNo}`;
}

export function buildMonobankAttemptIdempotencyKey(
  orderId: string,
  attemptNo: number
): string {
  return `mono:${orderId}:${attemptNo}`;
}
