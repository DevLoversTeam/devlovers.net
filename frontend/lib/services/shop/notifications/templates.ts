import 'server-only';

export const SHOP_NOTIFICATION_CHANNEL = 'email' as const;

export const shopNotificationTemplateKeys = [
  'intl_quote_requested',
  'intl_quote_offered',
  'intl_quote_accepted',
  'intl_quote_declined',
  'intl_quote_expired',
  'payment_confirmed',
  'shipment_created',
  'refund_processed',
] as const;

export type ShopNotificationTemplateKey =
  (typeof shopNotificationTemplateKeys)[number];

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
    default:
      return null;
  }
}

export function mapPaymentEventToTemplate(
  eventName: string
): ShopNotificationTemplateKey | null {
  switch (eventName) {
    case 'paid_applied':
      return 'payment_confirmed';
    case 'refund_applied':
      return 'refund_processed';
    default:
      return null;
  }
}
