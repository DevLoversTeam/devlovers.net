import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  npCities,
  npWarehouses,
  orderItems,
  orderLegalConsents,
  orders,
  orderShipping,
  productPrices,
  products,
} from '@/db/schema/shop';
import {
  assertNovaPoshtaProductionLikeReady,
  getShopShippingFlags,
  NovaPoshtaConfigError,
} from '@/lib/env/nova-poshta';
import { readServerEnv } from '@/lib/env/server-env';
import { assertCriticalShopEnv } from '@/lib/env/shop-critical';
import { getShopLegalVersions } from '@/lib/env/shop-legal';
import { logError, logWarn } from '@/lib/logging';
import { writeCanonicalEventWithRetry } from '@/lib/services/shop/events/write-canonical-event-with-retry';
import { writePaymentEvent } from '@/lib/services/shop/events/write-payment-event';
import { resolveShippingAvailability } from '@/lib/services/shop/shipping/availability';
import {
  type CheckoutShippingQuote,
  CheckoutShippingQuoteConfigError,
  isCheckoutShippingQuoteCurrency,
  resolveCheckoutShippingQuote,
} from '@/lib/services/shop/shipping/checkout-quote';
import { createCheckoutPricingFingerprint } from '@/lib/shop/checkout-pricing';
import {
  resolveStandardStorefrontCheckoutProviderCandidates,
  resolveStandardStorefrontCurrency,
  resolveStandardStorefrontShippingCountry,
} from '@/lib/shop/commercial-policy';
import {
  calculateLineTotal,
  fromCents,
  sumLineTotals,
  toDbMoney,
} from '@/lib/shop/money';
import {
  type PaymentMethod,
  type PaymentProvider,
  type PaymentStatus,
  resolveDefaultMethodForProvider,
} from '@/lib/shop/payments';
import {
  type CheckoutItem,
  type CheckoutLegalConsentInput,
  type CheckoutResult,
  type CheckoutShippingInput,
  type OrderSummaryWithMinor,
} from '@/lib/types/shop';

import {
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidPayloadError,
  InvalidVariantError,
  OrderNotFoundError,
  OrderStateInvalidError,
  PriceConfigError,
} from '../errors';
import { applyReserveMove } from '../inventory';
import {
  aggregateReserveByProductId,
  type CheckoutItemWithVariant,
  type Currency,
  hashIdempotencyRequest,
  isStrictNonNegativeInt,
  mergeCheckoutItems,
  normalizeCheckoutItem,
  normVariant,
  requireTotalCents,
  resolvePaymentProvider,
} from './_shared';
import { guardedPaymentStatusUpdate } from './payment-state';
import { restockOrder } from './restock';
import { getOrderById, getOrderByIdempotencyKey } from './summary';
export async function findExistingCheckoutOrderByIdempotencyKey(
  idempotencyKey: string
): Promise<OrderSummaryWithMinor | null> {
  return getOrderByIdempotencyKey(db, idempotencyKey);
}

async function writeOrderCreatedCanonicalEvent(
  order: OrderSummaryWithMinor
): Promise<void> {
  await writePaymentEvent({
    orderId: order.id,
    provider: order.paymentProvider,
    eventName: 'order_created',
    eventSource: 'checkout',
    amountMinor: order.totalAmountMinor,
    currency: order.currency,
    payload: {
      orderId: order.id,
      totalAmountMinor: order.totalAmountMinor,
      currency: order.currency,
      paymentProvider: order.paymentProvider,
      paymentStatus: order.paymentStatus,
      fulfillmentStage: order.fulfillmentStage,
      createdAt: order.createdAt.toISOString(),
    },
  });
}

async function ensureOrderCreatedCanonicalEvent(
  order: OrderSummaryWithMinor
): Promise<void> {
  await writeCanonicalEventWithRetry({
    write: () => writeOrderCreatedCanonicalEvent(order),
    onFinalFailure: error => {
      logWarn('checkout_order_created_event_write_failed', {
        orderId: order.id,
        code: 'ORDER_CREATED_EVENT_WRITE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

async function getProductsForCheckout(
  productIds: string[],
  currency: Currency
) {
  if (!productIds.length) return [];

  return db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      stock: products.stock,
      sku: products.sku,

      colors: products.colors,
      sizes: products.sizes,

      priceMinor: productPrices.priceMinor,

      originalPrice: productPrices.originalPrice,
      priceCurrency: productPrices.currency,
      isActive: products.isActive,
    })

    .from(products)
    .leftJoin(
      productPrices,
      and(
        eq(productPrices.productId, products.id),
        eq(productPrices.currency, currency)
      )
    )
    .where(and(eq(products.isActive, true), inArray(products.id, productIds)));
}

type CheckoutProductRow = Awaited<
  ReturnType<typeof getProductsForCheckout>
>[number];

function parseVariantList(raw: unknown): string[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    const out = raw.map(x => normVariant(String(x))).filter(x => x.length > 0);
    return Array.from(new Set(out));
  }

  if (typeof raw !== 'string') {
    return [];
  }

  const v0 = raw.trim();
  if (!v0) return [];

  if (v0.startsWith('[')) {
    try {
      const parsed = JSON.parse(v0);
      if (Array.isArray(parsed)) {
        const out = parsed
          .map(x => normVariant(String(x)))
          .filter(x => x.length > 0);
        return Array.from(new Set(out));
      }
    } catch {}
  }

  const v =
    v0.startsWith('{') && v0.endsWith('}')
      ? v0.slice(1, -1).replace(/"/g, '')
      : v0;

  const out = v
    .split(/[,;\n\r]+/g)
    .map(x => normVariant(x))
    .filter(x => x.length > 0);

  return Array.from(new Set(out));
}

type CheckoutShippingMethodCode = CheckoutShippingInput['methodCode'];

type PreparedShipping = {
  required: boolean;
  hashRefs: {
    provider: 'nova_poshta';
    methodCode: CheckoutShippingMethodCode;
    cityRef: string;
    warehouseRef: string | null;
    recipient: {
      fullName: string;
      phone: string;
      email: string | null;
      comment: string | null;
    };
  } | null;
  orderSummary: {
    shippingRequired: boolean;
    shippingPayer: 'customer' | null;
    shippingProvider: 'nova_poshta' | null;
    shippingMethodCode: CheckoutShippingMethodCode | null;
    shippingAmountMinor: number | null;
    shippingStatus: 'pending' | null;
  };
  snapshot: Record<string, unknown> | null;
};

type PreparedLegalConsent = {
  hashRefs: {
    termsAccepted: true;
    privacyAccepted: true;
    termsVersion: string;
    privacyVersion: string;
  };
  snapshot: {
    termsAccepted: true;
    privacyAccepted: true;
    termsVersion: string;
    privacyVersion: string;
    consentedAt: Date;
    source: string;
    locale: string | null;
    country: string | null;
  };
};

const CHECKOUT_LEGAL_CONSENT_REPLAY_GRACE_MS = 30_000;

function normalizeOptionalRecipientText(
  raw: string | null | undefined
): string | null {
  const normalized = raw?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function requireLegalConsentVersion(
  raw: string | undefined,
  field: 'termsVersion' | 'privacyVersion'
): string {
  const normalized = (raw ?? '').trim();
  if (normalized.length > 0) {
    return normalized;
  }

  throw new InvalidPayloadError(
    `${field === 'termsVersion' ? 'Terms' : 'Privacy'} version is required before checkout.`,
    {
      code:
        field === 'termsVersion'
          ? 'TERMS_VERSION_REQUIRED'
          : 'PRIVACY_VERSION_REQUIRED',
    }
  );
}

function isWithinLegalConsentReplayGraceWindow(createdAt: Date): boolean {
  return (
    Date.now() - createdAt.getTime() <= CHECKOUT_LEGAL_CONSENT_REPLAY_GRACE_MS
  );
}

function resolveRequestedCheckoutLegalConsentHashRefs(args: {
  legalConsent: CheckoutLegalConsentInput | null | undefined;
}): PreparedLegalConsent['hashRefs'] {
  if (args.legalConsent == null) {
    throw new InvalidPayloadError(
      'Explicit legal consent is required before checkout.',
      {
        code: 'LEGAL_CONSENT_REQUIRED',
      }
    );
  }

  if (!args.legalConsent.termsAccepted) {
    throw new InvalidPayloadError('Terms must be accepted before checkout.', {
      code: 'TERMS_NOT_ACCEPTED',
    });
  }

  if (!args.legalConsent.privacyAccepted) {
    throw new InvalidPayloadError('Privacy policy must be accepted.', {
      code: 'PRIVACY_NOT_ACCEPTED',
    });
  }

  return {
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: requireLegalConsentVersion(
      args.legalConsent.termsVersion,
      'termsVersion'
    ),
    privacyVersion: requireLegalConsentVersion(
      args.legalConsent.privacyVersion,
      'privacyVersion'
    ),
  };
}

function buildPreparedLegalConsentSnapshot(args: {
  hashRefs: PreparedLegalConsent['hashRefs'];
  locale: string | null | undefined;
  country: string | null | undefined;
  consentedAt?: Date;
}): PreparedLegalConsent['snapshot'] {
  return {
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: args.hashRefs.termsVersion,
    privacyVersion: args.hashRefs.privacyVersion,
    consentedAt: args.consentedAt ?? new Date(),
    source: 'checkout_explicit',
    locale: normVariant(args.locale).toLowerCase() || null,
    country: normalizeCountryCode(
      args.country ?? resolveStandardStorefrontShippingCountry()
    ),
  };
}

function resolveRequestedCheckoutShippingHashRefs(
  shipping: CheckoutShippingInput | null | undefined
): PreparedShipping['hashRefs'] {
  if (!shipping) return null;

  return {
    provider: 'nova_poshta',
    methodCode: shipping.methodCode,
    cityRef: shipping.selection.cityRef,
    warehouseRef: shipping.selection.warehouseRef ?? null,
    recipient: {
      fullName: shipping.recipient.fullName.trim(),
      phone: shipping.recipient.phone.trim(),
      email: normalizeOptionalRecipientText(shipping.recipient.email),
      comment: normalizeOptionalRecipientText(shipping.recipient.comment),
    },
  };
}

function normalizeCountryCode(raw: string | null | undefined): string | null {
  const normalized = (raw ?? '').trim().toUpperCase();
  if (normalized.length !== 2) return null;
  return normalized;
}

function readShippingRefFromSnapshot(
  value: unknown,
  field: 'cityRef' | 'warehouseRef'
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const selection = (value as { selection?: unknown }).selection;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    return null;
  }
  const raw = (selection as Record<string, unknown>)[field];
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function readShippingRecipientFieldFromSnapshot(
  value: unknown,
  field: 'fullName' | 'phone' | 'email' | 'comment'
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const recipient = (value as { recipient?: unknown }).recipient;
  if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient)) {
    return null;
  }
  const raw = (recipient as Record<string, unknown>)[field];
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function shippingValidationCodeFromAvailability(reasonCode: string): {
  code: 'SHIPPING_METHOD_UNAVAILABLE' | 'SHIPPING_CURRENCY_UNSUPPORTED';
  message: string;
} {
  if (reasonCode === 'CURRENCY_NOT_SUPPORTED') {
    return {
      code: 'SHIPPING_CURRENCY_UNSUPPORTED',
      message: 'Shipping is available only for UAH currency.',
    };
  }
  return {
    code: 'SHIPPING_METHOD_UNAVAILABLE',
    message: 'Selected shipping method is unavailable for this locale/country.',
  };
}

async function prepareCheckoutShipping(args: {
  shipping: CheckoutShippingInput | null | undefined;
  locale: string | null | undefined;
  country: string | null | undefined;
  currency: Currency;
  shippingQuoteFingerprint?: string | null;
  requireShippingQuoteFingerprint?: boolean;
}): Promise<PreparedShipping> {
  const flags = getShopShippingFlags();
  const shippingFeatureEnabled = flags.shippingEnabled && flags.npEnabled;

  if (!shippingFeatureEnabled) {
    if (args.shipping) {
      throw new InvalidPayloadError('Shipping is not available.', {
        code: 'SHIPPING_METHOD_UNAVAILABLE',
      });
    }
    return {
      required: false,
      hashRefs: null,
      orderSummary: {
        shippingRequired: false,
        shippingPayer: null,
        shippingProvider: null,
        shippingMethodCode: null,
        shippingAmountMinor: null,
        shippingStatus: null,
      },
      snapshot: null,
    };
  }

  if (!args.shipping) {
    return {
      required: false,
      hashRefs: null,
      orderSummary: {
        shippingRequired: false,
        shippingPayer: null,
        shippingProvider: null,
        shippingMethodCode: null,
        shippingAmountMinor: null,
        shippingStatus: null,
      },
      snapshot: null,
    };
  }

  const availability = resolveShippingAvailability({
    shippingEnabled: flags.shippingEnabled,
    npEnabled: flags.npEnabled,
    locale: args.locale ?? null,
    country: args.country ?? resolveStandardStorefrontShippingCountry(),
    currency: args.currency,
  });

  if (!availability.available) {
    const mapped = shippingValidationCodeFromAvailability(
      availability.reasonCode
    );
    throw new InvalidPayloadError(mapped.message, { code: mapped.code });
  }

  const cityRef = args.shipping.selection.cityRef;
  const warehouseRef = args.shipping.selection.warehouseRef ?? null;
  const methodCode = args.shipping.methodCode;

  const [city] = await db
    .select({
      ref: npCities.ref,
      nameUa: npCities.nameUa,
      nameRu: npCities.nameRu,
      area: npCities.area,
      region: npCities.region,
    })
    .from(npCities)
    .where(and(eq(npCities.ref, cityRef), eq(npCities.isActive, true)))
    .limit(1);

  if (!city) {
    throw new InvalidPayloadError('Invalid city reference.', {
      code: 'INVALID_SHIPPING_ADDRESS',
    });
  }

  let warehouse:
    | {
        ref: string;
        settlementRef: string | null;
        name: string;
        address: string | null;
        isPostMachine: boolean;
      }
    | undefined;

  if (methodCode === 'NP_WAREHOUSE' || methodCode === 'NP_LOCKER') {
    if (!warehouseRef) {
      throw new InvalidPayloadError(
        'warehouseRef is required for this method.',
        {
          code: 'INVALID_SHIPPING_ADDRESS',
        }
      );
    }

    const [resolved] = await db
      .select({
        ref: npWarehouses.ref,
        settlementRef: npWarehouses.settlementRef,
        name: npWarehouses.name,
        address: npWarehouses.address,
        isPostMachine: npWarehouses.isPostMachine,
      })
      .from(npWarehouses)
      .where(
        and(
          eq(npWarehouses.ref, warehouseRef),
          eq(npWarehouses.isActive, true),
          eq(npWarehouses.cityRef, cityRef)
        )
      )
      .limit(1);

    if (!resolved) {
      throw new InvalidPayloadError(
        'warehouseRef does not belong to selected cityRef.',
        { code: 'INVALID_SHIPPING_ADDRESS' }
      );
    }

    if (methodCode === 'NP_LOCKER' && !resolved.isPostMachine) {
      throw new InvalidPayloadError(
        'Selected warehouse is not a parcel locker.',
        { code: 'INVALID_SHIPPING_ADDRESS' }
      );
    }

    warehouse = resolved;
  }

  if (methodCode === 'NP_COURIER' && !args.shipping.selection.addressLine1) {
    throw new InvalidPayloadError('Courier address line is required.', {
      code: 'INVALID_SHIPPING_ADDRESS',
    });
  }

  if (!isCheckoutShippingQuoteCurrency(args.currency)) {
    throw new InvalidPayloadError(
      'Shipping is available only for UAH currency.',
      {
        code: 'SHIPPING_CURRENCY_UNSUPPORTED',
      }
    );
  }

  try {
    assertNovaPoshtaProductionLikeReady();
  } catch (error) {
    if (error instanceof NovaPoshtaConfigError) {
      throw new InvalidPayloadError(
        'Shipping method is currently unavailable.',
        {
          code: 'SHIPPING_METHOD_UNAVAILABLE',
        }
      );
    }
    throw error;
  }

  let authoritativeQuote: CheckoutShippingQuote;
  try {
    authoritativeQuote = resolveCheckoutShippingQuote({
      methodCode,
      currency: args.currency,
    });
  } catch (error) {
    if (error instanceof CheckoutShippingQuoteConfigError) {
      throw new InvalidPayloadError(
        'Shipping amount is unavailable. Refresh your cart and try again.',
        {
          code: 'SHIPPING_AMOUNT_UNAVAILABLE',
        }
      );
    }
    throw error;
  }

  if (args.requireShippingQuoteFingerprint) {
    const normalizedShippingQuoteFingerprint =
      args.shippingQuoteFingerprint?.trim() ?? '';

    if (
      !normalizedShippingQuoteFingerprint ||
      normalizedShippingQuoteFingerprint !== authoritativeQuote.quoteFingerprint
    ) {
      throw new InvalidPayloadError(
        'Shipping amount changed. Refresh your cart and try again.',
        {
          code: 'CHECKOUT_SHIPPING_CHANGED',
          details: {
            reason: normalizedShippingQuoteFingerprint
              ? 'SHIPPING_QUOTE_FINGERPRINT_MISMATCH'
              : 'SHIPPING_QUOTE_FINGERPRINT_MISSING',
          },
        }
      );
    }
  }

  const snapshot: Record<string, unknown> = {
    provider: 'nova_poshta',
    methodCode,
    quote: {
      currency: authoritativeQuote.currency,
      amountMinor: authoritativeQuote.amountMinor,
      quoteFingerprint: authoritativeQuote.quoteFingerprint,
    },
    selection: {
      cityRef,
      cityNameUa: city.nameUa,
      cityNameRu: city.nameRu ?? null,
      area: city.area ?? null,
      region: city.region ?? null,
      warehouseRef: warehouse?.ref ?? warehouseRef,
      warehouseName: warehouse?.name ?? null,
      warehouseAddress: warehouse?.address ?? null,
      addressLine1: args.shipping.selection.addressLine1 ?? null,
      addressLine2: args.shipping.selection.addressLine2 ?? null,
    },
    recipient: {
      fullName: args.shipping.recipient.fullName,
      phone: args.shipping.recipient.phone,
      email: normalizeOptionalRecipientText(args.shipping.recipient.email),
      comment: normalizeOptionalRecipientText(args.shipping.recipient.comment),
    },
  };

  return {
    required: true,
    hashRefs: {
      provider: 'nova_poshta',
      methodCode,
      cityRef,
      warehouseRef: warehouse?.ref ?? warehouseRef ?? null,
      recipient: {
        fullName: args.shipping.recipient.fullName.trim(),
        phone: args.shipping.recipient.phone.trim(),
        email: normalizeOptionalRecipientText(args.shipping.recipient.email),
        comment: normalizeOptionalRecipientText(
          args.shipping.recipient.comment
        ),
      },
    },
    orderSummary: {
      shippingRequired: true,
      shippingPayer: 'customer',
      shippingProvider: 'nova_poshta',
      shippingMethodCode: methodCode,
      shippingAmountMinor: authoritativeQuote.amountMinor,
      shippingStatus: 'pending',
    },
    snapshot,
  };
}

function resolveCheckoutLegalConsent(args: {
  legalConsent: CheckoutLegalConsentInput | null | undefined;
  locale: string | null | undefined;
  country: string | null | undefined;
}): PreparedLegalConsent {
  const hashRefs = resolveRequestedCheckoutLegalConsentHashRefs(args);
  const canonicalLegalVersions = getShopLegalVersions();

  if (hashRefs.termsVersion !== canonicalLegalVersions.termsVersion) {
    throw new InvalidPayloadError(
      'Terms version is outdated. Refresh and try again.',
      {
        code: 'TERMS_VERSION_MISMATCH',
      }
    );
  }

  if (hashRefs.privacyVersion !== canonicalLegalVersions.privacyVersion) {
    throw new InvalidPayloadError(
      'Privacy version is outdated. Refresh and try again.',
      {
        code: 'PRIVACY_VERSION_MISMATCH',
      }
    );
  }

  return {
    hashRefs,
    snapshot: buildPreparedLegalConsentSnapshot({
      hashRefs,
      locale: args.locale,
      country: args.country,
    }),
  };
}

type OrderShippingSnapshotDbClient = Pick<typeof db, 'insert'>;
async function ensureOrderShippingSnapshot(args: {
  orderId: string;
  snapshot: Record<string, unknown>;
  dbClient?: OrderShippingSnapshotDbClient;
}) {
  const client = args.dbClient ?? db;

  await client
    .insert(orderShipping)
    .values({
      orderId: args.orderId,
      shippingAddress: args.snapshot,
    })
    .onConflictDoNothing({ target: orderShipping.orderId });
}

type OrderLegalConsentSnapshotDbClient = Pick<typeof db, 'insert'>;
async function ensureOrderLegalConsentSnapshot(args: {
  orderId: string;
  snapshot: PreparedLegalConsent['snapshot'];
  dbClient?: OrderLegalConsentSnapshotDbClient;
}) {
  const client = args.dbClient ?? db;

  await client
    .insert(orderLegalConsents)
    .values({
      orderId: args.orderId,
      termsAccepted: args.snapshot.termsAccepted,
      privacyAccepted: args.snapshot.privacyAccepted,
      termsVersion: args.snapshot.termsVersion,
      privacyVersion: args.snapshot.privacyVersion,
      consentedAt: args.snapshot.consentedAt,
      source: args.snapshot.source,
      locale: args.snapshot.locale,
      country: args.snapshot.country,
    })
    .onConflictDoNothing({ target: orderLegalConsents.orderId });
}

function priceItems(
  items: CheckoutItemWithVariant[],
  productMap: Map<string, CheckoutProductRow>,
  currency: Currency
) {
  return items.map(item => {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new InvalidPayloadError('Some products are unavailable.');
    }
    if (!product.priceCurrency || product.priceMinor == null) {
      throw new PriceConfigError('Price not configured for currency.', {
        productId: product.id,
        currency,
      });
    }

    const unitPriceCents = product.priceMinor;

    if (!isStrictNonNegativeInt(unitPriceCents) || unitPriceCents <= 0) {
      throw new InvalidPayloadError('Product pricing is misconfigured.');
    }

    const lineTotalCents = calculateLineTotal(unitPriceCents, item.quantity);
    const normalizedUnitPrice = fromCents(unitPriceCents);
    const lineTotal = fromCents(lineTotalCents);

    return {
      productId: product.id,
      selectedSize: normVariant(item.selectedSize),
      selectedColor: normVariant(item.selectedColor),
      quantity: item.quantity,
      unitPrice: normalizedUnitPrice,
      unitPriceCents,
      lineTotal,
      lineTotalCents,
      stock: product.stock,
      productTitle: product.title,
      productSlug: product.slug,
      productSku: product.sku,
    };
  });
}

function isMonobankGooglePayEnabled(): boolean {
  const raw = readServerEnv('SHOP_MONOBANK_GPAY_ENABLED')?.toLowerCase() ?? '';
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function normalizeStoredPaymentMethod(value: unknown): PaymentMethod | null {
  const normalized = normVariant(typeof value === 'string' ? value : '');
  if (normalized === 'stripe_card') return 'stripe_card';
  if (normalized === 'monobank_invoice') return 'monobank_invoice';
  if (normalized === 'monobank_google_pay') return 'monobank_google_pay';
  return null;
}

function resolveCheckoutPaymentMethod(args: {
  requestedMethod?: PaymentMethod | null;
  paymentProvider: PaymentProvider;
  currency: Currency;
}): PaymentMethod | null {
  if (args.paymentProvider === 'none') return null;

  if (!args.requestedMethod) {
    return resolveDefaultMethodForProvider(args.paymentProvider, args.currency);
  }

  if (args.requestedMethod === 'stripe_card') {
    if (args.paymentProvider !== 'stripe') {
      throw new InvalidPayloadError(
        'paymentMethod is not allowed for selected provider.',
        {
          code: 'INVALID_PAYLOAD',
        }
      );
    }
    return args.requestedMethod;
  }

  if (
    args.requestedMethod === 'monobank_invoice' ||
    args.requestedMethod === 'monobank_google_pay'
  ) {
    if (args.paymentProvider !== 'monobank' || args.currency !== 'UAH') {
      throw new InvalidPayloadError(
        'paymentMethod is not allowed for selected provider/currency.',
        {
          code: 'INVALID_PAYLOAD',
        }
      );
    }

    if (
      args.requestedMethod === 'monobank_google_pay' &&
      !isMonobankGooglePayEnabled()
    ) {
      throw new InvalidPayloadError('Monobank Google Pay is disabled.', {
        code: 'INVALID_PAYLOAD',
      });
    }

    return args.requestedMethod;
  }

  throw new InvalidPayloadError('Invalid payment method.', {
    code: 'INVALID_PAYLOAD',
  });
}

function buildCheckoutMetadataPatch(
  existingMeta: unknown,
  paymentMethod: PaymentMethod | null
): Record<string, unknown> {
  const base =
    existingMeta &&
    typeof existingMeta === 'object' &&
    !Array.isArray(existingMeta)
      ? (existingMeta as Record<string, unknown>)
      : {};

  const checkoutMeta =
    base.checkout &&
    typeof base.checkout === 'object' &&
    !Array.isArray(base.checkout)
      ? (base.checkout as Record<string, unknown>)
      : {};

  return {
    ...base,
    checkout: {
      ...checkoutMeta,
      requestedMethod: paymentMethod,
    },
  };
}

export async function createOrderWithItems({
  items,
  idempotencyKey,
  userId,
  locale,
  country,
  shipping,
  legalConsent,
  pricingFingerprint,
  requirePricingFingerprint = false,
  shippingQuoteFingerprint,
  requireShippingQuoteFingerprint = false,
  paymentProvider: requestedProvider,
  paymentMethod: requestedMethod,
}: {
  items: CheckoutItem[];
  idempotencyKey: string;
  userId?: string | null;
  locale: string | null | undefined;
  country?: string | null;
  shipping?: CheckoutShippingInput | null;
  legalConsent: CheckoutLegalConsentInput;
  pricingFingerprint?: string | null;
  requirePricingFingerprint?: boolean;
  shippingQuoteFingerprint?: string | null;
  requireShippingQuoteFingerprint?: boolean;
  paymentProvider?: PaymentProvider;
  paymentMethod?: PaymentMethod | null;
}): Promise<CheckoutResult> {
  assertCriticalShopEnv();

  if (requestedProvider === 'none') {
    throw new InvalidPayloadError('paymentProvider "none" is not supported.', {
      code: 'INVALID_PAYLOAD',
    });
  }

  const storefrontCurrency: Currency = resolveStandardStorefrontCurrency();
  const checkoutProviderCandidates =
    resolveStandardStorefrontCheckoutProviderCandidates({
      requestedProvider:
        requestedProvider === 'stripe' || requestedProvider === 'monobank'
          ? requestedProvider
          : null,
      requestedMethod,
    });
  const paymentProvider: PaymentProvider =
    checkoutProviderCandidates[0] ?? 'stripe';
  const currency: Currency = storefrontCurrency;

  const initialPaymentStatus: PaymentStatus = 'pending';
  const resolvedPaymentMethod = resolveCheckoutPaymentMethod({
    requestedMethod,
    paymentProvider,
    currency,
  });

  const normalizedItems = mergeCheckoutItems(items).map(item =>
    normalizeCheckoutItem(item)
  );
  const requestedShippingHashRefs = resolveRequestedCheckoutShippingHashRefs(
    shipping ?? null
  );
  const requestedLegalConsentHashRefs =
    resolveRequestedCheckoutLegalConsentHashRefs({
      legalConsent,
    });
  const requestHash = hashIdempotencyRequest({
    items: normalizedItems,
    currency,
    locale: locale ?? null,
    paymentProvider,
    paymentMethod: resolvedPaymentMethod,
    shipping: requestedShippingHashRefs,
    legalConsent: requestedLegalConsentHashRefs,
  });

  async function assertIdempotencyCompatible(existing: OrderSummaryWithMinor) {
    const [row] = await db
      .select({
        id: orders.id,
        currency: orders.currency,
        paymentStatus: orders.paymentStatus,
        paymentProvider: orders.paymentProvider,
        pspPaymentMethod: orders.pspPaymentMethod,
        pspMetadata: orders.pspMetadata,
        idempotencyRequestHash: orders.idempotencyRequestHash,
        failureMessage: orders.failureMessage,
        shippingProvider: orders.shippingProvider,
        shippingMethodCode: orders.shippingMethodCode,
      })
      .from(orders)
      .where(eq(orders.id, existing.id))
      .limit(1);

    if (!row) throw new OrderNotFoundError('Order not found');

    if (row.currency !== currency) {
      throw new IdempotencyConflictError(
        'Idempotency key already used with different currency.',
        { existingCurrency: row.currency, requestCurrency: currency }
      );
    }

    const [existingShippingRow] = await db
      .select({
        shippingAddress: orderShipping.shippingAddress,
      })
      .from(orderShipping)
      .where(eq(orderShipping.orderId, row.id))
      .limit(1);
    let [existingLegalConsentRow] = await db
      .select({
        termsAccepted: orderLegalConsents.termsAccepted,
        privacyAccepted: orderLegalConsents.privacyAccepted,
        termsVersion: orderLegalConsents.termsVersion,
        privacyVersion: orderLegalConsents.privacyVersion,
      })
      .from(orderLegalConsents)
      .where(eq(orderLegalConsents.orderId, row.id))
      .limit(1);

    if (!existingLegalConsentRow) {
      const canRepairMissingLegalConsent =
        row.idempotencyRequestHash === requestHash &&
        isWithinLegalConsentReplayGraceWindow(existing.createdAt);

      if (canRepairMissingLegalConsent) {
        await ensureOrderLegalConsentSnapshot({
          orderId: row.id,
          snapshot: buildPreparedLegalConsentSnapshot({
            hashRefs: requestedLegalConsentHashRefs,
            locale,
            country: country ?? null,
            consentedAt: existing.createdAt,
          }),
        });

        [existingLegalConsentRow] = await db
          .select({
            termsAccepted: orderLegalConsents.termsAccepted,
            privacyAccepted: orderLegalConsents.privacyAccepted,
            termsVersion: orderLegalConsents.termsVersion,
            privacyVersion: orderLegalConsents.privacyVersion,
          })
          .from(orderLegalConsents)
          .where(eq(orderLegalConsents.orderId, row.id))
          .limit(1);
      }

      if (!existingLegalConsentRow) {
        throw new IdempotencyConflictError(
          'Idempotency key cannot be replayed because persisted legal consent evidence is missing.',
          {
            orderId: row.id,
            reason: 'LEGAL_CONSENT_MISSING',
          }
        );
      }
    }

    const existingCityRef = readShippingRefFromSnapshot(
      existingShippingRow?.shippingAddress,
      'cityRef'
    );
    const existingWarehouseRef = readShippingRefFromSnapshot(
      existingShippingRow?.shippingAddress,
      'warehouseRef'
    );
    const existingRecipient = {
      fullName:
        readShippingRecipientFieldFromSnapshot(
          existingShippingRow?.shippingAddress,
          'fullName'
        ) ?? '',
      phone:
        readShippingRecipientFieldFromSnapshot(
          existingShippingRow?.shippingAddress,
          'phone'
        ) ?? '',
      email: readShippingRecipientFieldFromSnapshot(
        existingShippingRow?.shippingAddress,
        'email'
      ),
      comment: readShippingRecipientFieldFromSnapshot(
        existingShippingRow?.shippingAddress,
        'comment'
      ),
    };
    const existingLegalHashRefs = {
      termsAccepted: existingLegalConsentRow.termsAccepted,
      privacyAccepted: existingLegalConsentRow.privacyAccepted,
      termsVersion: existingLegalConsentRow.termsVersion,
      privacyVersion: existingLegalConsentRow.privacyVersion,
    };

    if (
      existingLegalHashRefs.termsAccepted !==
        requestedLegalConsentHashRefs.termsAccepted ||
      existingLegalHashRefs.privacyAccepted !==
        requestedLegalConsentHashRefs.privacyAccepted ||
      existingLegalHashRefs.termsVersion !==
        requestedLegalConsentHashRefs.termsVersion ||
      existingLegalHashRefs.privacyVersion !==
        requestedLegalConsentHashRefs.privacyVersion
    ) {
      throw new IdempotencyConflictError(
        'Idempotency key already used with different legal consent.',
        {
          existing: existingLegalHashRefs,
          requested: requestedLegalConsentHashRefs,
        }
      );
    }

    const existingProvider = resolvePaymentProvider({
      paymentProvider: row.paymentProvider,
      paymentIntentId: existing.paymentIntentId ?? null,
      paymentStatus: row.paymentStatus,
    });
    const metadataMethod =
      row.pspMetadata &&
      typeof row.pspMetadata === 'object' &&
      !Array.isArray(row.pspMetadata)
        ? normalizeStoredPaymentMethod(
            (
              (row.pspMetadata as Record<string, unknown>).checkout as
                | Record<string, unknown>
                | undefined
            )?.requestedMethod
          )
        : null;

    const existingMethod =
      normalizeStoredPaymentMethod(row.pspPaymentMethod) ??
      metadataMethod ??
      resolveDefaultMethodForProvider(
        existingProvider,
        row.currency as Currency
      );

    const derivedExistingHash = hashIdempotencyRequest({
      items: (existing.items as any[]).map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        selectedSize: normVariant((i as any).selectedSize),
        selectedColor: normVariant((i as any).selectedColor),
        options: {
          ...(normVariant((i as any).selectedSize)
            ? { size: normVariant((i as any).selectedSize) }
            : {}),
          ...(normVariant((i as any).selectedColor)
            ? { color: normVariant((i as any).selectedColor) }
            : {}),
        },
      })) as CheckoutItemWithVariant[],
      currency: row.currency,
      locale: locale ?? null,
      paymentProvider: existingProvider,
      paymentMethod: existingMethod,
      shipping:
        row.shippingProvider === 'nova_poshta' &&
        row.shippingMethodCode &&
        existingCityRef
          ? {
              provider: 'nova_poshta',
              methodCode: row.shippingMethodCode,
              cityRef: existingCityRef,
              warehouseRef: existingWarehouseRef,
              recipient: existingRecipient,
            }
          : null,
      legalConsent: existingLegalHashRefs,
    });

    if (row.idempotencyRequestHash !== derivedExistingHash) {
      try {
        await db
          .update(orders)
          .set({
            idempotencyRequestHash: derivedExistingHash,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, row.id));
      } catch (e) {
        logWarn('checkout_rejected', {
          phase: 'idempotency_request_hash_backfill',
          orderId: row.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (derivedExistingHash !== requestHash) {
      throw new IdempotencyConflictError(undefined, {
        existingHash: derivedExistingHash,
        requestHash,
      });
    }

    const nextMeta = buildCheckoutMetadataPatch(
      row.pspMetadata,
      existingMethod ?? resolvedPaymentMethod
    );
    const needsMethodBackfill =
      row.pspPaymentMethod !== (existingMethod ?? resolvedPaymentMethod);
    const currentStoredMethod =
      row.pspMetadata &&
      typeof row.pspMetadata === 'object' &&
      !Array.isArray(row.pspMetadata)
        ? (
            ((row.pspMetadata as Record<string, unknown>).checkout as
              | Record<string, unknown>
              | undefined) ?? {}
          ).requestedMethod
        : undefined;
    const needsMetadataBackfill =
      currentStoredMethod !== (existingMethod ?? resolvedPaymentMethod);

    if (needsMethodBackfill || needsMetadataBackfill) {
      try {
        await db
          .update(orders)
          .set({
            pspPaymentMethod: existingMethod ?? resolvedPaymentMethod,
            pspMetadata: nextMeta,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, row.id));
      } catch (e) {
        logWarn('checkout_rejected', {
          phase: 'payment_method_backfill',
          orderId: row.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (row.paymentStatus === 'failed') {
      try {
        await restockOrder(existing.id, { reason: 'failed' });
      } catch (restockErr) {
        logError(
          `[assertIdempotencyCompatible] cleanup restock failed orderId=${existing.id}`,
          restockErr
        );
      }

      throw new InsufficientStockError(
        row.failureMessage ?? 'Insufficient stock.'
      );
    }
  }

  const existing = await getOrderByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    await assertIdempotencyCompatible(existing);
    await ensureOrderCreatedCanonicalEvent(existing);
    return {
      order: existing,
      isNew: false,
      totalCents: requireTotalCents(existing),
    };
  }

  const preparedShipping = await prepareCheckoutShipping({
    shipping: shipping ?? null,
    locale,
    country: country ?? null,
    currency,
    shippingQuoteFingerprint,
    requireShippingQuoteFingerprint,
  });

  const uniqueProductIds = Array.from(
    new Set(normalizedItems.map(i => i.productId))
  );
  const dbProducts = await getProductsForCheckout(uniqueProductIds, currency);

  if (dbProducts.length !== uniqueProductIds.length) {
    throw new InvalidPayloadError('Some products are unavailable or inactive.');
  }

  const productMap = new Map(dbProducts.map(p => [p.id, p]));
  const variantMap = new Map(
    dbProducts.map(p => [
      p.id,
      {
        allowedSizes: parseVariantList((p as any).sizes),
        allowedColors: parseVariantList((p as any).colors),
      },
    ])
  );

  for (const item of normalizedItems) {
    const cfg = variantMap.get(item.productId);
    if (!cfg) {
      throw new InvalidPayloadError(
        `Invariant violation: missing variant config for product ${item.productId} (normalizedItems=${normalizedItems.length}, uniqueProductIds=${uniqueProductIds.length}, dbProducts=${dbProducts.length}).`
      );
    }

    const selectedSize = normVariant(item.selectedSize ?? '');
    const selectedColor = normVariant(item.selectedColor ?? '');

    if (selectedSize) {
      if (
        cfg.allowedSizes.length === 0 ||
        !cfg.allowedSizes.includes(selectedSize)
      ) {
        throw new InvalidVariantError('Invalid size selection.', {
          productId: item.productId,
          field: 'selectedSize',
          value: selectedSize,
          allowed: cfg.allowedSizes,
        });
      }
    }

    if (selectedColor) {
      if (
        cfg.allowedColors.length === 0 ||
        !cfg.allowedColors.includes(selectedColor)
      ) {
        throw new InvalidVariantError('Invalid color selection.', {
          productId: item.productId,
          field: 'selectedColor',
          value: selectedColor,
          allowed: cfg.allowedColors,
        });
      }
    }
  }

  const pricedItems = priceItems(normalizedItems, productMap, currency);
  const authoritativePricingFingerprint = createCheckoutPricingFingerprint({
    currency,
    items: pricedItems.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceCents,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
    })),
  });

  if (requirePricingFingerprint) {
    const normalizedPricingFingerprint = pricingFingerprint?.trim() ?? '';

    if (
      !normalizedPricingFingerprint ||
      normalizedPricingFingerprint !== authoritativePricingFingerprint
    ) {
      throw new InvalidPayloadError(
        'Cart pricing changed. Refresh your cart and try again.',
        {
          code: 'CHECKOUT_PRICE_CHANGED',
          details: {
            reason: normalizedPricingFingerprint
              ? 'PRICING_FINGERPRINT_MISMATCH'
              : 'PRICING_FINGERPRINT_MISSING',
          },
        }
      );
    }
  }

  const preparedLegalConsent = resolveCheckoutLegalConsent({
    legalConsent,
    locale,
    country: country ?? null,
  });

  const itemsSubtotalCents = sumLineTotals(
    pricedItems.map(i => i.lineTotalCents)
  );
  const shippingAmountCents =
    preparedShipping.orderSummary.shippingAmountMinor ?? 0;
  const orderTotalCents = sumLineTotals([
    itemsSubtotalCents,
    shippingAmountCents,
  ]);

  const orderCreatedAt = new Date();
  let orderId: string;
  try {
    const [created] = await db
      .insert(orders)
      .values({
        totalAmountMinor: orderTotalCents,
        totalAmount: toDbMoney(orderTotalCents),

        currency,
        itemsSubtotalMinor: itemsSubtotalCents,
        paymentStatus: initialPaymentStatus,
        paymentProvider,
        paymentIntentId: null,
        pspPaymentMethod: resolvedPaymentMethod,
        pspMetadata: buildCheckoutMetadataPatch({}, resolvedPaymentMethod),
        shippingRequired: preparedShipping.orderSummary.shippingRequired,
        shippingPayer: preparedShipping.orderSummary.shippingPayer,
        shippingProvider: preparedShipping.orderSummary.shippingProvider,
        shippingMethodCode: preparedShipping.orderSummary.shippingMethodCode,
        shippingAmountMinor: preparedShipping.orderSummary.shippingAmountMinor,
        shippingStatus: preparedShipping.orderSummary.shippingStatus,
        trackingNumber: null,
        shippingProviderRef: null,

        status: 'CREATED',

        inventoryStatus: 'none',
        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: requestHash,

        stockRestored: false,
        restockedAt: null,
        idempotencyKey,
        userId: userId ?? null,
        createdAt: orderCreatedAt,
        updatedAt: orderCreatedAt,
      })
      .returning({ id: orders.id });

    if (!created) throw new Error('Failed to create order');

    try {
      await ensureOrderLegalConsentSnapshot({
        orderId: created.id,
        snapshot: preparedLegalConsent.snapshot,
      });

      if (preparedShipping.required && preparedShipping.snapshot) {
        try {
          await ensureOrderShippingSnapshot({
            orderId: created.id,
            snapshot: preparedShipping.snapshot,
          });
        } catch (e) {
          // Neon HTTP: no interactive transactions. Do compensating cleanup.
          logError(
            `[createOrderWithItems] orderShipping snapshot insert failed orderId=${created.id}`,
            e
          );
          try {
            await db.delete(orders).where(eq(orders.id, created.id));
          } catch (cleanupErr) {
            logError(
              `[createOrderWithItems] cleanup delete failed orderId=${created.id}`,
              cleanupErr
            );
          }
          throw e;
        }
      }
    } catch (e) {
      // Neon HTTP: no interactive transactions. Do compensating cleanup.
      logError(
        `[createOrderWithItems] order snapshot insert failed orderId=${created.id}`,
        e
      );
      try {
        await db.delete(orders).where(eq(orders.id, created.id));
      } catch (cleanupErr) {
        logError(
          `[createOrderWithItems] cleanup delete failed orderId=${created.id}`,
          cleanupErr
        );
      }
      throw e;
    }

    orderId = created.id;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const existingOrder = await getOrderByIdempotencyKey(db, idempotencyKey);
      if (existingOrder) {
        await assertIdempotencyCompatible(existingOrder);
        if (preparedShipping.required && preparedShipping.snapshot) {
          await ensureOrderShippingSnapshot({
            orderId: existingOrder.id,
            snapshot: preparedShipping.snapshot,
          });
        }
        await ensureOrderCreatedCanonicalEvent(existingOrder);
        return {
          order: existingOrder,
          isNew: false,
          totalCents: requireTotalCents(existingOrder),
        };
      }
    }
    throw error;
  }

  if (pricedItems.length) {
    await db
      .insert(orderItems)
      .values(
        pricedItems.map(item => ({
          orderId,
          productId: item.productId,
          selectedSize: item.selectedSize ?? '',
          selectedColor: item.selectedColor ?? '',
          quantity: item.quantity,

          unitPriceMinor: item.unitPriceCents,
          lineTotalMinor: item.lineTotalCents,

          unitPrice: toDbMoney(item.unitPriceCents),
          lineTotal: toDbMoney(item.lineTotalCents),

          productTitle: item.productTitle ?? null,
          productSlug: item.productSlug ?? null,
          productSku: item.productSku ?? null,
        }))
      )
      .onConflictDoUpdate({
        target: [
          orderItems.orderId,
          orderItems.productId,
          orderItems.selectedSize,
          orderItems.selectedColor,
        ],
        set: {
          quantity: sql`excluded.quantity`,
          unitPriceMinor: sql`excluded.unit_price_minor`,
          lineTotalMinor: sql`excluded.line_total_minor`,
          unitPrice: sql`excluded.unit_price`,
          lineTotal: sql`excluded.line_total`,
          productTitle: sql`excluded.product_title`,
          productSlug: sql`excluded.product_slug`,
          productSku: sql`excluded.product_sku`,
        },
      });
  }

  const now = new Date();
  await db
    .update(orders)
    .set({ inventoryStatus: 'reserving', updatedAt: now })
    .where(eq(orders.id, orderId));

  const itemsToReserve = aggregateReserveByProductId(
    pricedItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
  );

  try {
    for (const item of itemsToReserve) {
      const res = await applyReserveMove(
        orderId,
        item.productId,
        item.quantity
      );
      if (!res.ok) {
        throw new InsufficientStockError(
          `Insufficient stock for product ${item.productId}`
        );
      }
    }

    await db
      .update(orders)
      .set({
        status: 'INVENTORY_RESERVED',
        inventoryStatus: 'reserved',
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    const targetPaymentStatus: PaymentStatus = 'pending';

    const payRes = await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider,
      to: targetPaymentStatus,
      source: 'checkout',
    });

    if (!payRes.applied && payRes.reason !== 'ALREADY_IN_STATE') {
      throw new OrderStateInvalidError(
        'Order paymentStatus transition blocked after inventory reservation.',
        {
          orderId,
          details: {
            reason: payRes.reason,
            from: payRes.from,
            to: targetPaymentStatus,
            paymentProvider,
          },
        }
      );
    }
  } catch (e) {
    const failAt = new Date();

    await db
      .update(orders)
      .set({ inventoryStatus: 'release_pending', updatedAt: failAt })
      .where(eq(orders.id, orderId));

    const isOos = e instanceof InsufficientStockError;

    await db
      .update(orders)
      .set({
        status: 'INVENTORY_FAILED',
        inventoryStatus: 'release_pending',
        failureCode: isOos ? 'OUT_OF_STOCK' : 'INTERNAL_ERROR',
        failureMessage: isOos
          ? e.message
          : 'Checkout failed after reservation attempt.',
        updatedAt: failAt,
      })
      .where(eq(orders.id, orderId));

    try {
      await restockOrder(orderId, {
        reason: 'failed',
        workerId: 'createOrderWithItems',
      });
    } catch (restockErr) {
      logError(
        `[createOrderWithItems] restock failed orderId=${orderId}`,
        restockErr
      );
    }

    throw e;
  }

  const order = await getOrderById(orderId);
  await ensureOrderCreatedCanonicalEvent(order);
  return { order, isNew: true, totalCents: orderTotalCents };
}
