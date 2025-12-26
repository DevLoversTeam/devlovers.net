import { z } from 'zod';
import {
  productAdminSchema,
  productAdminUpdateSchema,
} from '@/lib/validation/shop';
import { currencyValues, type CurrencyCode } from '@/lib/shop/currency';

type ParsedResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: z.ZodError<unknown> };

type ParseMode = 'create' | 'update';

const getStringField = (
  formData: FormData,
  name: string
): string | undefined => {
  const value = formData.get(name);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const parseBooleanField = (
  formData: FormData,
  name: string
): boolean | undefined => {
  const value = formData.get(name);
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  if (typeof value === 'boolean') return value;
  return undefined;
};

const parseNumberField = (
  formData: FormData,
  name: string
): number | undefined => {
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

  if (mode === 'update' && !hasField && rawValue === undefined)
    return undefined;

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

function parsePricesJsonField(formData: FormData, mode: ParseMode) {
  // PATCH semantics:
  // - update: if field is missing => omit prices
  // - create: missing/invalid => fail via schema (or explicit error)
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
    // empty string is invalid for create; for update treat as explicit "empty" (will fail schema anyway)
    return mode === 'update'
      ? { ok: true as const, value: [] }
      : { ok: true as const, value: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false as const,
      error: zodPricesJsonError('Invalid prices JSON'),
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false as const,
      error: zodPricesJsonError('Prices must be an array'),
    };
  }

  const normalized = parsed.map((row: any) => {
    const currencyRaw =
      typeof row?.currency === 'string'
        ? row.currency.trim().toUpperCase()
        : '';

    const currency = currencyValues.includes(currencyRaw as CurrencyCode)
      ? (currencyRaw as CurrencyCode)
      : currencyRaw;

    const price =
      typeof row?.price === 'string' ? row.price.trim() : row?.price;
    const originalRaw = row?.originalPrice;
    const originalPrice =
      originalRaw == null
        ? null
        : typeof originalRaw === 'string'
        ? originalRaw.trim() === ''
          ? null
          : originalRaw.trim()
        : String(originalRaw);

    return {
      currency,
      price: typeof price === 'string' ? price : String(price ?? ''),
      originalPrice,
    };
  });

  return { ok: true as const, value: normalized };
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

  // 2) Legacy fallback (priceUsd/priceUah)
  const priceUsd = getStringField(formData, 'priceUsd');
  const originalPriceUsd = getStringField(formData, 'originalPriceUsd');
  const priceUah = getStringField(formData, 'priceUah');
  const originalPriceUah = getStringField(formData, 'originalPriceUah');

  const legacyRawPrices = [
    ...(priceUsd !== undefined || originalPriceUsd !== undefined
      ? [
          {
            currency: 'USD' as const,
            price: priceUsd ?? '',
            originalPrice: originalPriceUsd ?? null,
          },
        ]
      : []),
    ...(priceUah !== undefined || originalPriceUah !== undefined
      ? [
          {
            currency: 'UAH' as const,
            price: priceUah ?? '',
            originalPrice: originalPriceUah ?? null,
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
