export type CheckoutDeliveryMethodCode =
  | 'NP_WAREHOUSE'
  | 'NP_LOCKER'
  | 'NP_COURIER';

export type ShippingUnavailableReasonCode =
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
  reasonCode: ShippingUnavailableReasonCode | null;
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
        | 'MISSING_SHIPPING_METHOD'
        | 'MISSING_SHIPPING_CITY'
        | 'MISSING_SHIPPING_WAREHOUSE'
        | 'MISSING_SHIPPING_ADDRESS'
        | 'MISSING_RECIPIENT_NAME'
        | 'INVALID_RECIPIENT_PHONE';
      message: string;
    };

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const UA_PHONE_REGEX = /^(?:\+380\d{9}|0\d{9})$/;

export function countryFromLocale(locale: string | null | undefined): string | null {
  const normalized = trimOrNull(locale)?.toLowerCase() ?? '';
  const primary = normalized.split(/[-_]/)[0] ?? '';
  if (primary === 'uk') return 'UA';
  return null;
}

export function shippingUnavailableMessage(
  reasonCode: ShippingUnavailableReasonCode | null
): string {
  switch (reasonCode) {
    case 'SHOP_SHIPPING_DISABLED':
      return 'Shipping is currently disabled.';
    case 'NP_DISABLED':
      return 'Nova Poshta shipping is currently disabled.';
    case 'COUNTRY_NOT_SUPPORTED':
      return 'Shipping is available only for Ukraine.';
    case 'CURRENCY_NOT_SUPPORTED':
      return 'Nova Poshta shipping is available only for UAH orders.';
    case 'INTERNAL_ERROR':
      return 'Unable to load shipping methods right now.';
    default:
      return 'Shipping method is unavailable.';
  }
}

export function buildCheckoutShippingPayload(
  input: BuildCheckoutShippingPayloadInput
): BuildCheckoutShippingPayloadResult {
  if (!input.shippingAvailable) {
    return {
      ok: false,
      code: 'SHIPPING_UNAVAILABLE',
      message: shippingUnavailableMessage(input.reasonCode),
    };
  }

  if (!input.methodCode) {
    return {
      ok: false,
      code: 'MISSING_SHIPPING_METHOD',
      message: 'Select a delivery method.',
    };
  }

  const cityRef = trimOrNull(input.cityRef);
  if (!cityRef) {
    return {
      ok: false,
      code: 'MISSING_SHIPPING_CITY',
      message: 'Select a city.',
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
        code: 'MISSING_SHIPPING_WAREHOUSE',
        message: 'Select a branch or parcel locker.',
      };
    }
  }

  if (methodCode === 'NP_COURIER' && !addressLine1) {
    return {
      ok: false,
      code: 'MISSING_SHIPPING_ADDRESS',
      message: 'Enter courier delivery address.',
    };
  }

  if (!recipientFullName) {
    return {
      ok: false,
      code: 'MISSING_RECIPIENT_NAME',
      message: 'Enter recipient full name.',
    };
  }

  if (!recipientPhone || !UA_PHONE_REGEX.test(recipientPhone)) {
    return {
      ok: false,
      code: 'INVALID_RECIPIENT_PHONE',
      message: 'Enter a valid UA phone number.',
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
    country: countryFromLocale(input.locale),
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
