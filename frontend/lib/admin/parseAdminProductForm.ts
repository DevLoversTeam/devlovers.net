import { z } from 'zod';

import { type CurrencyCode, currencyValues } from '@/lib/shop/currency';
import { toCents } from '@/lib/shop/money';
import {
  adminProductPhotoPlanSchema,
  productAdminSchema,
  productAdminUpdateSchema,
} from '@/lib/validation/shop';

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

function zodPhotoError(
  message: string,
  path: Array<string | number> = ['photos']
) {
  return new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path,
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

function parseLegacyPriceMinorField(
  formData: FormData,
  name: string
): number | undefined {
  const v = getStringField(formData, name);
  if (v === undefined) return undefined;
  return toCents(v);
}

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

function requirePositivePriceMinor(
  priceMinor: number | null,
  currency: string
) {
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

  try {
    const normalized = parsed.map((row: any) => {
      const currencyRaw =
        typeof row?.currency === 'string'
          ? row.currency.trim().toUpperCase()
          : '';

      const currency = currencyValues.includes(currencyRaw as CurrencyCode)
        ? (currencyRaw as CurrencyCode)
        : currencyRaw;

      if (!currencyValues.includes(currency as CurrencyCode)) {
        throw zodPricesJsonError('Invalid currency in prices payload');
      }

      let priceMinor = parseMinorInt(row?.priceMinor, {
        field: 'priceMinor',
        currency: currency as string,
      });

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

      if (originalPriceMinor == null) originalPriceMinor = null;

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
    return {
      ok: false as const,
      error: zodPricesJsonError('Invalid prices payload'),
    };
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

  const pricesJson = parsePricesJsonField(formData, mode);
  if (pricesJson && 'ok' in pricesJson && pricesJson.ok === false) {
    return { ok: false, error: pricesJson.error };
  }

  const priceUsdMinor = parseLegacyPriceMinorField(formData, 'priceUsd');
  const originalPriceUsdMinor = parseLegacyOptionalOriginalMinorField(
    formData,
    'originalPriceUsd'
  );

  const priceUahMinor = parseLegacyPriceMinorField(formData, 'priceUah');
  const originalPriceUahMinor = parseLegacyOptionalOriginalMinorField(
    formData,
    'originalPriceUah'
  );

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

type ParsedAdminProductPhotos = {
  imagePlan?: z.infer<typeof adminProductPhotoPlanSchema>;
  images: Array<{ uploadId: string; file: File }>;
};

function parseStringArrayJsonField(
  formData: FormData,
  name: string
): ParsedResult<string[]> {
  const raw = formData.get(name);
  if (raw == null) return { ok: true, data: [] };
  if (typeof raw !== 'string') {
    return {
      ok: false,
      error: zodPhotoError(`Invalid ${name} payload type`, [name]),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: zodPhotoError(`Invalid ${name} JSON`, [name]) };
  }

  const result = z.array(z.string()).safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: zodPhotoError(`Invalid ${name} payload`, [name]),
    };
  }

  return { ok: true, data: result.data };
}

export function parseAdminProductPhotosForm(
  formData: FormData,
  options: { mode?: ParseMode } = {}
): ParsedResult<ParsedAdminProductPhotos> {
  const mode: ParseMode = options.mode ?? 'create';

  const photoPlanRaw = formData.get('photoPlan');
  const legacyImage = formData.get('image');

  if (photoPlanRaw == null) {
    if (!(legacyImage instanceof File) || legacyImage.size === 0) {
      return {
        ok: true,
        data: {
          imagePlan: undefined,
          images: [],
        },
      };
    }

    if (!legacyImage.type?.startsWith('image/')) {
      return {
        ok: false,
        error: zodPhotoError('Uploaded file must be an image', ['photos']),
      };
    }

    return {
      ok: true,
      data: {
        imagePlan: [{ uploadId: 'legacy-image', isPrimary: true }],
        images: [{ uploadId: 'legacy-image', file: legacyImage }],
      },
    };
  }

  if (typeof photoPlanRaw !== 'string') {
    return {
      ok: false,
      error: zodPhotoError('Invalid photoPlan payload type', ['photoPlan']),
    };
  }

  let parsedPlanJson: unknown;
  try {
    parsedPlanJson = JSON.parse(photoPlanRaw);
  } catch {
    return {
      ok: false,
      error: zodPhotoError('Invalid photoPlan JSON', ['photoPlan']),
    };
  }

  const parsedPlan = adminProductPhotoPlanSchema.safeParse(parsedPlanJson);
  if (!parsedPlan.success) {
    return { ok: false, error: parsedPlan.error };
  }

  const uploadIdsResult = parseStringArrayJsonField(
    formData,
    'newImageUploadIds'
  );
  if (!uploadIdsResult.ok) return uploadIdsResult;

  const files = formData.getAll('newImages');
  if (files.length !== uploadIdsResult.data.length) {
    return {
      ok: false,
      error: zodPhotoError(
        'newImages and newImageUploadIds must have the same length',
        ['newImages']
      ),
    };
  }

  const images: Array<{ uploadId: string; file: File }> = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const uploadId = uploadIdsResult.data[index]?.trim();

    if (!(file instanceof File) || file.size === 0) {
      return {
        ok: false,
        error: zodPhotoError('Each uploaded photo must be a non-empty file', [
          'newImages',
          index,
        ]),
      };
    }

    if (!file.type?.startsWith('image/')) {
      return {
        ok: false,
        error: zodPhotoError('Uploaded file must be an image', [
          'newImages',
          index,
        ]),
      };
    }

    if (!uploadId) {
      return {
        ok: false,
        error: zodPhotoError('Missing upload id for photo', [
          'newImageUploadIds',
          index,
        ]),
      };
    }

    images.push({ uploadId, file });
  }

  if (mode === 'create' && parsedPlan.data.some(item => item.imageId)) {
    return {
      ok: false,
      error: zodPhotoError(
        'Create photo plan cannot reference existing images',
        ['photoPlan']
      ),
    };
  }

  return {
    ok: true,
    data: {
      imagePlan: parsedPlan.data,
      images,
    },
  };
}
