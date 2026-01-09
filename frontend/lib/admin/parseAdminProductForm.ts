import { z } from 'zod';
import {
  productAdminSchema,
  productAdminUpdateSchema,
} from '@/lib/validation/shop';
import { currencyValues, type CurrencyCode } from '@/lib/shop/currency';
import { toCents } from '@/lib/shop/money';

type ParsedResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: z.ZodError<unknown> };

type ParseMode = 'create' | 'update';

const getStringField = (formData: FormData, name: string): string | undefined => {
  const value = formData.get(name);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const parseBooleanField = (formData: FormData, name: string): boolean | undefined => {
  const value = formData.get(name);
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  if (typeof value === 'boolean') return value;
  return undefined;
};

const parseNumberField = (formData: FormData, name: string): number | undefined => {
  const value = getStringField(formData, name);
  if (value === undefined) return undefined;
  return Number(value);
};

const parseArrayField = (
  formData: FormData,
  name: string,
  mode: ParseMode
): string[] | undefined => {
  const hasField = formData.has(name);
  const rawValue = getStringField(formData, name);

  if (mode === 'update' && !hasField && rawValue === undefined) return undefined;

  const value = rawValue ?? '';
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
};

function zodPricesJsonError(message: string) {
  return new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ['prices'],
      message,
    },
  ]);
}

function parseMajorToMinor(
  value: unknown,
  opts: { field: 'price' | 'originalPrice'; currency: string }
): number | null {
  if (value == null) return null;

  const raw =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number'
      ? String(value)
      : '';

  if (!raw) return null;

  try {
    return toCents(raw);
  } catch {
    throw zodPricesJsonError(`Invalid ${opts.field} for ${opts.currency}`);
  }
}

function parseLegacyPriceMinorField(formData: FormData, name: string): number | undefined {
  const v = getStringField(formData, name);
  if (v === undefined) return undefined;
  return toCents(v);
}

/**
 * Legacy optional field semantics:
 * - if field missing => undefined (PATCH omit)
 * - if present but empty => null (explicit clear)
 * - if present and value => cents int
 */
function parseLegacyOptionalOriginalMinorField(
  formData: FormData,
  name: string
): number | null | undefined {
  if (!formData.has(name)) return undefined;

  const raw = formData.get(name);
  if (typeof raw !== 'string') return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  return toCents(trimmed);
}

function parseMinorInt(
  value: unknown,
  opts: { field: 'priceMinor' | 'originalPriceMinor'; currency: string }
): number | null {
  if (value == null) return null;

  const raw =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number(value.trim())
      : NaN;

  if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    throw zodPricesJsonError(`Invalid ${opts.field} for ${opts.currency}`);
  }

  return raw;
}

function requirePositivePriceMinor(priceMinor: number | null, currency: string) {
  // DB check: priceMinor > 0
  if (priceMinor == null || priceMinor <= 0) {
    throw zodPricesJsonError(`Missing price for ${currency}`);
  }
  return priceMinor;
}

function parsePricesJsonField(formData: FormData, mode: ParseMode) {
  if (!formData.has('prices')) {
    return mode === 'update' ? undefined : null;
  }

  const raw = formData.get('prices');
  if (typeof raw !== 'string') {
    return {
      ok: false as const,
      error: zodPricesJsonError('Invalid prices payload type'),
    };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true as const, value: [] as unknown[] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false as const, error: zodPricesJsonError('Invalid prices JSON') };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false as const, error: zodPricesJsonError('Prices must be an array') };
  }

  try {
    const normalized = parsed.map((row: any) => {
      const currencyRaw =
        typeof row?.currency === 'string' ? row.currency.trim().toUpperCase() : '';

      const currency = currencyValues.includes(currencyRaw as CurrencyCode)
        ? (currencyRaw as CurrencyCode)
        : currencyRaw;

      if (!currencyValues.includes(currency as CurrencyCode)) {
        throw zodPricesJsonError('Invalid currency in prices payload');
      }

      // Prefer canonical minor payload
      let priceMinor = parseMinorInt(row?.priceMinor, {
        field: 'priceMinor',
        currency: currency as string,
      });

      // Legacy major fallback
      if (priceMinor == null) {
        priceMinor = parseMajorToMinor(row?.price, {
          field: 'price',
          currency: currency as string,
        });
      }

      if (mode === 'create') {
        priceMinor = requirePositivePriceMinor(priceMinor, currency as string);
      } else {
    
        if (priceMinor != null && priceMinor <= 0) {
          throw zodPricesJsonError(`Invalid priceMinor for ${currency}`);
        }
      }

      let originalPriceMinor = parseMinorInt(row?.originalPriceMinor, {
        field: 'originalPriceMinor',
        currency: currency as string,
      });

      if (originalPriceMinor == null && row?.originalPrice !== undefined) {
        originalPriceMinor = parseMajorToMinor(row?.originalPrice, {
          field: 'originalPrice',
          currency: currency as string,
        });
      }

      // Normalize: empty -> null
      if (originalPriceMinor == null) originalPriceMinor = null;

      // DB invariant: originalPriceMinor is null OR > priceMinor
      if (originalPriceMinor !== null && priceMinor != null) {
        if (originalPriceMinor <= priceMinor) {
          throw zodPricesJsonError(
            `Invalid originalPrice for ${currency} (must be > price)`
          );
        }
      }

      return {
        currency,
        priceMinor,
        originalPriceMinor,
      };
    });

    return { ok: true as const, value: normalized };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false as const, error: e };
    return { ok: false as const, error: zodPricesJsonError('Invalid prices payload') };
  }
}

export function parseAdminProductForm(
  formData: FormData,
  options?: { mode?: 'create' }
): ParsedResult<z.infer<typeof productAdminSchema>>;
export function parseAdminProductForm(
  formData: FormData,
  options: { mode: 'update' }
): ParsedResult<z.infer<typeof productAdminUpdateSchema>>;
export function parseAdminProductForm(
  formData: FormData,
  options: { mode?: ParseMode } = {}
): ParsedResult<
  z.infer<typeof productAdminSchema> | z.infer<typeof productAdminUpdateSchema>
> {
  const mode: ParseMode = options.mode ?? 'create';

  // 1) Prefer canonical "prices" JSON payload if present
  const pricesJson = parsePricesJsonField(formData, mode);
  if (pricesJson && 'ok' in pricesJson && pricesJson.ok === false) {
    return { ok: false, error: pricesJson.error };
  }

  // 2) Legacy fallback (priceUsd/priceUah) -> MINOR units
  const priceUsdMinor = parseLegacyPriceMinorField(formData, 'priceUsd');
  const originalPriceUsdMinor = parseLegacyOptionalOriginalMinorField(formData, 'originalPriceUsd');

  const priceUahMinor = parseLegacyPriceMinorField(formData, 'priceUah');
  const originalPriceUahMinor = parseLegacyOptionalOriginalMinorField(formData, 'originalPriceUah');

  const legacyRawPrices = [
    ...(priceUsdMinor !== undefined || originalPriceUsdMinor !== undefined
      ? [
          {
            currency: 'USD' as const,
            priceMinor: priceUsdMinor ?? null,
            originalPriceMinor: originalPriceUsdMinor ?? null,
          },
        ]
      : []),
    ...(priceUahMinor !== undefined || originalPriceUahMinor !== undefined
      ? [
          {
            currency: 'UAH' as const,
            priceMinor: priceUahMinor ?? null,
            originalPriceMinor: originalPriceUahMinor ?? null,
          },
        ]
      : []),
  ];

  // Resolve final prices with PATCH semantics
  const prices =
    pricesJson && 'value' in pricesJson
      ? pricesJson.value
      : mode === 'update' && legacyRawPrices.length === 0
      ? undefined
      : legacyRawPrices;

  const payload = {
    title: getStringField(formData, 'title'),
    slug: getStringField(formData, 'slug'),
    description: getStringField(formData, 'description'),
    category: getStringField(formData, 'category'),
    type: getStringField(formData, 'type'),
    colors: parseArrayField(formData, 'colors', mode),
    sizes: parseArrayField(formData, 'sizes', mode),
    stock: parseNumberField(formData, 'stock'),
    sku: getStringField(formData, 'sku'),
    badge: getStringField(formData, 'badge'),
    isActive: parseBooleanField(formData, 'isActive'),
    isFeatured: parseBooleanField(formData, 'isFeatured'),
    ...(prices !== undefined ? { prices } : {}),
  };

  const parsed =
    mode === 'update'
      ? productAdminUpdateSchema.safeParse(payload)
      : productAdminSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: parsed.error };
  }

  return { ok: true, data: parsed.data };
}
