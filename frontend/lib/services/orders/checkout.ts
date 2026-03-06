import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { coercePriceFromDb } from '@/db/queries/shop/orders';
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
import { getShopShippingFlags } from '@/lib/env/nova-poshta';
import { getShopLegalVersions } from '@/lib/env/shop-legal';
import { isPaymentsEnabled } from '@/lib/env/stripe';
import { logError, logWarn } from '@/lib/logging';
import { resolveShippingAvailability } from '@/lib/services/shop/shipping/availability';
import { resolveCurrencyFromLocale } from '@/lib/shop/currency';
import { localeToCountry } from '@/lib/shop/locale';
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

async function reconcileNoPaymentOrder(
  orderId: string
): Promise<OrderSummaryWithMinor> {
  const [row] = await db
    .select({
      id: orders.id,
      paymentStatus: orders.paymentStatus,
      paymentProvider: orders.paymentProvider,
      paymentIntentId: orders.paymentIntentId,
      inventoryStatus: orders.inventoryStatus,
      stockRestored: orders.stockRestored,
      restockedAt: orders.restockedAt,
      failureCode: orders.failureCode,
      failureMessage: orders.failureMessage,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) throw new OrderNotFoundError('Order not found');

  const provider = resolvePaymentProvider({
    paymentProvider: row.paymentProvider,
    paymentIntentId: row.paymentIntentId,
    paymentStatus: row.paymentStatus as PaymentStatus,
  });

  if (provider !== 'none') return getOrderById(orderId);

  if (row.paymentIntentId) {
    throw new OrderStateInvalidError(
      `Order ${orderId} is inconsistent: paymentProvider=none but paymentIntentId is set`,
      { orderId }
    );
  }

  if (row.inventoryStatus === 'reserved') {
    return getOrderById(orderId);
  }

  if (row.inventoryStatus === 'release_pending') {
    try {
      await restockOrder(orderId, {
        reason: 'failed',
        workerId: 'reconcileNoPaymentOrder',
      });
    } catch (restockErr) {
      logError(
        `[reconcileNoPaymentOrder] restock failed orderId=${orderId}`,
        restockErr
      );
    }

    throw new InsufficientStockError(
      row.failureMessage ?? 'Order cannot be completed (release pending).'
    );
  }
  if (
    row.inventoryStatus === 'released' ||
    row.stockRestored ||
    row.restockedAt !== null
  ) {
    throw new InsufficientStockError(
      'Order cannot be completed (stock restored).'
    );
  }

  const items = await db
    .select({
      productId: orderItems.productId,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  if (!items.length) {
    throw new InvalidPayloadError('Order has no items.');
  }

  const now = new Date();
  await db
    .update(orders)
    .set({ inventoryStatus: 'reserving', updatedAt: now })
    .where(
      and(
        eq(orders.id, orderId),
        ne(orders.inventoryStatus, 'reserved'),
        ne(orders.inventoryStatus, 'released')
      )
    );

  const itemsToReserve = aggregateReserveByProductId(items);

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
        status: 'PAID',
        inventoryStatus: 'reserved',
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    const payRes = await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider: 'none',
      to: 'paid',
      source: 'checkout',
    });

    if (!payRes.applied && payRes.reason !== 'ALREADY_IN_STATE') {
      throw new OrderStateInvalidError(
        'Order paymentStatus transition blocked after reservation.',
        { orderId, details: { reason: payRes.reason, from: payRes.from } }
      );
    }

    return getOrderById(orderId);
  } catch (e) {
    const failAt = new Date();
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
        workerId: 'reconcileNoPaymentOrder',
      });
    } catch (restockErr) {
      logError(
        `[reconcileNoPaymentOrder] restock failed orderId=${orderId}`,
        restockErr
      );
    }

    throw e;
  }
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

      price: productPrices.price,

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

function normalizeLegalVersion(
  raw: string | undefined,
  fallback: string
): string {
  const normalized = (raw ?? '').trim();
  return normalized.length > 0 ? normalized : fallback;
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
    country: args.country ?? localeToCountry(args.locale),
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

  const snapshot: Record<string, unknown> = {
    provider: 'nova_poshta',
    methodCode,
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
      email: args.shipping.recipient.email ?? null,
      comment: args.shipping.recipient.comment ?? null,
    },
  };

  return {
    required: true,
    hashRefs: {
      provider: 'nova_poshta',
      methodCode,
      cityRef,
      warehouseRef: warehouse?.ref ?? warehouseRef ?? null,
    },
    orderSummary: {
      shippingRequired: true,
      shippingPayer: 'customer',
      shippingProvider: 'nova_poshta',
      shippingMethodCode: methodCode,
      shippingAmountMinor: null,
      shippingStatus: 'pending',
    },
    snapshot,
  };
}

function resolveCheckoutLegalConsent(args: {
  legalConsent?: CheckoutLegalConsentInput | null;
  locale: string | null | undefined;
  country: string | null | undefined;
}): PreparedLegalConsent {
  const versions = getShopLegalVersions();

  const termsAccepted = args.legalConsent?.termsAccepted ?? true;
  const privacyAccepted = args.legalConsent?.privacyAccepted ?? true;

  if (!termsAccepted) {
    throw new InvalidPayloadError('Terms must be accepted before checkout.', {
      code: 'TERMS_NOT_ACCEPTED',
    });
  }

  if (!privacyAccepted) {
    throw new InvalidPayloadError('Privacy policy must be accepted.', {
      code: 'PRIVACY_NOT_ACCEPTED',
    });
  }

  const termsVersion = normalizeLegalVersion(
    args.legalConsent?.termsVersion,
    versions.termsVersion
  );
  const privacyVersion = normalizeLegalVersion(
    args.legalConsent?.privacyVersion,
    versions.privacyVersion
  );

  const consentedAt = new Date();
  const source =
    args.legalConsent == null ? 'checkout_implicit' : 'checkout_explicit';
  const normalizedLocale = normVariant(args.locale).toLowerCase() || null;
  const normalizedCountry = normalizeCountryCode(
    args.country ?? localeToCountry(args.locale)
  );

  return {
    hashRefs: {
      termsAccepted: true,
      privacyAccepted: true,
      termsVersion,
      privacyVersion,
    },
    snapshot: {
      termsAccepted: true,
      privacyAccepted: true,
      termsVersion,
      privacyVersion,
      consentedAt,
      source,
      locale: normalizedLocale,
      country: normalizedCountry,
    },
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
    if (
      !product.priceCurrency ||
      (product.priceMinor == null && product.price == null)
    ) {
      throw new PriceConfigError('Price not configured for currency.', {
        productId: product.id,
        currency,
      });
    }

    let unitPriceCents: number | null = null;
    if (product.priceMinor !== null && product.priceMinor !== undefined) {
      if (
        !isStrictNonNegativeInt(product.priceMinor) ||
        product.priceMinor <= 0
      ) {
        throw new InvalidPayloadError('Product pricing is misconfigured.');
      }
      unitPriceCents = product.priceMinor;
    }
    if (unitPriceCents == null) {
      const unitPrice = coercePriceFromDb(product.price, {
        field: 'price',
        productId: product.id,
      });
      if (unitPrice <= 0) {
        throw new InvalidPayloadError('Product pricing is misconfigured.');
      }
      unitPriceCents = Math.round(unitPrice * 100);
    }

    if (unitPriceCents <= 0) {
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
  const raw = (process.env.SHOP_MONOBANK_GPAY_ENABLED ?? '')
    .trim()
    .toLowerCase();
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
  paymentProvider: requestedProvider,
  paymentMethod: requestedMethod,
}: {
  items: CheckoutItem[];
  idempotencyKey: string;
  userId?: string | null;
  locale: string | null | undefined;
  country?: string | null;
  shipping?: CheckoutShippingInput | null;
  legalConsent?: CheckoutLegalConsentInput | null;
  paymentProvider?: PaymentProvider;
  paymentMethod?: PaymentMethod | null;
}): Promise<CheckoutResult> {
  const isMonobankRequested = requestedProvider === 'monobank';
  const currency: Currency = isMonobankRequested
    ? 'UAH'
    : resolveCurrencyFromLocale(locale);
  const stripePaymentsEnabled = isPaymentsEnabled();
  const paymentProvider: PaymentProvider =
    requestedProvider === 'monobank'
      ? 'monobank'
      : stripePaymentsEnabled
        ? 'stripe'
        : 'none';
  const paymentsEnabled =
    paymentProvider === 'monobank' ? true : stripePaymentsEnabled;

  const initialPaymentStatus: PaymentStatus =
    paymentProvider === 'none' ? 'paid' : 'pending';
  const resolvedPaymentMethod = resolveCheckoutPaymentMethod({
    requestedMethod,
    paymentProvider,
    currency,
  });

  const normalizedItems = mergeCheckoutItems(items).map(item =>
    normalizeCheckoutItem(item)
  );

  const preparedShipping = await prepareCheckoutShipping({
    shipping: shipping ?? null,
    locale,
    country: country ?? null,
    currency,
  });
  const preparedLegalConsent = resolveCheckoutLegalConsent({
    legalConsent: legalConsent ?? null,
    locale,
    country: country ?? null,
  });

  const requestHash = hashIdempotencyRequest({
    items: normalizedItems,
    currency,
    locale: locale ?? null,
    paymentProvider,
    paymentMethod: resolvedPaymentMethod,
    shipping: preparedShipping.hashRefs,
    legalConsent: preparedLegalConsent.hashRefs,
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
    const [existingLegalConsentRow] = await db
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
      throw new IdempotencyConflictError(
        'Idempotency key cannot be replayed because persisted legal consent evidence is missing.',
        {
          orderId: row.id,
          reason: 'LEGAL_CONSENT_MISSING',
        }
      );
    }

    const existingCityRef = readShippingRefFromSnapshot(
      existingShippingRow?.shippingAddress,
      'cityRef'
    );
    const existingWarehouseRef = readShippingRefFromSnapshot(
      existingShippingRow?.shippingAddress,
      'warehouseRef'
    );
    const existingLegalHashRefs = {
      termsAccepted: existingLegalConsentRow.termsAccepted,
      privacyAccepted: existingLegalConsentRow.privacyAccepted,
      termsVersion: existingLegalConsentRow.termsVersion,
      privacyVersion: existingLegalConsentRow.privacyVersion,
    };

    if (
      existingLegalHashRefs.termsAccepted !==
        preparedLegalConsent.hashRefs.termsAccepted ||
      existingLegalHashRefs.privacyAccepted !==
        preparedLegalConsent.hashRefs.privacyAccepted ||
      existingLegalHashRefs.termsVersion !==
        preparedLegalConsent.hashRefs.termsVersion ||
      existingLegalHashRefs.privacyVersion !==
        preparedLegalConsent.hashRefs.privacyVersion
    ) {
      throw new IdempotencyConflictError(
        'Idempotency key already used with different legal consent.',
        {
          existing: existingLegalHashRefs,
          requested: preparedLegalConsent.hashRefs,
        }
      );
    }

    const existingProvider = resolvePaymentProvider({
      paymentProvider: row.paymentProvider,
      paymentIntentId: existing.paymentIntentId ?? null,
      paymentStatus: row.paymentStatus,
    });
    const existingMethod =
      normalizeStoredPaymentMethod(row.pspPaymentMethod) ??
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
    if (preparedShipping.required && preparedShipping.snapshot) {
      await ensureOrderShippingSnapshot({
        orderId: existing.id,
        snapshot: preparedShipping.snapshot,
      });
    }
    if (!paymentsEnabled) {
      const reconciled = await reconcileNoPaymentOrder(existing.id);
      return {
        order: reconciled,
        isNew: false,
        totalCents: requireTotalCents(reconciled),
      };
    }
    return {
      order: existing,
      isNew: false,
      totalCents: requireTotalCents(existing),
    };
  }
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
  const orderTotalCents = sumLineTotals(pricedItems.map(i => i.lineTotalCents));

  let orderId: string;
  try {
    const [created] = await db
      .insert(orders)
      .values({
        totalAmountMinor: orderTotalCents,
        totalAmount: toDbMoney(orderTotalCents),

        currency,
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

        inventoryStatus: paymentsEnabled ? 'none' : 'reserving',
        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: requestHash,

        stockRestored: false,
        restockedAt: null,
        idempotencyKey,
        userId: userId ?? null,
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
        if (!paymentsEnabled) {
          const reconciled = await reconcileNoPaymentOrder(existingOrder.id);
          return {
            order: reconciled,
            isNew: false,
            totalCents: requireTotalCents(reconciled),
          };
        }
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
        status: paymentsEnabled ? 'INVENTORY_RESERVED' : 'PAID',
        inventoryStatus: 'reserved',
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    const targetPaymentStatus: PaymentStatus =
      paymentProvider === 'none' ? 'paid' : 'pending';

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
  return { order, isNew: true, totalCents: orderTotalCents };
}
