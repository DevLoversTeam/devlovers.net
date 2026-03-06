'use client';

import { Loader2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Loader } from '@/components/shared/Loader';
import { useCart } from '@/components/shop/CartProvider';
import { Link, useRouter } from '@/i18n/routing';
import {
  buildCheckoutShippingPayload,
  type CheckoutDeliveryMethodCode,
  type ShippingAvailabilityReasonCode,
} from '@/lib/services/shop/shipping/checkout-payload';
import { formatMoney } from '@/lib/shop/currency';
import { generateIdempotencyKey } from '@/lib/shop/idempotency';
import { localeToCountry } from '@/lib/shop/locale';
import {
  SHOP_CHIP_BORDER_HOVER,
  SHOP_CHIP_INTERACTIVE,
  SHOP_CHIP_SHADOW_HOVER,
  SHOP_CTA_BASE,
  SHOP_CTA_INSET,
  SHOP_CTA_INTERACTIVE,
  SHOP_CTA_WAVE,
  SHOP_DISABLED,
  SHOP_FOCUS,
  SHOP_LINK_BASE,
  SHOP_LINK_MD,
  SHOP_LINK_XS,
  SHOP_STEPPER_BUTTON_BASE,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

const SHOP_PRODUCT_LINK = cn(
  'block truncate',
  SHOP_LINK_BASE,
  SHOP_LINK_MD,
  SHOP_FOCUS
);

const SHOP_STEPPER_BTN = cn(
  SHOP_STEPPER_BUTTON_BASE,
  'h-8 w-8',
  SHOP_CHIP_INTERACTIVE,
  SHOP_CHIP_SHADOW_HOVER,
  SHOP_CHIP_BORDER_HOVER,
  SHOP_FOCUS,
  SHOP_DISABLED
);

const SHOP_HERO_CTA = cn(
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED,
  'w-full justify-center gap-2 px-6 py-3 text-sm text-white',
  'shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]'
);

const ORDERS_LINK = cn(SHOP_LINK_BASE, SHOP_LINK_MD, SHOP_FOCUS);

const ORDERS_COUNT_BADGE = cn(
  'border-border bg-muted/40 text-foreground inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums'
);

const ORDERS_CARD = cn('border-border rounded-md border p-4');

type Props = {
  stripeEnabled: boolean;
  monobankEnabled: boolean;
  monobankGooglePayEnabled: boolean;
};

type CheckoutProvider = 'stripe' | 'monobank';
type CheckoutPaymentMethod =
  | 'stripe_card'
  | 'monobank_invoice'
  | 'monobank_google_pay';

function resolveInitialProvider(args: {
  stripeEnabled: boolean;
  monobankEnabled: boolean;
  currency: string | null | undefined;
}): CheckoutProvider {
  const isUah = args.currency === 'UAH';
  const canUseStripe = args.stripeEnabled;
  const canUseMonobank = args.monobankEnabled && isUah;

  if (canUseMonobank) return 'monobank';
  if (canUseStripe) return 'stripe';
  return 'stripe';
}

function resolveDefaultMethodForProvider(args: {
  provider: CheckoutProvider;
}): CheckoutPaymentMethod {
  if (args.provider === 'stripe') return 'stripe_card';
  return 'monobank_invoice';
}

type OrdersSummaryState = {
  count: number;
  latestOrderId: string | null;
};

type ShippingMethod = {
  provider: 'nova_poshta';
  methodCode: CheckoutDeliveryMethodCode;
  title: string;
};

type ShippingCity = {
  ref: string;
  nameUa: string;
};

type ShippingWarehouse = {
  ref: string;
  name: string;
  address: string | null;
};

function normalizeLookupValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normalizeShippingCity(raw: unknown): ShippingCity | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const item = raw as Record<string, unknown>;

  const ref = typeof item.ref === 'string' ? item.ref.trim() : '';

  const rawName =
    typeof item.nameUa === 'string'
      ? item.nameUa
      : typeof item.name_ua === 'string'
        ? item.name_ua
        : typeof item.name === 'string'
          ? item.name
          : typeof item.present === 'string'
            ? item.present
            : '';

  const nameUa = rawName.trim();

  if (!ref || !nameUa) {
    return null;
  }

  return {
    ref,
    nameUa,
  };
}

function parseShippingCitiesResponse(data: unknown): {
  available: boolean | null;
  items: ShippingCity[];
} {
  if (Array.isArray(data)) {
    return {
      available: null,
      items: data
        .map(normalizeShippingCity)
        .filter((item): item is ShippingCity => item !== null),
    };
  }

  if (!data || typeof data !== 'object') {
    return {
      available: null,
      items: [],
    };
  }

  const obj = data as Record<string, unknown>;
  const itemsRaw = Array.isArray(obj.items) ? obj.items : [];

  return {
    available: typeof obj.available === 'boolean' ? obj.available : null,
    items: itemsRaw
      .map(normalizeShippingCity)
      .filter((item): item is ShippingCity => item !== null),
  };
}

function isWarehouseMethod(
  methodCode: CheckoutDeliveryMethodCode | null
): boolean {
  return methodCode === 'NP_WAREHOUSE' || methodCode === 'NP_LOCKER';
}

export default function CartPage({
  stripeEnabled,
  monobankEnabled,
  monobankGooglePayEnabled,
}: Props) {
  const { cart, updateQuantity, removeFromCart } = useCart();
  const router = useRouter();
  const t = useTranslations('shop.cart');
  const tOrders = useTranslations('shop.orders');
  const tColors = useTranslations('shop.catalog.colors');

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const [ordersSummary, setOrdersSummary] = useState<OrdersSummaryState | null>(
    null
  );
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);

  const initialProvider = resolveInitialProvider({
    stripeEnabled,
    monobankEnabled,
    currency: cart?.summary?.currency,
  });
  const [selectedProvider, setSelectedProvider] =
    useState<CheckoutProvider>(initialProvider);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<CheckoutPaymentMethod>(() =>
      resolveDefaultMethodForProvider({
        provider: initialProvider,
      })
    );
  const [isClientReady, setIsClientReady] = useState(false);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingMethodsLoading, setShippingMethodsLoading] = useState(true);
  const [shippingAvailable, setShippingAvailable] = useState(true);
  const [shippingReasonCode, setShippingReasonCode] =
    useState<ShippingAvailabilityReasonCode | null>(null);
  const [selectedShippingMethod, setSelectedShippingMethod] =
    useState<CheckoutDeliveryMethodCode | null>(null);

  const [cityQuery, setCityQuery] = useState('');
  const [cityOptions, setCityOptions] = useState<ShippingCity[]>([]);
  const [selectedCityRef, setSelectedCityRef] = useState<string | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const [warehouseQuery, setWarehouseQuery] = useState('');
  const [warehouseOptions, setWarehouseOptions] = useState<ShippingWarehouse[]>(
    []
  );
  const [selectedWarehouseRef, setSelectedWarehouseRef] = useState<
    string | null
  >(null);
  const [selectedWarehouseName, setSelectedWarehouseName] = useState<
    string | null
  >(null);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  const [courierAddressLine1, setCourierAddressLine1] = useState('');
  const [courierAddressLine2, setCourierAddressLine2] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientComment, setRecipientComment] = useState('');

  const [deliveryUiError, setDeliveryUiError] = useState<string | null>(null);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  const params = useParams<{ locale?: string }>();
  const locale = params.locale ?? 'en';
  const shopBase = '/shop';
  const isUahCheckout = cart.summary.currency === 'UAH';
  const canUseStripe = stripeEnabled;
  const canUseMonobank = monobankEnabled && isUahCheckout;
  const canUseMonobankGooglePay = canUseMonobank && monobankGooglePayEnabled;
  const hasSelectableProvider = canUseStripe || canUseMonobank;
  const country = localeToCountry(locale);
  const shippingUnavailableHardBlock =
    shippingReasonCode === 'SHOP_SHIPPING_DISABLED' ||
    shippingReasonCode === 'NP_DISABLED' ||
    shippingReasonCode === 'COUNTRY_NOT_SUPPORTED' ||
    shippingReasonCode === 'CURRENCY_NOT_SUPPORTED' ||
    shippingReasonCode === 'INTERNAL_ERROR';
  const isWarehouseSelectionMethod = isWarehouseMethod(selectedShippingMethod);
  const safeT = (key: string, fallback: string) => {
    try {
      return t(key as any);
    } catch {
      return fallback;
    }
  };

  const SHIPPING_AVAILABILITY_REASON_TO_T_KEY: Record<string, string> = {
    SHOP_SHIPPING_DISABLED: 'delivery.unavailable.shopShippingDisabled',
    NP_DISABLED: 'delivery.unavailable.npDisabled',
    COUNTRY_NOT_SUPPORTED: 'delivery.unavailable.countryNotSupported',
    CURRENCY_NOT_SUPPORTED: 'delivery.unavailable.currencyNotSupported',
    INTERNAL_ERROR: 'delivery.unavailable.internalError',
  };

  const resolveShippingUnavailableText = (
    code: ShippingAvailabilityReasonCode | null
  ): string | null => {
    if (!code || code === 'OK') return null;
    const key =
      SHIPPING_AVAILABILITY_REASON_TO_T_KEY[String(code)] ??
      'delivery.unavailableFallback';
    return safeT(key, String(code));
  };

  const SHIPPING_PAYLOAD_ERROR_CODE_TO_T_KEY: Record<string, string> = {
    SHIPPING_METHOD_REQUIRED: 'delivery.validation.methodRequired',
    CITY_REQUIRED: 'delivery.validation.cityRequired',
    WAREHOUSE_REQUIRED: 'delivery.validation.warehouseRequired',
    ADDRESS_REQUIRED: 'delivery.validation.addressRequired',
    RECIPIENT_NAME_REQUIRED: 'delivery.validation.recipientNameRequired',
    RECIPIENT_PHONE_REQUIRED: 'delivery.validation.recipientPhoneRequired',
    RECIPIENT_EMAIL_INVALID: 'delivery.validation.recipientEmailInvalid',
  };

  const resolveShippingPayloadErrorText = (result: unknown): string => {
    const code =
      result && typeof result === 'object' && 'code' in result
        ? typeof (result as any).code === 'string'
          ? String((result as any).code)
          : null
        : null;

    const key = code ? SHIPPING_PAYLOAD_ERROR_CODE_TO_T_KEY[code] : null;

    if (key) return safeT(key, code ?? 'SHIPPING_INVALID');
    return safeT('delivery.validation.invalid', code ?? 'SHIPPING_INVALID');
  };
  const clearCheckoutUiErrors = () => {
    setDeliveryUiError(null);
    setCheckoutError(null);
  };

  useEffect(() => {
    if (selectedProvider === 'stripe' && !canUseStripe && canUseMonobank) {
      setSelectedProvider('monobank');
      return;
    }
    if (selectedProvider === 'monobank' && !canUseMonobank && canUseStripe) {
      setSelectedProvider('stripe');
    }
  }, [canUseMonobank, canUseStripe, selectedProvider]);

  useEffect(() => {
    if (selectedProvider === 'stripe') {
      if (selectedPaymentMethod !== 'stripe_card') {
        setSelectedPaymentMethod('stripe_card');
      }
      return;
    }

    if (
      selectedPaymentMethod === 'monobank_google_pay' &&
      !canUseMonobankGooglePay
    ) {
      setSelectedPaymentMethod('monobank_invoice');
      return;
    }

    if (
      selectedPaymentMethod !== 'monobank_invoice' &&
      selectedPaymentMethod !== 'monobank_google_pay'
    ) {
      setSelectedPaymentMethod(
        resolveDefaultMethodForProvider({
          provider: 'monobank',
        })
      );
    }
  }, [canUseMonobankGooglePay, selectedPaymentMethod, selectedProvider]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadShippingMethods() {
      setShippingMethodsLoading(true);
      setDeliveryUiError(null);

      try {
        const qs = new URLSearchParams({
          locale,
          currency: cart.summary.currency,
          ...(country ? { country } : {}),
        });

        const response = await fetch(`/api/shop/shipping/methods?${qs}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          if (!cancelled) {
            setShippingAvailable(false);
            setShippingReasonCode('INTERNAL_ERROR');
            setShippingMethods([]);
          }
          return;
        }

        const VALID_REASON_CODES = new Set<string>([
          'OK',
          'SHOP_SHIPPING_DISABLED',
          'NP_DISABLED',
          'COUNTRY_NOT_SUPPORTED',
          'CURRENCY_NOT_SUPPORTED',
          'INTERNAL_ERROR',
        ]);

        const hardBlock = () => {
          setShippingAvailable(false);
          setShippingReasonCode('INTERNAL_ERROR');
          setShippingMethods([]);
          setSelectedShippingMethod(null);
        };

        if (cancelled) return;

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          hardBlock();
          return;
        }

        const obj = data as Record<string, unknown>;

        if (typeof obj.available !== 'boolean') {
          hardBlock();
          return;
        }

        const available = obj.available;

        const reasonRaw = obj.reasonCode;
        const reasonCode =
          typeof reasonRaw === 'string' && VALID_REASON_CODES.has(reasonRaw)
            ? (reasonRaw as ShippingAvailabilityReasonCode)
            : null;

        const methodsRaw = obj.methods;
        if (!Array.isArray(methodsRaw)) {
          hardBlock();
          return;
        }

        const methods: ShippingMethod[] = [];
        for (const item of methodsRaw) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            hardBlock();
            return;
          }
          const m = item as Record<string, unknown>;

          const providerOk = m.provider === 'nova_poshta';
          const methodCodeOk =
            typeof m.methodCode === 'string' && m.methodCode.trim().length > 0;
          const titleOk =
            typeof m.title === 'string' && m.title.trim().length > 0;

          if (!providerOk || !methodCodeOk || !titleOk) {
            hardBlock();
            return;
          }

          methods.push({
            provider: 'nova_poshta',
            methodCode: m.methodCode as CheckoutDeliveryMethodCode,
            title: String(m.title),
          });
        }

        if (available === false && reasonCode == null) {
          hardBlock();
          return;
        }

        setShippingAvailable(available);
        setShippingReasonCode(reasonCode);
        setShippingMethods(methods);

        if (!available || methods.length === 0) {
          setSelectedShippingMethod(null);
          return;
        }

        setSelectedShippingMethod(current => {
          if (
            current &&
            methods.some(method => method.methodCode === current)
          ) {
            return current;
          }
          return methods[0]!.methodCode;
        });
      } catch {
        if (!cancelled) {
          setShippingAvailable(false);
          setShippingReasonCode('INTERNAL_ERROR');
          setShippingMethods([]);
        }
      } finally {
        if (!cancelled) {
          setShippingMethodsLoading(false);
        }
      }
    }

    void loadShippingMethods();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cart.summary.currency, country, locale]);

  useEffect(() => {
    setSelectedWarehouseRef(null);
    setSelectedWarehouseName(null);
    setWarehouseOptions([]);
    setWarehouseQuery('');
  }, [selectedCityRef, selectedShippingMethod]);

  useEffect(() => {
    if (!shippingAvailable) {
      setCityOptions([]);
      setCitiesLoading(false);
      return;
    }

    const query = cityQuery.trim();
    if (query.length < 2) {
      setCityOptions([]);
      setCitiesLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const timeoutId = setTimeout(async () => {
      setCitiesLoading(true);

      try {
        const qs = new URLSearchParams({
          q: query,
          locale,
          currency: cart.summary.currency,
          ...(country ? { country } : {}),
        });

        const response = await fetch(
          `/api/shop/shipping/np/cities?${qs.toString()}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => null);
        const parsed = parseShippingCitiesResponse(data);

        if (!response.ok || parsed.available === false) {
          if (!cancelled) {
            setCityOptions([]);
          }
          return;
        }

        if (!cancelled) {
          const next = parsed.items;
          const normalizedQuery = normalizeLookupValue(query);

          const exactMatches = next.filter(
            city => normalizeLookupValue(city.nameUa) === normalizedQuery
          );

          if (exactMatches.length === 1) {
            const exactCity = exactMatches[0]!;
            setSelectedCityRef(exactCity.ref);
            setSelectedCityName(exactCity.nameUa);
            setCityOptions([]);
          } else {
            setCityOptions(next);
          }
        }
      } catch {
        if (!cancelled) {
          setCityOptions([]);
        }
      } finally {
        if (!cancelled) {
          setCitiesLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [cart.summary.currency, cityQuery, country, locale, shippingAvailable]);

  useEffect(() => {
    if (!shippingAvailable || !selectedCityRef || !isWarehouseSelectionMethod) {
      setWarehouseOptions([]);
      setWarehousesLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setWarehousesLoading(true);
      try {
        const qs = new URLSearchParams({
          cityRef: selectedCityRef,
          locale,
          currency: cart.summary.currency,
          ...(country ? { country } : {}),
          ...(warehouseQuery.trim().length > 0
            ? { q: warehouseQuery.trim() }
            : {}),
        });

        const response = await fetch(
          `/api/shop/shipping/np/warehouses?${qs.toString()}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok || !data || data.available === false) {
          if (!cancelled) {
            setWarehouseOptions([]);
          }
          return;
        }

        if (!cancelled) {
          const next = Array.isArray(data.items)
            ? (data.items as ShippingWarehouse[])
            : [];
          setWarehouseOptions(next);
        }
      } catch {
        if (!cancelled) {
          setWarehouseOptions([]);
        }
      } finally {
        if (!cancelled) {
          setWarehousesLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [
    cart.summary.currency,
    country,
    isWarehouseSelectionMethod,
    locale,
    selectedCityRef,
    shippingAvailable,
    warehouseQuery,
  ]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadOrdersSummary() {
      setIsOrdersLoading(true);

      const timeoutId = setTimeout(() => controller.abort(), 2500);

      try {
        const res = await fetch('/api/shop/orders', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });

        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setOrdersSummary(null);
          }
          return;
        }

        const devWarn = (message: string, meta: Record<string, unknown>) => {
          if (process.env.NODE_ENV === 'production') return;

          const g = globalThis as unknown as {
            __DEVLOVERS_SHOP_DEBUG_LOGS__?: Array<{
              level: 'warn';
              message: string;
              meta: Record<string, unknown>;
              ts: number;
            }>;
          };

          if (!g.__DEVLOVERS_SHOP_DEBUG_LOGS__) {
            g.__DEVLOVERS_SHOP_DEBUG_LOGS__ = [];
          }

          g.__DEVLOVERS_SHOP_DEBUG_LOGS__.push({
            level: 'warn',
            message,
            meta,
            ts: Date.now(),
          });
        };

        let rawBody: string | null = null;
        let data: unknown = null;
        let parseError: unknown = null;

        try {
          rawBody = await res.text();
          if (rawBody && rawBody.trim().length > 0) {
            try {
              data = JSON.parse(rawBody) as unknown;
            } catch (err) {
              parseError = err;
              data = null;
            }
          }
        } catch (err) {
          parseError = err;
          data = null;
        }

        const bodyPreview = rawBody ? rawBody.slice(0, 500) : null;
        const parseErrorMessage =
          parseError instanceof Error
            ? parseError.message
            : parseError
              ? String(parseError)
              : null;

        if (!res.ok) {
          devWarn('[shop.cart] orders summary fetch non-OK', {
            status: res.status,
            statusText: res.statusText,
            bodyPreview,
            parseError: parseErrorMessage,
          });
          return;
        }

        if (!data || typeof data !== 'object') {
          devWarn('[shop.cart] orders summary fetch invalid JSON', {
            status: res.status,
            statusText: res.statusText,
            bodyType: data === null ? 'null' : typeof data,
            bodyPreview,
            parseError: parseErrorMessage,
          });
          return;
        }

        const maybe = data as {
          success?: unknown;
          orders?: unknown;
          totalCount?: unknown;
        };

        if (maybe.success !== true || !Array.isArray(maybe.orders)) {
          devWarn('[shop.cart] orders summary fetch unexpected shape', {
            status: res.status,
            statusText: res.statusText,
            bodyPreview,
          });
          return;
        }

        const orders = maybe.orders as Array<{ id?: unknown }>;

        const totalCountRaw = maybe.totalCount;
        const totalCountNum =
          typeof totalCountRaw === 'number'
            ? totalCountRaw
            : typeof totalCountRaw === 'string'
              ? Number(totalCountRaw)
              : typeof totalCountRaw === 'bigint'
                ? Number(totalCountRaw)
                : NaN;

        const count = Number.isFinite(totalCountNum)
          ? Math.max(0, Math.trunc(totalCountNum))
          : orders.length;

        const latestOrderId =
          typeof orders[0]?.id === 'string' ? orders[0].id : null;

        if (!cancelled) {
          setOrdersSummary({ count, latestOrderId });
        }
      } catch {
        // ignore (timeout/network) — we just don't show summary
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) {
          setIsOrdersLoading(false);
        }
      }
    }

    void loadOrdersSummary();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const translateColor = (color: string | null | undefined): string | null => {
    if (!color) return null;
    const colorSlug = color.toLowerCase();
    try {
      return tColors(colorSlug);
    } catch {
      return color;
    }
  };

  async function handleCheckout() {
    if (!hasSelectableProvider) {
      setCheckoutError(t('checkout.paymentMethod.noAvailable'));
      return;
    }
    if (selectedProvider === 'stripe' && !canUseStripe) {
      setCheckoutError(t('checkout.paymentMethod.noAvailable'));
      return;
    }
    if (selectedProvider === 'monobank' && !canUseMonobank) {
      setCheckoutError(
        monobankEnabled
          ? t('checkout.paymentMethod.monobankUahOnlyHint')
          : t('checkout.paymentMethod.monobankUnavailable')
      );
      return;
    }
    if (
      selectedProvider === 'monobank' &&
      selectedPaymentMethod === 'monobank_google_pay' &&
      !canUseMonobankGooglePay
    ) {
      setCheckoutError(
        t('checkout.paymentMethod.monobankGooglePayUnavailable')
      );
      return;
    }
    if (shippingMethodsLoading) {
      setCheckoutError(safeT('delivery.methodsLoading', 'METHODS_LOADING'));
      return;
    }

    if (shippingUnavailableHardBlock) {
      setCheckoutError(
        resolveShippingUnavailableText(shippingReasonCode) ??
          safeT('delivery.unavailableFallback', 'SHIPPING_UNAVAILABLE')
      );
      return;
    }

    setCheckoutError(null);
    setDeliveryUiError(null);
    setCreatedOrderId(null);
    setIsCheckingOut(true);

    try {
      const shippingPayloadResult = shippingAvailable
        ? buildCheckoutShippingPayload({
            shippingAvailable,
            reasonCode: shippingReasonCode,
            locale,
            methodCode: selectedShippingMethod,
            cityRef: selectedCityRef,
            warehouseRef: selectedWarehouseRef,
            addressLine1: courierAddressLine1,
            addressLine2: courierAddressLine2,
            recipientFullName: recipientName,
            recipientPhone: recipientPhone,
            recipientEmail,
            recipientComment,
          })
        : null;

      if (shippingPayloadResult && !shippingPayloadResult.ok) {
        const msg = resolveShippingPayloadErrorText(shippingPayloadResult);
        setDeliveryUiError(msg);
        setCheckoutError(msg);
        return;
      }

      const idempotencyKey = generateIdempotencyKey();
      const checkoutPaymentMethod: CheckoutPaymentMethod =
        selectedProvider === 'stripe' ? 'stripe_card' : selectedPaymentMethod;

      const response = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          paymentProvider: selectedProvider,
          paymentMethod: checkoutPaymentMethod,
          ...(shippingPayloadResult?.ok
            ? {
                shipping: shippingPayloadResult.shipping,
                ...(shippingPayloadResult.country
                  ? { country: shippingPayloadResult.country }
                  : {}),
              }
            : {}),
          items: cart.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            selectedSize: item.selectedSize,
            selectedColor: item.selectedColor,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          typeof data?.message === 'string'
            ? data.message
            : typeof data?.error === 'string'
              ? data.error
              : t('checkout.errors.startFailed');
        setCheckoutError(message);
        return;
      }

      if (!data?.orderId) {
        setCheckoutError(t('checkout.errors.unexpectedResponse'));
        return;
      }

      const paymentProvider: string = data.paymentProvider ?? 'none';
      const clientSecret: string | null =
        typeof data.clientSecret === 'string' &&
        data.clientSecret.trim().length > 0
          ? data.clientSecret
          : null;
      const monobankPageUrl: string | null =
        typeof data.pageUrl === 'string' && data.pageUrl.trim().length > 0
          ? data.pageUrl
          : null;
      const statusToken: string | null =
        typeof data.statusToken === 'string' &&
        data.statusToken.trim().length > 0
          ? data.statusToken
          : null;

      const orderId = String(data.orderId);
      setCreatedOrderId(orderId);

      if (paymentProvider === 'stripe' && clientSecret) {
        router.push(
          `${shopBase}/checkout/payment/${encodeURIComponent(
            orderId
          )}?clientSecret=${encodeURIComponent(clientSecret)}&clearCart=1`
        );
        return;
      }

      if (paymentProvider === 'monobank') {
        if (checkoutPaymentMethod === 'monobank_google_pay') {
          if (!statusToken) {
            setCheckoutError(t('checkout.errors.unexpectedResponse'));
            return;
          }

          router.push(
            `${shopBase}/checkout/payment/monobank/${encodeURIComponent(
              orderId
            )}?statusToken=${encodeURIComponent(statusToken)}&clearCart=1`
          );
          return;
        }

        if (!monobankPageUrl) {
          setCheckoutError(t('checkout.errors.unexpectedResponse'));
          return;
        }

        window.location.assign(monobankPageUrl);
        return;
      }

      const paymentsDisabledFlag =
        paymentProvider !== 'stripe' || !clientSecret
          ? '&paymentsDisabled=true'
          : '';

      router.push(
        `${shopBase}/checkout/success?orderId=${encodeURIComponent(
          orderId
        )}&clearCart=1${paymentsDisabledFlag}`
      );
    } catch {
      setCheckoutError(t('checkout.errors.startFailed'));
    } finally {
      setIsCheckingOut(false);
    }
  }

  const shippingUnavailableText =
    resolveShippingUnavailableText(shippingReasonCode);
  const hasValidPaymentSelection =
    selectedProvider === 'stripe'
      ? canUseStripe && selectedPaymentMethod === 'stripe_card'
      : canUseMonobank &&
        (selectedPaymentMethod === 'monobank_invoice' ||
          (selectedPaymentMethod === 'monobank_google_pay' &&
            canUseMonobankGooglePay));
  const canPlaceOrder =
    hasSelectableProvider &&
    hasValidPaymentSelection &&
    !shippingMethodsLoading &&
    !shippingUnavailableHardBlock &&
    (!shippingAvailable || !!selectedShippingMethod);

  const ordersCard = ordersSummary ? (
    <div className={ORDERS_CARD}>
      <div className="flex items-center justify-between gap-3">
        <Link href="/shop/orders" className={ORDERS_LINK}>
          {tOrders('title')}
        </Link>

        {isOrdersLoading ? (
          <Loader2
            className="text-muted-foreground h-4 w-4 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <span className={ORDERS_COUNT_BADGE} aria-live="polite">
            {ordersSummary.count}
          </span>
        )}
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        {tOrders('subtitle')}
      </p>

      {ordersSummary.latestOrderId ? (
        <div className="mt-2">
          <Link
            href={`/shop/orders/${encodeURIComponent(ordersSummary.latestOrderId)}`}
            className={cn(SHOP_LINK_BASE, SHOP_LINK_XS, SHOP_FOCUS)}
          >
            {t('checkout.goToOrder')}
          </Link>
        </div>
      ) : null}
    </div>
  ) : null;
  const loadingAnnouncement = (() => {
    try {
      return t('loading');
    } catch {
      return 'Loading…';
    }
  })();

  if (!isClientReady) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader size={160} className="opacity-90" />
          <span className="sr-only" role="status" aria-live="polite">
            {loadingAnnouncement}
          </span>
        </div>
      </main>
    );
  }

  if (cart.items.length === 0) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center text-center">
          <ShoppingBag
            className="text-muted-foreground h-16 w-16"
            aria-hidden="true"
          />
          <h1 className="text-foreground mt-6 text-3xl font-bold tracking-tight">
            {t('empty')}
          </h1>
          <p className="text-muted-foreground mt-4">{t('emptyDescription')}</p>

          <div className="mx-auto mt-8 w-full max-w-md">
            <Link href="/shop/products" className={SHOP_HERO_CTA}>
              <span
                className="absolute inset-0"
                style={shopCtaGradient(
                  '--shop-hero-btn-bg',
                  '--shop-hero-btn-bg-hover'
                )}
                aria-hidden="true"
              />
              <span
                className={SHOP_CTA_WAVE}
                style={shopCtaGradient(
                  '--shop-hero-btn-bg-hover',
                  '--shop-hero-btn-bg'
                )}
                aria-hidden="true"
              />
              <span className={SHOP_CTA_INSET} aria-hidden="true" />
              <span className="relative z-10">{t('startShopping')}</span>
            </Link>

            {ordersCard ? <div className="mt-6">{ordersCard}</div> : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-foreground text-3xl font-bold tracking-tight">
        {t('title')}
      </h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section aria-label={t('itemsLabel')}>
          <ul className="space-y-4">
            {cart.removed.length > 0 && (
              <li
                className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                role="status"
                aria-live="polite"
              >
                {t('alerts.itemsRemoved')}
              </li>
            )}

            {cart.items.map(item => (
              <li
                key={`${item.productId}-${item.selectedSize ?? 'na'}-${item.selectedColor ?? 'na'}`}
                className="border-border rounded-lg border p-4"
              >
                <article className="flex gap-4">
                  <div className="bg-muted relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={item.imageUrl || '/placeholder.svg'}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>

                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/shop/products/${item.slug}`}
                          className={SHOP_PRODUCT_LINK}
                        >
                          {item.title}
                        </Link>

                        {(item.selectedSize || item.selectedColor) && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {[
                              translateColor(item.selectedColor),
                              item.selectedSize,
                            ]
                              .filter(Boolean)
                              .join(' / ')}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(
                            item.productId,
                            item.selectedSize,
                            item.selectedColor
                          )
                        }
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={t('actions.removeItem', {
                          title: item.title,
                        })}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity - 1,
                              item.selectedSize,
                              item.selectedColor
                            )
                          }
                          disabled={item.quantity <= 1}
                          className={SHOP_STEPPER_BTN}
                          aria-label={t('actions.decreaseQty')}
                        >
                          <Minus className="h-3 w-3" aria-hidden="true" />
                        </button>

                        <span className="w-8 text-center text-sm font-medium">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity + 1,
                              item.selectedSize,
                              item.selectedColor
                            )
                          }
                          disabled={item.quantity >= item.stock}
                          className={SHOP_STEPPER_BTN}
                          aria-label={t('actions.increaseQty')}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </button>

                        {item.quantity >= item.stock && (
                          <span
                            className="text-muted-foreground ml-3 text-xs"
                            role="status"
                          >
                            {t('actions.maxStock', { stock: item.stock })}
                          </span>
                        )}
                      </div>

                      <span className="text-foreground text-sm font-semibold">
                        {formatMoney(
                          item.lineTotalMinor,
                          item.currency,
                          locale
                        )}
                      </span>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {ordersCard ? <div className="mt-6">{ordersCard}</div> : null}
        </section>

        <aside
          className="border-border h-fit rounded-lg border p-6"
          aria-labelledby="order-summary"
        >
          <h2
            id="order-summary"
            className="text-foreground text-lg font-semibold"
          >
            {t('summary.heading')}
          </h2>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('summary.subtotal')}
              </span>
              <span className="text-foreground font-medium">
                {formatMoney(
                  cart.summary.totalAmountMinor,
                  cart.summary.currency,
                  locale
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('summary.shipping')}
              </span>
              <span className="text-muted-foreground">
                {t('summary.shippingInformationalOnly')}
              </span>
            </div>

            <div className="border-border border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-foreground text-base font-semibold">
                  {t('summary.total')}
                </span>
                <span className="text-foreground text-lg font-bold">
                  {formatMoney(
                    cart.summary.totalAmountMinor,
                    cart.summary.currency,
                    locale
                  )}
                </span>
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              {t('summary.shippingPayOnDeliveryNote')}
            </p>
          </div>

          <fieldset className="border-border mt-6 rounded-md border p-4">
            <legend className="text-foreground px-1 text-sm font-semibold">
              {t('delivery.legend')}
            </legend>

            {shippingMethodsLoading ? (
              <p className="text-muted-foreground text-xs">
                {t('delivery.methodsLoading')}
              </p>
            ) : null}

            {!shippingMethodsLoading && !shippingAvailable ? (
              <p className="text-muted-foreground text-xs" role="status">
                {shippingUnavailableText ?? t('delivery.unavailableFallback')}
              </p>
            ) : null}

            {shippingAvailable ? (
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  {shippingMethods.map(method => (
                    <label
                      key={method.methodCode}
                      className="border-border flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2"
                    >
                      <input
                        type="radio"
                        name="delivery-method"
                        value={method.methodCode}
                        checked={selectedShippingMethod === method.methodCode}
                        onChange={() => {
                          clearCheckoutUiErrors();
                          setSelectedShippingMethod(method.methodCode);
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium">
                        {method.title}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="space-y-2">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="shipping-city-search"
                  >
                    {t('delivery.city.label')}
                  </label>
                  <input
                    id="shipping-city-search"
                    type="text"
                    value={cityQuery}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={event => {
                      clearCheckoutUiErrors();
                      setCityQuery(event.target.value);
                      setSelectedCityRef(null);
                      setSelectedCityName(null);
                    }}
                    placeholder={t('delivery.city.placeholder')}
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />

                  {selectedCityRef ? (
                    <p className="text-muted-foreground text-xs">
                      {t('delivery.city.selected', {
                        city: selectedCityName ?? selectedCityRef,
                      })}
                    </p>
                  ) : null}

                  {citiesLoading ? (
                    <p className="text-muted-foreground text-xs">
                      {t('delivery.city.searching')}
                    </p>
                  ) : null}

                  {!citiesLoading && cityOptions.length > 0 ? (
                    <div className="max-h-36 space-y-1 overflow-auto rounded-md border p-2">
                      {cityOptions.map(city => (
                        <button
                          key={city.ref}
                          type="button"
                          onClick={() => {
                            clearCheckoutUiErrors();
                            setSelectedCityRef(city.ref);
                            setSelectedCityName(city.nameUa);
                            setCityQuery(city.nameUa);
                            setCityOptions([]);
                          }}
                          className="hover:bg-secondary block w-full rounded px-2 py-1 text-left text-xs"
                        >
                          {city.nameUa}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {!citiesLoading &&
                  cityQuery.trim().length >= 2 &&
                  !selectedCityRef &&
                  cityOptions.length === 0 ? (
                    <p className="text-muted-foreground text-xs" role="status">
                      {t('delivery.city.noResults')}
                    </p>
                  ) : null}
                </div>

                {isWarehouseSelectionMethod ? (
                  <div className="space-y-2">
                    {citiesLoading ? (
                      <p className="text-muted-foreground text-xs">
                        {t('delivery.city.searching')}
                      </p>
                    ) : null}

                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor="shipping-warehouse-search"
                    >
                      {t('delivery.warehouse.label')}
                    </label>

                    <input
                      id="shipping-warehouse-search"
                      type="text"
                      value={warehouseQuery}
                      onChange={event => {
                        clearCheckoutUiErrors();
                        setWarehouseQuery(event.target.value);
                        setSelectedWarehouseRef(null);
                        setSelectedWarehouseName(null);
                      }}
                      placeholder={
                        selectedCityRef
                          ? t('delivery.warehouse.placeholder')
                          : t('delivery.warehouse.selectCityFirst')
                      }
                      className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                      disabled={!selectedCityRef}
                    />

                    {!selectedCityRef ? (
                      <p
                        className="text-muted-foreground text-xs"
                        role="status"
                      >
                        {t('delivery.warehouse.cityRequired')}
                      </p>
                    ) : null}

                    {selectedWarehouseRef ? (
                      <p className="text-muted-foreground text-xs">
                        {t('delivery.warehouse.selected', {
                          warehouse:
                            selectedWarehouseName ?? selectedWarehouseRef,
                        })}
                      </p>
                    ) : null}

                    {warehousesLoading ? (
                      <p className="text-muted-foreground text-xs">
                        {t('delivery.warehouse.searching')}
                      </p>
                    ) : null}

                    {!warehousesLoading && warehouseOptions.length > 0 ? (
                      <div className="max-h-36 space-y-1 overflow-auto rounded-md border p-2">
                        {warehouseOptions.map(warehouse => (
                          <button
                            key={warehouse.ref}
                            type="button"
                            onClick={() => {
                              clearCheckoutUiErrors();
                              setSelectedWarehouseRef(warehouse.ref);
                              setSelectedWarehouseName(warehouse.name);
                              setWarehouseQuery(
                                warehouse.address
                                  ? `${warehouse.name} (${warehouse.address})`
                                  : warehouse.name
                              );
                            }}
                            className="hover:bg-secondary block w-full rounded px-2 py-1 text-left text-xs"
                          >
                            {warehouse.name}
                            {warehouse.address ? `, ${warehouse.address}` : ''}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedShippingMethod === 'NP_COURIER' ? (
                  <div className="space-y-2">
                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor="shipping-address-1"
                    >
                      {t('delivery.courierAddress.label')}
                    </label>
                    <input
                      id="shipping-address-1"
                      type="text"
                      value={courierAddressLine1}
                      onChange={event => {
                        clearCheckoutUiErrors();
                        setCourierAddressLine1(event.target.value);
                      }}
                      placeholder={t(
                        'delivery.courierAddress.line1Placeholder'
                      )}
                      className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={courierAddressLine2}
                      onChange={event => {
                        clearCheckoutUiErrors();
                        setCourierAddressLine2(event.target.value);
                      }}
                      placeholder={t(
                        'delivery.courierAddress.line2Placeholder'
                      )}
                      className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="recipient-name"
                  >
                    {t('delivery.recipientName.label')}
                  </label>
                  <input
                    id="recipient-name"
                    type="text"
                    value={recipientName}
                    onChange={event => {
                      clearCheckoutUiErrors();
                      setRecipientName(event.target.value);
                    }}
                    placeholder={t('delivery.recipientName.placeholder')}
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="recipient-phone"
                  >
                    {t('delivery.recipientPhone.label')}
                  </label>
                  <input
                    id="recipient-phone"
                    type="tel"
                    value={recipientPhone}
                    onChange={event => {
                      clearCheckoutUiErrors();
                      setRecipientPhone(event.target.value);
                    }}
                    placeholder={t('delivery.recipientPhone.placeholder')}
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="recipient-email"
                  >
                    {t('delivery.recipientEmail.label')}
                  </label>
                  <input
                    id="recipient-email"
                    type="email"
                    value={recipientEmail}
                    onChange={event => {
                      clearCheckoutUiErrors();
                      setRecipientEmail(event.target.value);
                    }}
                    placeholder={t('delivery.recipientEmail.placeholder')}
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="recipient-comment"
                  >
                    {t('delivery.recipientComment.label')}
                  </label>
                  <textarea
                    id="recipient-comment"
                    value={recipientComment}
                    onChange={event => {
                      clearCheckoutUiErrors();
                      setRecipientComment(event.target.value);
                    }}
                    placeholder={t('delivery.recipientComment.placeholder')}
                    rows={2}
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                {deliveryUiError ? (
                  <p className="text-destructive text-xs" role="alert">
                    {deliveryUiError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="border-border mt-6 rounded-md border p-4">
            <legend className="text-foreground px-1 text-sm font-semibold">
              {t('checkout.paymentMethod.label')}
            </legend>

            <div className="mt-3 space-y-2">
              {canUseStripe ? (
                <label className="border-border flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2">
                  <input
                    type="radio"
                    name="payment-provider"
                    value="stripe"
                    checked={selectedProvider === 'stripe'}
                    onChange={() => {
                      clearCheckoutUiErrors();
                      setSelectedProvider('stripe');
                      setSelectedPaymentMethod('stripe_card');
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">
                    {t('checkout.paymentMethod.stripe')}
                  </span>
                </label>
              ) : null}

              <label
                className={cn(
                  'border-border flex items-center gap-2 rounded-md border px-3 py-2',
                  canUseMonobank ? 'cursor-pointer' : 'opacity-60'
                )}
              >
                <input
                  type="radio"
                  name="payment-provider"
                  value="monobank"
                  checked={selectedProvider === 'monobank'}
                  onChange={() => {
                    clearCheckoutUiErrors();
                    setSelectedProvider('monobank');
                    if (
                      selectedPaymentMethod !== 'monobank_invoice' &&
                      selectedPaymentMethod !== 'monobank_google_pay'
                    ) {
                      setSelectedPaymentMethod(
                        resolveDefaultMethodForProvider({
                          provider: 'monobank',
                        })
                      );
                    }
                  }}
                  disabled={!canUseMonobank}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">
                  {t('checkout.paymentMethod.monobank')}
                </span>
              </label>

              {selectedProvider === 'monobank' && canUseMonobank ? (
                <div className="ml-2 space-y-2">
                  {canUseMonobankGooglePay ? (
                    <label className="border-border flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2">
                      <input
                        type="radio"
                        name="payment-method-monobank"
                        value="monobank_google_pay"
                        checked={
                          selectedPaymentMethod === 'monobank_google_pay'
                        }
                        onChange={() => {
                          clearCheckoutUiErrors();
                          setSelectedPaymentMethod('monobank_google_pay');
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium">
                        {t('checkout.paymentMethod.monobankGooglePay')}
                      </span>
                    </label>
                  ) : null}

                  <label className="border-border flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2">
                    <input
                      type="radio"
                      name="payment-method-monobank"
                      value="monobank_invoice"
                      checked={selectedPaymentMethod === 'monobank_invoice'}
                      onChange={() => {
                        clearCheckoutUiErrors();
                        setSelectedPaymentMethod('monobank_invoice');
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium">
                      {t('checkout.paymentMethod.monobankInvoice')}
                    </span>
                  </label>

                  {canUseMonobankGooglePay ? (
                    <p className="text-muted-foreground text-xs">
                      {t('checkout.paymentMethod.monobankGooglePayHint')}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {t(
                        'checkout.paymentMethod.monobankGooglePayFallbackHint'
                      )}
                    </p>
                  )}
                </div>
              ) : null}

              {!canUseMonobank ? (
                <p className="text-muted-foreground text-xs">
                  {monobankEnabled
                    ? t('checkout.paymentMethod.monobankUahOnlyHint')
                    : t('checkout.paymentMethod.monobankUnavailable')}
                </p>
              ) : null}

              {!hasSelectableProvider ? (
                <p className="text-destructive text-xs" role="status">
                  {t('checkout.paymentMethod.noAvailable')}
                </p>
              ) : null}
            </div>
          </fieldset>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isCheckingOut || !canPlaceOrder}
              className={SHOP_HERO_CTA}
              aria-busy={isCheckingOut}
            >
              <span
                className="absolute inset-0"
                style={shopCtaGradient(
                  '--shop-hero-btn-bg',
                  '--shop-hero-btn-bg-hover'
                )}
                aria-hidden="true"
              />
              <span
                className={SHOP_CTA_WAVE}
                style={shopCtaGradient(
                  '--shop-hero-btn-bg-hover',
                  '--shop-hero-btn-bg'
                )}
                aria-hidden="true"
              />
              <span className={SHOP_CTA_INSET} aria-hidden="true" />

              <span className="relative z-10 inline-flex min-w-0 items-center justify-center gap-2">
                {isCheckingOut ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}

                <span className="truncate whitespace-nowrap">
                  {t('checkout.placeOrder')}
                </span>

                {isCheckingOut ? (
                  <span className="sr-only">{t('checkout.placing')}</span>
                ) : null}
              </span>
            </button>

            <p className="text-muted-foreground text-center text-xs">
              {t('checkout.message')}
            </p>

            {createdOrderId && !checkoutError ? (
              <div className="flex justify-center">
                <Link
                  href={`/shop/orders/${encodeURIComponent(createdOrderId)}`}
                  className={cn(SHOP_LINK_BASE, SHOP_LINK_XS, SHOP_FOCUS)}
                >
                  {t('checkout.notRedirected')}
                </Link>
              </div>
            ) : null}

            {checkoutError ? (
              <div className="space-y-2">
                <p
                  className="text-destructive text-center text-xs"
                  role="alert"
                >
                  {checkoutError}
                </p>

                {createdOrderId ? (
                  <div className="flex justify-center">
                    <Link
                      href={`/shop/orders/${encodeURIComponent(createdOrderId)}`}
                      className={cn(SHOP_LINK_BASE, SHOP_LINK_XS, SHOP_FOCUS)}
                    >
                      {t('checkout.goToOrder')}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
