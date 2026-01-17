import { toCents } from '@/lib/shop/money';
import { currencyValues } from '@/lib/shop/currency';
import type { CurrencyCode } from '@/lib/shop/currency';
import { InvalidPayloadError, PriceConfigError } from '../errors';
import type { NormalizedPriceRow } from './types';

function assertMoneyString(value: string, field: string): number {
  const trimmed = value.trim();
  if (!trimmed) throw new InvalidPayloadError(`${field} is required.`);
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    throw new InvalidPayloadError(`${field} must be a positive number.`);
  }
  return n;
}

export function assertMoneyMinorInt(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(n)) {
    throw new InvalidPayloadError(`${field} must be a number.`);
  }

  // Critical: reject fractional minor units (no truncation)
  if (!Number.isInteger(n)) {
    throw new InvalidPayloadError(`${field} must be an integer (minor units).`);
  }

  if (!Number.isSafeInteger(n) || n < 1) {
    throw new InvalidPayloadError(
      `${field} must be a positive integer (minor units).`
    );
  }

  return n;
}

function assertOptionalMoneyString(
  value: string | null | undefined,
  field: string,
  price: string
): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const n = Number(trimmed);
  const p = Number(price);

  if (!Number.isFinite(n) || !Number.isFinite(p)) {
    throw new InvalidPayloadError(`${field} must be a valid number.`);
  }
  if (n <= p) {
    throw new InvalidPayloadError(`${field} must be > price.`);
  }
  return n;
}
export function assertMergedPricesPolicy(
  merged: NormalizedPriceRow[],
  options?: { productId?: string; requireUsd?: boolean }
) {
  if (!merged.length) {
    throw new PriceConfigError('At least one price is required.', {
      productId: options?.productId,
    });
  }

  const requireUsd = options?.requireUsd ?? true;
  if (requireUsd) {
    const hasUsd = merged.some(p => p.currency === 'USD' && p.priceMinor >= 1);
    if (!hasUsd) {
      throw new PriceConfigError('USD price is required.', {
        productId: options?.productId,
        currency: 'USD',
      });
    }
  }
}
function toMoneyMinor(value: string, field: string): number {
  const n = assertMoneyString(value, field);
  return toCents(n);
}

function toMoneyMinorNullable(
  value: string | null | undefined,
  field: string,
  price: string
): number | null {
  const n = assertOptionalMoneyString(value, field, price);
  if (n == null) return null;
  return toCents(n);
}

export function normalizePricesFromInput(input: unknown): NormalizedPriceRow[] {
  // Transitional-safe:
  // - NEW: input.prices[] uses MINOR units: { currency, priceMinor, originalPriceMinor }
  // - LEGACY: input.prices[] uses MAJOR strings: { currency, price, originalPrice }
  // - VERY LEGACY: top-level price/originalPrice/currency
  const anyInput = input as any;

  const prices = anyInput?.prices;
  if (Array.isArray(prices) && prices.length) {
    return prices.map((p: any) => {
      const currency = p?.currency as CurrencyCode;
      if (!currencyValues.includes(currency as any)) {
        throw new InvalidPayloadError(
          `Unsupported currency: ${String(p?.currency)}.`
        );
      }

      // NEW path: minor units
      if (p?.priceMinor != null) {
        const priceMinor = assertMoneyMinorInt(
          p.priceMinor,
          `${currency} price`
        );
        const originalPriceMinor =
          p.originalPriceMinor == null
            ? null
            : (() => {
                const v = assertMoneyMinorInt(
                  p.originalPriceMinor,
                  `${currency} originalPrice`
                );
                if (v <= priceMinor) {
                  throw new InvalidPayloadError(
                    `${currency} originalPrice must be > price.`
                  );
                }
                return v;
              })();

        return { currency, priceMinor, originalPriceMinor };
      }

      // LEGACY path: major strings
      const price = String(p?.price ?? '').trim();
      const originalPrice =
        p?.originalPrice == null ? null : String(p.originalPrice).trim();

      if (!price) {
        throw new InvalidPayloadError(`${currency}: price is required.`);
      }

      const priceMinor = toMoneyMinor(price, `${currency} price`);
      const originalPriceMinor = toMoneyMinorNullable(
        originalPrice,
        `${currency} originalPrice`,
        price
      );
      return { currency, priceMinor, originalPriceMinor };
    });
  }

  // Legacy fallback (only if present)
  if (anyInput?.price != null) {
    const currency = (anyInput?.currency as CurrencyCode) ?? 'USD';
    if (!currencyValues.includes(currency as any)) {
      throw new InvalidPayloadError(
        `Unsupported currency: ${String(anyInput?.currency)}.`
      );
    }
    const price = String(anyInput.price).trim();
    const originalPrice =
      anyInput.originalPrice == null
        ? null
        : String(anyInput.originalPrice).trim();

    const priceMinor = toMoneyMinor(price, `${currency} price`);
    const originalPriceMinor = toMoneyMinorNullable(
      originalPrice,
      `${currency} originalPrice`,
      price
    );

    return [{ currency, priceMinor, originalPriceMinor }];
  }

  return [];
}

export function requireUsd(prices: NormalizedPriceRow[]): NormalizedPriceRow {
  const usd = prices.find(p => p.currency === 'USD');
  if (!usd?.priceMinor) {
    throw new InvalidPayloadError('USD price is required.');
  }
  return usd;
}

export function validatePriceRows(prices: NormalizedPriceRow[]) {
  // Safety: no duplicates even if upstream schema is bypassed
  const seen = new Set<CurrencyCode>();
  for (const p of prices) {
    if (seen.has(p.currency)) {
      throw new InvalidPayloadError('Duplicate currency in prices.');
    }
    seen.add(p.currency);

    // Runtime guard (transitional input can bypass TS/Zod)
    if (!currencyValues.includes(p.currency as any)) {
      throw new InvalidPayloadError(
        `Unsupported currency: ${String(p.currency)}.`
      );
    }

    // priceMinor must be positive integer (minor units)
    if (!Number.isSafeInteger(p.priceMinor) || p.priceMinor < 1) {
      throw new InvalidPayloadError(`${p.currency}: price is required.`);
    }

    // originalPriceMinor must be > priceMinor when present
    if (p.originalPriceMinor != null) {
      if (!Number.isSafeInteger(p.originalPriceMinor)) {
        throw new InvalidPayloadError(
          `${p.currency} originalPrice must be a number.`
        );
      }
      if (p.originalPriceMinor <= p.priceMinor) {
        throw new InvalidPayloadError(
          `${p.currency} originalPrice must be > price.`
        );
      }
    }
  }
}

export function enforceSaleBadgeRequiresOriginal(
  badge: unknown,
  prices: NormalizedPriceRow[]
) {
  if (badge !== 'SALE') return;

  for (const p of prices) {
    if (p.originalPriceMinor == null) {
      throw new InvalidPayloadError(
        `SALE badge requires originalPrice for currency ${p.currency}.`
      );
    }
    if (p.originalPriceMinor <= p.priceMinor) {
      throw new InvalidPayloadError(
        `Invalid originalPrice for ${p.currency} (must be > price).`
      );
    }
  }
}
