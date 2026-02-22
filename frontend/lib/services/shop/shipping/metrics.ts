import 'server-only';

import { logInfo } from '@/lib/logging';

import { sanitizeShippingLogMeta } from '@/lib/services/shop/shipping/log-sanitizer';

export type ShippingMetricName =
  | 'queued'
  | 'succeeded'
  | 'failed'
  | 'needs_attention'
  | 'retries';

export type ShippingMetricSource =
  | 'stripe_webhook'
  | 'monobank_webhook'
  | 'shipments_worker'
  | 'admin_action'
  | 'retention_job';

export function recordShippingMetric(args: {
  name: ShippingMetricName;
  source: ShippingMetricSource;
  count?: number;
  orderId?: string;
  shipmentId?: string;
  runId?: string;
  requestId?: string;
  code?: string;
}) {
  const count =
    typeof args.count === 'number' && Number.isFinite(args.count)
      ? Math.max(0, Math.trunc(args.count))
      : 1;

  logInfo(
    'shop_shipping_metric',
    sanitizeShippingLogMeta({
      metric: 'shop_shipping',
      name: args.name,
      source: args.source,
      count,
      orderId: args.orderId,
      shipmentId: args.shipmentId,
      runId: args.runId,
      requestId: args.requestId,
      code: args.code,
    })
  );
}
