import { localeToCountry } from '@/lib/shop/locale';

export type CheckoutDeliveryMethodCode =
  | 'NP_WAREHOUSE'
  | 'NP_LOCKER'
  | 'NP_COURIER';

export type ShippingAvailabilityReasonCode =
  | 'OK'
  | 'SHOP_SHIPPING_DISABLED'
  | 'NP_DISABLED'
  | 'COUNTRY_NOT_SUPPORTED'
  | 'CURRENCY_NOT_SUPPORTED'
  | 'INTERNAL_ERROR';

export type CheckoutShippingPayload = {
  provider: 'nova_poshta';
  methodCode: CheckoutDeliveryMethodCode;
  selection: {
    cityRef: string;
    warehouseRef?: string;
    addressLine1?: string;
    addressLine2?: string;
  };
  recipient: {
    fullName: string;
    phone: string;
    email?: string;
    comment?: string;
  };
};

export type BuildCheckoutShippingPayloadInput = {
  shippingAvailable: boolean;
  reasonCode: ShippingAvailabilityReasonCode | null;
  locale: string;
  methodCode: CheckoutDeliveryMethodCode | null;
  cityRef: string | null;
  warehouseRef: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  recipientFullName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  recipientComment: string | null;
};

export type BuildCheckoutShippingPayloadResult =
  | {
      ok: true;
      country: string | null;
      shipping: CheckoutShippingPayload;
    }
  | {
      ok: false;
      code:
        | 'SHIPPING_UNAVAILABLE'
        | 'SHIPPING_METHOD_REQUIRED'
        | 'CITY_REQUIRED'
        | 'WAREHOUSE_REQUIRED'
        | 'ADDRESS_REQUIRED'
        | 'RECIPIENT_NAME_REQUIRED'
        | 'RECIPIENT_PHONE_REQUIRED'
        | 'RECIPIENT_EMAIL_INVALID';
    };

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const UA_PHONE_REGEX = /^(?:\+380\d{9}|0\d{9})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildCheckoutShippingPayload(
  input: BuildCheckoutShippingPayloadInput
): BuildCheckoutShippingPayloadResult {
  if (!input.shippingAvailable) {
    return {
      ok: false,
      code: 'SHIPPING_UNAVAILABLE',
    };
  }

  if (!input.methodCode) {
    return {
      ok: false,
      code: 'SHIPPING_METHOD_REQUIRED',
    };
  }

  const cityRef = trimOrNull(input.cityRef);
  if (!cityRef) {
    return {
      ok: false,
      code: 'CITY_REQUIRED',
    };
  }

  const methodCode = input.methodCode;
  const warehouseRef = trimOrNull(input.warehouseRef);
  const addressLine1 = trimOrNull(input.addressLine1);
  const addressLine2 = trimOrNull(input.addressLine2);
  const recipientFullName = trimOrNull(input.recipientFullName);
  const recipientPhone = trimOrNull(input.recipientPhone);
  const recipientEmail = trimOrNull(input.recipientEmail);
  const recipientComment = trimOrNull(input.recipientComment);

  if (methodCode === 'NP_WAREHOUSE' || methodCode === 'NP_LOCKER') {
    if (!warehouseRef) {
      return {
        ok: false,
        code: 'WAREHOUSE_REQUIRED',
      };
    }
  }

  if (methodCode === 'NP_COURIER' && !addressLine1) {
    return {
      ok: false,
      code: 'ADDRESS_REQUIRED',
    };
  }

  if (!recipientFullName) {
    return {
      ok: false,
      code: 'RECIPIENT_NAME_REQUIRED',
    };
  }

  if (!recipientPhone || !UA_PHONE_REGEX.test(recipientPhone)) {
    return {
      ok: false,
      code: 'RECIPIENT_PHONE_REQUIRED',
    };
  }

  if (recipientEmail && !EMAIL_REGEX.test(recipientEmail)) {
    return {
      ok: false,
      code: 'RECIPIENT_EMAIL_INVALID',
    };
  }

  const selection: CheckoutShippingPayload['selection'] = {
    cityRef,
    ...(warehouseRef ? { warehouseRef } : {}),
    ...(addressLine1 ? { addressLine1 } : {}),
    ...(addressLine2 ? { addressLine2 } : {}),
  };

  return {
    ok: true,
    country: localeToCountry(input.locale),
    shipping: {
      provider: 'nova_poshta',
      methodCode,
      selection,
      recipient: {
        fullName: recipientFullName,
        phone: recipientPhone,
        ...(recipientEmail ? { email: recipientEmail } : {}),
        ...(recipientComment ? { comment: recipientComment } : {}),
      },
    },
  };
}
