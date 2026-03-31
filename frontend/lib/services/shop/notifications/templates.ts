import 'server-only';

export const SHOP_NOTIFICATION_CHANNEL = 'email' as const;

export const shopNotificationTemplateKeys = [
  'intl_quote_requested',
  'intl_quote_offered',
  'intl_quote_accepted',
  'intl_quote_declined',
  'intl_quote_expired',
  'order_created',
  'order_shipped',
  'order_canceled',
  'order_returned',
  'payment_confirmed',
  'shipment_created',
  'refund_processed',
] as const;

export type ShopNotificationTemplateKey =
  (typeof shopNotificationTemplateKeys)[number];

export type RenderShopNotificationTemplateArgs = {
  templateKey: ShopNotificationTemplateKey;
  orderId: string;
  payload: Record<string, unknown>;
};

export type RenderedShopNotificationTemplate = {
  subject: string;
  text: string;
  html: string;
};

function toDisplayOrderId(orderId: string): string {
  const trimmed = orderId.trim();
  if (!trimmed) return 'unknown';
  return trimmed.length <= 12 ? trimmed : trimmed.slice(0, 12);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readCanonicalEventName(
  payload: Record<string, unknown>
): string | null {
  const raw = payload.canonicalEventName;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readCanonicalPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return asObject(payload.canonicalPayload);
}

function readCanonicalAmountMinor(
  payload: Record<string, unknown>
): number | null {
  const raw = payload.totalAmountMinor;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
    return null;
  }
  return raw;
}

function readCanonicalCurrency(
  payload: Record<string, unknown>
): string | null {
  const raw = payload.currency;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function readCanonicalPaymentStatus(
  payload: Record<string, unknown>
): string | null {
  const raw = payload.paymentStatus;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function formatCurrencyAmount(
  amountMinor: number,
  currency: string
): string | null {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amountMinor / 100);
  } catch {
    return null;
  }
}

export function renderShopNotificationTemplate(
  args: RenderShopNotificationTemplateArgs
): RenderedShopNotificationTemplate | null {
  const orderTag = toDisplayOrderId(args.orderId);
  const canonicalEvent = readCanonicalEventName(args.payload);
  const canonicalPayload = readCanonicalPayload(args.payload);

  let subject: string;
  let leadLine: string;

  switch (args.templateKey) {
    case 'intl_quote_requested':
      subject = `[DevLovers] Quote requested for order ${orderTag}`;
      leadLine = 'We received your international shipping quote request.';
      break;
    case 'intl_quote_offered':
      subject = `[DevLovers] Quote offered for order ${orderTag}`;
      leadLine = 'Your international shipping quote is now available.';
      break;
    case 'intl_quote_accepted':
      subject = `[DevLovers] Quote accepted for order ${orderTag}`;
      leadLine = 'Your international shipping quote has been accepted.';
      break;
    case 'intl_quote_declined':
      subject = `[DevLovers] Quote declined for order ${orderTag}`;
      leadLine = 'Your international shipping quote has been declined.';
      break;
    case 'intl_quote_expired':
      subject = `[DevLovers] Quote expired for order ${orderTag}`;
      leadLine = 'Your international shipping quote has expired.';
      break;
    case 'order_created':
      subject = `[DevLovers] Order received for order ${orderTag}`;
      leadLine = 'Your order has been created.';
      break;
    case 'order_shipped':
      subject = `[DevLovers] Order shipped for order ${orderTag}`;
      leadLine = 'Your order has been shipped.';
      break;
    case 'order_canceled':
      subject = `[DevLovers] Order canceled for order ${orderTag}`;
      leadLine = 'Your order has been canceled.';
      break;
    case 'order_returned':
      subject = `[DevLovers] Return received for order ${orderTag}`;
      leadLine = 'Your return has been received.';
      break;
    case 'payment_confirmed':
      subject = `[DevLovers] Payment confirmed for order ${orderTag}`;
      leadLine = 'Your payment has been confirmed.';
      break;
    case 'shipment_created':
      subject = `[DevLovers] Shipment created for order ${orderTag}`;
      leadLine = 'Your shipment label has been created.';
      break;
    case 'refund_processed':
      subject = `[DevLovers] Refund processed for order ${orderTag}`;
      leadLine = 'Your refund has been processed.';
      break;
    default:
      return null;
  }

  const totalLine = (() => {
    const amountMinor = readCanonicalAmountMinor(canonicalPayload);
    const currency = readCanonicalCurrency(canonicalPayload);
    if (amountMinor === null || !currency) return null;
    const formatted = formatCurrencyAmount(amountMinor, currency);
    return formatted
      ? `Total: ${formatted}`
      : `Total: ${amountMinor} ${currency}`;
  })();
  const paymentStatusLine = (() => {
    const paymentStatus = readCanonicalPaymentStatus(canonicalPayload);
    return paymentStatus ? `Payment status: ${paymentStatus}` : null;
  })();
  const eventLine = canonicalEvent
    ? `Canonical event: ${canonicalEvent}`
    : null;
  const text = [
    leadLine,
    `Order: ${orderTag}`,
    totalLine,
    paymentStatusLine,
    eventLine,
  ]
    .filter(Boolean)
    .join('\n');

  const html = [
    `<p>${escapeHtml(leadLine)}</p>`,
    `<p><strong>Order:</strong> ${escapeHtml(orderTag)}</p>`,
    totalLine ? `<p><strong>${escapeHtml(totalLine)}</strong></p>` : '',
    paymentStatusLine
      ? `<p><strong>${escapeHtml(paymentStatusLine)}</strong></p>`
      : '',
    eventLine
      ? `<p><strong>Canonical event:</strong> ${escapeHtml(canonicalEvent!)}</p>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  return { subject, text, html };
}

export function mapShippingEventToTemplate(
  eventName: string
): ShopNotificationTemplateKey | null {
  switch (eventName) {
    case 'quote_requested':
      return 'intl_quote_requested';
    case 'quote_offered':
      return 'intl_quote_offered';
    case 'quote_accepted':
      return 'intl_quote_accepted';
    case 'quote_declined':
      return 'intl_quote_declined';
    case 'quote_expired':
    case 'quote_timeout_requires_requote':
      return 'intl_quote_expired';
    case 'shipment_created':
    case 'label_created':
      return 'shipment_created';
    case 'shipped':
      return 'order_shipped';
    case 'return_received':
      return 'order_returned';
    default:
      return null;
  }
}

export function mapPaymentEventToTemplate(
  eventName: string
): ShopNotificationTemplateKey | null {
  switch (eventName) {
    case 'order_created':
      return 'order_created';
    case 'order_canceled':
      return 'order_canceled';
    case 'paid_applied':
      return 'payment_confirmed';
    case 'refund_applied':
      return 'refund_processed';
    default:
      return null;
  }
}
