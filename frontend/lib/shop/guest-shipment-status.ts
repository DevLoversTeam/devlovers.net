type TranslationFn = (key: string) => string;

export function formatGuestShipmentStatus(
  value: string | null | undefined,
  t: TranslationFn
): string | null {
  const resolve = (key: string, fallback: string) => {
    try {
      return t(key);
    } catch {
      return fallback;
    }
  };

  switch (value) {
    case 'queued':
      return resolve('shipmentStatuses.queued', 'Queued');
    case 'processing':
      return resolve('shipmentStatuses.processing', 'Processing');
    case 'succeeded':
      return resolve('shipmentStatuses.succeeded', 'Succeeded');
    case 'failed':
      return resolve('shipmentStatuses.failed', 'Failed');
    case 'needs_attention':
      return resolve('shipmentStatuses.needsAttention', 'Needs attention');
    default:
      return null;
  }
}
