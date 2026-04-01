'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useRouter } from '@/i18n/routing';
import { CATEGORIES, COLORS, PRODUCT_TYPES, SIZES } from '@/lib/config/catalog';
import { logError } from '@/lib/logging';
import { cn } from '@/lib/utils';
import type { AdminProductPhotoPlan } from '@/lib/validation/shop';
import type { ProductAdminInput, ProductImage } from '@/lib/validation/shop';

const localSlugify = (input: string): string => {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

type ProductFormProps = {
  mode: 'create' | 'edit';
  productId?: string;
  initialValues?: Partial<ProductAdminInput> & {
    imageUrl?: string;
    images?: ProductImage[];
  };
  csrfToken: string;
};

type ApiResponse = {
  success?: boolean;
  product?: { id: string; slug: string };
  error?: string;
  code?: string;
  field?: string;
  details?: unknown;
};

type ApiPriceRow = ProductAdminInput['prices'][number];
type CurrencyCode = ApiPriceRow['currency'];

type UiPriceRow = {
  currency: CurrencyCode;
  price: string;
  originalPrice: string;
};

export type UiPhoto = {
  key: string;
  source: 'existing' | 'legacy' | 'new';
  imageId?: string;
  uploadId?: string;
  previewUrl: string;
  publicId?: string;
  isPrimary: boolean;
  file?: File;
};

type SaleRuleDetails = {
  currency?: CurrencyCode;
  field?: string;
  rule?: 'required' | 'greater_than_price';
};

const CARD_CLASS =
  'rounded-xl border border-border bg-background/80 p-5 shadow-sm';
const LABEL_CLASS = 'block text-sm font-medium text-foreground';
const INPUT_CLASS =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10';
const TEXTAREA_CLASS =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10';
const READONLY_INPUT_CLASS =
  'h-10 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground';
const SECONDARY_BUTTON_CLASS =
  'inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON_CLASS =
  'inline-flex h-10 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-60';

class InvalidMoneyValueError extends Error {
  rawValue: string;

  constructor(rawValue: string) {
    super('INVALID_MONEY_VALUE');
    this.name = 'InvalidMoneyValueError';
    this.rawValue = rawValue;
  }
}

function formatMinorToMajor(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(Math.trunc(value));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = value < 0 ? '-' : '';
  return `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}

function parseMajorToMinor(value: string): number {
  const s = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new InvalidMoneyValueError(value);
  }
  const [whole, frac = ''] = s.split('.');
  const frac2 = (frac + '00').slice(0, 2);
  const minor = Number(whole) * 100 + Number(frac2);
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new InvalidMoneyValueError(value);
  }
  return minor;
}

function normalizeUiPriceRow(row: unknown): UiPriceRow | null {
  const r = row as any;

  const currency = r?.currency as CurrencyCode | undefined;
  if (currency !== 'USD' && currency !== 'UAH') return null;

  let price = '';
  if (typeof r?.price === 'string') price = r.price.trim();
  else if (typeof r?.priceMinor === 'number')
    price = formatMinorToMajor(r.priceMinor);
  else if (typeof r?.priceMinor === 'string' && r.priceMinor.trim().length) {
    const n = Number(r.priceMinor);
    price = Number.isFinite(n) ? formatMinorToMajor(n) : '';
  }

  let originalPrice = '';
  if (typeof r?.originalPrice === 'string')
    originalPrice = r.originalPrice.trim();
  else if (r?.originalPrice == null) originalPrice = '';
  else if (typeof r?.originalPriceMinor === 'number')
    originalPrice = formatMinorToMajor(r.originalPriceMinor);
  else if (
    typeof r?.originalPriceMinor === 'string' &&
    r.originalPriceMinor.trim().length
  ) {
    const n = Number(r.originalPriceMinor);
    originalPrice = Number.isFinite(n) ? formatMinorToMajor(n) : '';
  }

  return { currency, price, originalPrice };
}

function ensureUiPriceRows(fromInitial: unknown): UiPriceRow[] {
  const arr = Array.isArray(fromInitial) ? fromInitial : [];
  const valid = arr.map(normalizeUiPriceRow).filter(Boolean) as UiPriceRow[];

  const map = new Map<CurrencyCode, UiPriceRow>(
    valid.map(p => [p.currency, p])
  );

  return (['USD', 'UAH'] as const).map(currency => {
    return (
      map.get(currency) ?? {
        currency,
        price: '',
        originalPrice: '',
      }
    );
  });
}

function normalizeUiPhotos(photos: UiPhoto[]): UiPhoto[] {
  if (photos.length === 0) return [];

  const primaryIndex = photos.findIndex(photo => photo.isPrimary);
  const effectivePrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0;

  return photos.map((photo, index) => ({
    ...photo,
    isPrimary: index === effectivePrimaryIndex,
  }));
}

type SerializableUiPhoto =
  | (UiPhoto & { source: 'existing'; imageId: string })
  | (UiPhoto & { source: 'new'; uploadId: string; file?: File });

function isSerializableUiPhoto(photo: UiPhoto): photo is SerializableUiPhoto {
  if (photo.source === 'existing') {
    return typeof photo.imageId === 'string' && photo.imageId.trim().length > 0;
  }

  if (photo.source === 'new') {
    return (
      typeof photo.uploadId === 'string' && photo.uploadId.trim().length > 0
    );
  }

  return false;
}

type ProductFormErrorMessages = {
  legacyPhotoMigrationRequired: string;
};

class PhotoPlanSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoPlanSubmissionError';
  }
}

export function getPhotoPlanSubmissionError(
  photos: UiPhoto[],
  messages: ProductFormErrorMessages
): string | null {
  const hasLegacyPhotos = photos.some(photo => photo.source === 'legacy');
  const hasNonLegacyPhotos = photos.some(photo => photo.source !== 'legacy');

  if (hasLegacyPhotos && hasNonLegacyPhotos) {
    return messages.legacyPhotoMigrationRequired;
  }

  return null;
}

export function buildPhotoPlanSubmission(
  photos: UiPhoto[],
  messages: ProductFormErrorMessages
): {
  photoPlan?: AdminProductPhotoPlan;
  newPhotos: Array<UiPhoto & { source: 'new'; uploadId: string; file: File }>;
} {
  const submissionError = getPhotoPlanSubmissionError(photos, messages);
  if (submissionError) {
    throw new PhotoPlanSubmissionError(submissionError);
  }

  const serializablePhotos = photos.filter(isSerializableUiPhoto);

  if (serializablePhotos.length === 0) {
    return { photoPlan: undefined, newPhotos: [] };
  }

  const primaryIndex = serializablePhotos.findIndex(photo => photo.isPrimary);
  const effectivePrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0;

  const photoPlan = serializablePhotos.map((photo, index) => ({
    imageId: photo.source === 'existing' ? photo.imageId : undefined,
    uploadId: photo.source === 'new' ? photo.uploadId : undefined,
    isPrimary: index === effectivePrimaryIndex,
  }));

  const newPhotos = serializablePhotos.filter(
    (
      photo
    ): photo is UiPhoto & { source: 'new'; uploadId: string; file: File } =>
      photo.source === 'new' && Boolean(photo.file)
  );

  return { photoPlan, newPhotos };
}

function getBlobPreviewUrls(photos: UiPhoto[]): Set<string> {
  return new Set(
    photos
      .filter(
        photo => photo.source === 'new' && photo.previewUrl.startsWith('blob:')
      )
      .map(photo => photo.previewUrl)
  );
}

export function revokeSupersededPhotoPreviewUrls(
  previousPhotos: UiPhoto[],
  nextPhotos: UiPhoto[]
) {
  const nextBlobPreviewUrls = getBlobPreviewUrls(nextPhotos);

  previousPhotos.forEach(photo => {
    if (photo.source !== 'new' || !photo.previewUrl.startsWith('blob:')) {
      return;
    }

    if (nextBlobPreviewUrls.has(photo.previewUrl)) {
      return;
    }

    URL.revokeObjectURL(photo.previewUrl);
  });
}

export function ensureUiPhotos(fromInitial: {
  images?: ProductImage[];
  imageUrl?: string;
}): UiPhoto[] {
  const explicitImages = Array.isArray(fromInitial.images)
    ? [...fromInitial.images]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(image => ({
          key: `existing:${image.id}`,
          source: 'existing' as const,
          imageId: image.id,
          previewUrl: image.imageUrl,
          publicId: image.imagePublicId,
          isPrimary: image.isPrimary,
        }))
    : [];

  if (explicitImages.length > 0) {
    return normalizeUiPhotos(explicitImages);
  }

  if (fromInitial.imageUrl) {
    return [
      {
        key: 'legacy-image',
        source: 'legacy',
        previewUrl: fromInitial.imageUrl,
        isPrimary: true,
      },
    ];
  }

  return [];
}

export function ProductForm({
  mode,
  productId,
  initialValues,
  csrfToken,
}: ProductFormProps) {
  const router = useRouter();
  const t = useTranslations('shop.admin.products.form');

  const idBase = useMemo(() => {
    const pid =
      typeof productId === 'string' && productId.trim().length
        ? productId.trim()
        : 'new';
    return `product-form-${mode}-${pid}`;
  }, [mode, productId]);

  const headingId = `${idBase}-heading`;
  const formErrorId = `${idBase}-form-error`;
  const slugHelpId = `${idBase}-slug-help`;
  const slugErrorId = `${idBase}-slug-error`;
  const imageErrorId = `${idBase}-image-error`;
  const usdOriginalErrorId = `${idBase}-usd-original-error`;
  const uahOriginalErrorId = `${idBase}-uah-original-error`;

  const hydratedKeyRef = useRef<string | null>(null);
  const photosRef = useRef<UiPhoto[]>([]);
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [slug, setSlug] = useState(
    initialValues?.slug
      ? localSlugify(initialValues.slug)
      : localSlugify(initialValues?.title ?? '')
  );

  const [prices, setPrices] = useState<UiPriceRow[]>(
    ensureUiPriceRows((initialValues as any)?.prices)
  );

  const [category, setCategory] = useState(initialValues?.category ?? '');
  const [type, setType] = useState(initialValues?.type ?? '');
  const [selectedColors, setSelectedColors] = useState<string[]>(
    initialValues?.colors ?? []
  );
  const [selectedSizes, setSelectedSizes] = useState<string[]>(
    initialValues?.sizes ?? []
  );
  const [stock, setStock] = useState(
    typeof initialValues?.stock === 'number' ? String(initialValues.stock) : ''
  );
  const [sku, setSku] = useState(initialValues?.sku ?? '');
  const [badge, setBadge] = useState<ProductAdminInput['badge']>(
    initialValues?.badge ?? 'NONE'
  );
  const [description, setDescription] = useState(
    initialValues?.description ?? ''
  );
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(
    initialValues?.isFeatured ?? false
  );

  const [photos, setPhotos] = useState<UiPhoto[]>(
    ensureUiPhotos({
      images: initialValues?.images,
      imageUrl: initialValues?.imageUrl,
    })
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [originalPriceErrors, setOriginalPriceErrors] = useState<
    Partial<Record<CurrencyCode, string>>
  >({});

  function replacePhotos(
    nextOrUpdater: UiPhoto[] | ((prev: UiPhoto[]) => UiPhoto[])
  ) {
    setPhotos(prev => {
      const next =
        typeof nextOrUpdater === 'function'
          ? nextOrUpdater(prev)
          : nextOrUpdater;
      revokeSupersededPhotoPreviewUrls(prev, next);
      photosRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    if (mode !== 'edit') {
      hydratedKeyRef.current = null;
      return;
    }
    if (!initialValues) return;

    const key =
      (typeof productId === 'string' && productId.trim().length
        ? productId
        : null) ??
      (typeof initialValues.slug === 'string' &&
      initialValues.slug.trim().length
        ? initialValues.slug
        : null) ??
      (typeof initialValues.title === 'string' &&
      initialValues.title.trim().length
        ? initialValues.title
        : null);

    if (!key) return;

    if (hydratedKeyRef.current === key) return;

    setError(null);
    setSlugError(null);
    setImageError(null);
    setOriginalPriceErrors({});
    setIsSubmitting(false);

    if (typeof initialValues.title === 'string') setTitle(initialValues.title);
    if (typeof initialValues.slug === 'string')
      setSlug(localSlugify(initialValues.slug));

    setPrices(ensureUiPriceRows((initialValues as any)?.prices));
    setCategory(initialValues.category ?? '');
    setType(initialValues.type ?? '');
    setSelectedColors(initialValues.colors ?? []);
    setSelectedSizes(initialValues.sizes ?? []);
    setStock(
      typeof initialValues.stock === 'number' ? String(initialValues.stock) : ''
    );
    setSku(initialValues.sku ?? '');
    setBadge(initialValues.badge ?? 'NONE');
    setDescription(initialValues.description ?? '');
    setIsActive(initialValues.isActive ?? true);
    setIsFeatured(initialValues.isFeatured ?? false);
    replacePhotos(
      ensureUiPhotos({
        images: initialValues.images,
        imageUrl: initialValues.imageUrl,
      })
    );
    hydratedKeyRef.current = key;
  }, [mode, initialValues, productId]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach(photo => {
        if (photo.source === 'new' && photo.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(photo.previewUrl);
        }
      });
    };
  }, []);

  const slugValue = useMemo(() => {
    if (mode === 'edit') return slug;
    return localSlugify(title);
  }, [mode, slug, title]);

  const usdRow = useMemo(
    () => prices.find(p => p.currency === 'USD'),
    [prices]
  );
  const uahRow = useMemo(
    () => prices.find(p => p.currency === 'UAH'),
    [prices]
  );

  const usdOriginalError = originalPriceErrors['USD'];
  const uahOriginalError = originalPriceErrors['UAH'];

  function setPriceField(
    currency: CurrencyCode,
    field: 'price' | 'originalPrice',
    value: string
  ) {
    setPrices(prev =>
      prev.map(p => {
        if (p.currency !== currency) return p;
        if (field === 'price') return { ...p, price: value };
        return { ...p, originalPrice: value };
      })
    );

    setOriginalPriceErrors(prev => {
      if (!prev[currency]) return prev;
      const next = { ...prev };
      delete next[currency];
      return next;
    });
  }

  const handlePhotoFilesChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const nextPhotos = files
      .filter(file => file.size > 0)
      .map(file => ({
        key: `new:${crypto.randomUUID()}`,
        source: 'new' as const,
        uploadId: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
        isPrimary: false,
        file,
      }));

    replacePhotos(prev => normalizeUiPhotos([...prev, ...nextPhotos]));
    setImageError(null);
    event.target.value = '';
  };

  const setPrimaryPhoto = (key: string) => {
    replacePhotos(prev =>
      prev.map(photo => ({
        ...photo,
        isPrimary: photo.key === key,
      }))
    );
    setImageError(null);
  };

  const movePhoto = (key: string, direction: -1 | 1) => {
    replacePhotos(prev => {
      const index = prev.findIndex(photo => photo.key === key);
      if (index < 0) return prev;

      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;

      const next = [...prev];
      const [photo] = next.splice(index, 1);
      next.splice(nextIndex, 0, photo);
      return normalizeUiPhotos(next);
    });
  };

  const removePhoto = (key: string) => {
    replacePhotos(prev =>
      normalizeUiPhotos(prev.filter(photo => photo.key !== key))
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError(null);
    setSlugError(null);
    setImageError(null);
    setOriginalPriceErrors({});

    if (photos.length === 0) {
      setImageError(t('errors.photoRequired'));
      return;
    }

    setIsSubmitting(true);

    try {
      const normalizedPrices = prices.map(p => ({
        currency: p.currency,
        price: String(p.price ?? '').trim(),
        originalPrice: String(p.originalPrice ?? '').trim(),
      }));

      const effectivePrices = normalizedPrices.filter(
        p => p.price.length > 0 || p.originalPrice.length > 0
      );

      if (effectivePrices.length === 0) {
        setError(t('errors.atLeastOnePrice'));
        return;
      }

      const storefrontUahPrice = normalizedPrices.find(
        price => price.currency === 'UAH'
      );
      if (!storefrontUahPrice?.price.length) {
        setError(t('errors.uahRequired'));
        return;
      }

      for (const p of effectivePrices) {
        if (!p.price.length && p.originalPrice.length) {
          setError(
            t('errors.priceRequiredWhenOriginalSet', {
              currency: p.currency,
            })
          );
          return;
        }
      }

      let minorPrices: Array<{
        currency: CurrencyCode;
        priceMinor: number;
        originalPriceMinor: number | null;
      }>;

      try {
        minorPrices = effectivePrices.map(p => ({
          currency: p.currency,
          priceMinor: parseMajorToMinor(p.price),
          originalPriceMinor: p.originalPrice.length
            ? parseMajorToMinor(p.originalPrice)
            : null,
        }));
      } catch (e) {
        if (e instanceof InvalidMoneyValueError) {
          setError(t('errors.invalidMoneyValue', { value: e.rawValue }));
          return;
        }
        setError(t('errors.invalidPriceValue'));
        return;
      }

      const formData = new FormData();
      formData.append('title', title);
      if (mode === 'create') formData.append('slug', slugValue);

      formData.append('prices', JSON.stringify(minorPrices));

      if (category) formData.append('category', category);
      if (type) formData.append('type', type);
      formData.append('colors', selectedColors.join(','));
      formData.append('sizes', selectedSizes.join(','));
      if (stock) formData.append('stock', stock);
      if (sku) formData.append('sku', sku);
      if (badge) formData.append('badge', badge);
      if (description) formData.append('description', description);

      formData.append('isActive', isActive ? 'true' : 'false');
      formData.append('isFeatured', isFeatured ? 'true' : 'false');

      const photoSubmission = (() => {
        try {
          return buildPhotoPlanSubmission(photos, {
            legacyPhotoMigrationRequired: t(
              'errors.legacyPhotoMigrationRequired'
            ),
          });
        } catch (photoPlanError) {
          if (photoPlanError instanceof PhotoPlanSubmissionError) {
            setImageError(photoPlanError.message);
            return null;
          }

          throw photoPlanError;
        }
      })();

      if (!photoSubmission) {
        return;
      }

      const { photoPlan, newPhotos } = photoSubmission;

      if (photoPlan?.length) {
        formData.append('photoPlan', JSON.stringify(photoPlan));
        formData.append(
          'newImageUploadIds',
          JSON.stringify(newPhotos.map(photo => photo.uploadId))
        );
        newPhotos.forEach(photo => {
          formData.append('newImages', photo.file);
        });
      }

      if (!csrfToken) {
        setError(t('errors.securityMissing'));
        setIsSubmitting(false);
        return;
      }

      const response = await fetch(
        mode === 'create'
          ? '/api/shop/admin/products'
          : `/api/shop/admin/products/${productId}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: {
            'x-csrf-token': csrfToken,
          },
          body: formData,
        }
      );

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        if (data.code === 'SLUG_CONFLICT' || data.field === 'slug') {
          setSlugError(t('errors.slugConflict'));
        }

        const photoErrorFields = new Set([
          'image',
          'photos',
          'photoPlan',
          'newImages',
          'newImageUploadIds',
        ]);

        if (
          (typeof data.field === 'string' &&
            photoErrorFields.has(data.field)) ||
          data.code === 'IMAGE_UPLOAD_FAILED' ||
          data.code === 'IMAGE_REQUIRED'
        ) {
          setImageError(data.error ?? t('errors.photoUpdateFailed'));
          return;
        }

        if (data.code === 'SALE_ORIGINAL_REQUIRED') {
          const details = data.details as SaleRuleDetails | undefined;
          const currency = details?.currency;
          const msg =
            details?.rule === 'greater_than_price'
              ? t('errors.saleOriginalGreater')
              : t('errors.saleOriginalRequired');

          if (currency === 'USD' || currency === 'UAH') {
            setOriginalPriceErrors(prev => ({ ...prev, [currency]: msg }));
          }

          setError(data.error ?? msg);
          return;
        }

        if (
          response.status === 403 &&
          (data.code === 'CSRF_MISSING' || data.code === 'CSRF_INVALID')
        ) {
          setError(t('errors.securityExpired'));
          return;
        }

        setError(
          data.error ??
            (mode === 'create'
              ? t('errors.createFailed')
              : t('errors.updateFailed'))
        );
        return;
      }

      const destinationSlug = data.product?.slug ?? slugValue;
      router.push(`/shop/products/${destinationSlug}`);
    } catch (err) {
      logError('admin_product_form_failed', err, {
        mode,
        productId: productId ?? null,
        slug: slugValue,
      });

      setError(
        mode === 'create'
          ? t('errors.unexpectedCreate')
          : t('errors.unexpectedUpdate')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const describedBySlug = slugError
    ? `${slugHelpId} ${slugErrorId}`
    : slugHelpId;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        {mode === 'create' ? t('headings.create') : t('headings.edit')}
      </h2>
      {error ? (
        <div
          id={formErrorId}
          role="alert"
          aria-live="polite"
          className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600"
        >
          {error}
        </div>
      ) : null}

      <form
        className="space-y-5"
        onSubmit={handleSubmit}
        encType="multipart/form-data"
        aria-describedby={error ? formErrorId : undefined}
      >
        <section
          className={cn(CARD_CLASS, 'grid gap-4 sm:grid-cols-2')}
          aria-label={t('sections.basicInfo')}
        >
          <div>
            <label className={LABEL_CLASS} htmlFor="title">
              {t('fields.title')}
            </label>
            <input
              id="title"
              name="title"
              className={INPUT_CLASS}
              type="text"
              value={title}
              onChange={event => setTitle(event.target.value)}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={LABEL_CLASS} htmlFor="slug">
                {t('fields.slug')}
              </label>
              <span id={slugHelpId} className="text-muted-foreground text-xs">
                {t('fields.slugHelp')}
              </span>
            </div>
            <input
              id="slug"
              name="slug"
              className={READONLY_INPUT_CLASS}
              type="text"
              value={slugValue}
              readOnly
              aria-readonly="true"
              aria-describedby={describedBySlug}
              aria-invalid={slugError ? true : undefined}
            />
            {slugError ? (
              <p
                id={slugErrorId}
                className="mt-1 text-sm text-red-600"
                role="alert"
              >
                {slugError}
              </p>
            ) : null}
          </div>
        </section>

        <fieldset className={CARD_CLASS}>
          <legend className="text-foreground px-1 text-sm font-semibold">
            {t('pricing.legend')}
          </legend>

          <p className="text-muted-foreground mt-2 text-xs">
            {t('pricing.helper')}
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-muted-foreground text-xs font-medium">
                {t('pricing.uahLegend')}
              </legend>

              <div>
                <label className={LABEL_CLASS} htmlFor="price-uah">
                  {t('fields.price', { currency: 'UAH' })}
                </label>
                <input
                  id="price-uah"
                  name="price-uah"
                  className={INPUT_CLASS}
                  type="text"
                  inputMode="decimal"
                  placeholder="1999.00"
                  value={uahRow?.price ?? ''}
                  onChange={e => setPriceField('UAH', 'price', e.target.value)}
                />
              </div>

              <div>
                <label className={LABEL_CLASS} htmlFor="original-uah">
                  {t('fields.originalPrice', { currency: 'UAH' })}
                </label>
                <input
                  id="original-uah"
                  name="original-uah"
                  className={cn(
                    INPUT_CLASS,
                    uahOriginalError && 'border-red-500'
                  )}
                  type="text"
                  inputMode="decimal"
                  placeholder="2499.00"
                  value={uahRow?.originalPrice ?? ''}
                  onChange={e =>
                    setPriceField('UAH', 'originalPrice', e.target.value)
                  }
                  aria-invalid={uahOriginalError ? true : undefined}
                  aria-describedby={
                    uahOriginalError ? uahOriginalErrorId : undefined
                  }
                />
                {uahOriginalError ? (
                  <p
                    id={uahOriginalErrorId}
                    className="mt-1 text-sm text-red-600"
                    role="alert"
                  >
                    {uahOriginalError}
                  </p>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-muted-foreground text-xs font-medium">
                {t('pricing.usdLegend')}
              </legend>

              <div>
                <label className={LABEL_CLASS} htmlFor="price-usd">
                  {t('fields.price', { currency: 'USD' })}
                </label>
                <input
                  id="price-usd"
                  name="price-usd"
                  className={INPUT_CLASS}
                  type="text"
                  inputMode="decimal"
                  placeholder="59.00"
                  value={usdRow?.price ?? ''}
                  onChange={e => setPriceField('USD', 'price', e.target.value)}
                />
              </div>

              <div>
                <label className={LABEL_CLASS} htmlFor="original-usd">
                  {t('fields.originalPrice', { currency: 'USD' })}
                </label>
                <input
                  id="original-usd"
                  name="original-usd"
                  className={cn(
                    INPUT_CLASS,
                    usdOriginalError && 'border-red-500'
                  )}
                  type="text"
                  inputMode="decimal"
                  placeholder="79.00"
                  value={usdRow?.originalPrice ?? ''}
                  onChange={e =>
                    setPriceField('USD', 'originalPrice', e.target.value)
                  }
                  aria-invalid={usdOriginalError ? true : undefined}
                  aria-describedby={
                    usdOriginalError ? usdOriginalErrorId : undefined
                  }
                />
                {usdOriginalError ? (
                  <p
                    id={usdOriginalErrorId}
                    className="mt-1 text-sm text-red-600"
                    role="alert"
                  >
                    {usdOriginalError}
                  </p>
                ) : null}
              </div>
            </fieldset>
          </div>

          <p className="text-muted-foreground mt-3 text-xs">
            {t('pricing.policyPrefix')}{' '}
            <span className="font-mono">product_prices</span>{' '}
            {t('pricing.policySuffix')}
          </p>
        </fieldset>

        <section
          className={cn(CARD_CLASS, 'grid gap-4 sm:grid-cols-2')}
          aria-label={t('sections.inventorySku')}
        >
          <div>
            <label className={LABEL_CLASS} htmlFor="stock">
              {t('fields.stock')}
            </label>
            <input
              id="stock"
              name="stock"
              className={INPUT_CLASS}
              type="number"
              value={stock}
              onChange={event => setStock(event.target.value)}
              min={0}
              inputMode="numeric"
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sku">
              {t('fields.sku')}
            </label>
            <input
              id="sku"
              name="sku"
              className={INPUT_CLASS}
              type="text"
              value={sku}
              onChange={event => setSku(event.target.value)}
            />
          </div>
        </section>

        <section
          className={cn(CARD_CLASS, 'grid gap-4 sm:grid-cols-2')}
          aria-label={t('sections.catalogAttributes')}
        >
          <div>
            <label className={LABEL_CLASS} htmlFor="category">
              {t('fields.category')}
            </label>
            <select
              id="category"
              name="category"
              className={INPUT_CLASS}
              value={category}
              onChange={event => setCategory(event.target.value)}
            >
              <option value="">{t('fields.selectCategory')}</option>
              {CATEGORIES.filter(
                categoryOption => categoryOption.slug !== 'all'
              ).map(categoryOption => (
                <option key={categoryOption.slug} value={categoryOption.slug}>
                  {categoryOption.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="type">
              {t('fields.type')}
            </label>
            <select
              id="type"
              name="type"
              className={INPUT_CLASS}
              value={type}
              onChange={event => setType(event.target.value)}
            >
              <option value="">{t('fields.selectType')}</option>
              {PRODUCT_TYPES.map(productType => (
                <option key={productType.slug} value={productType.slug}>
                  {productType.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section
          className={cn(CARD_CLASS, 'grid gap-4 sm:grid-cols-2')}
          aria-label={t('sections.variants')}
        >
          <fieldset>
            <legend className={LABEL_CLASS}>{t('fields.colors')}</legend>
            <div className="border-border bg-muted/20 mt-2 flex flex-col gap-2 rounded-lg border px-3 py-3">
              {COLORS.map(color => (
                <label
                  key={color.slug}
                  className="text-foreground flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    value={color.slug}
                    checked={selectedColors.includes(color.slug)}
                    onChange={event => {
                      if (event.target.checked) {
                        setSelectedColors(prev => [...prev, color.slug]);
                      } else {
                        setSelectedColors(prev =>
                          prev.filter(
                            selectedColor => selectedColor !== color.slug
                          )
                        );
                      }
                    }}
                  />
                  <span>{color.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={LABEL_CLASS}>{t('fields.sizes')}</legend>
            <div className="border-border bg-muted/20 mt-2 flex flex-col gap-2 rounded-lg border px-3 py-3">
              {SIZES.map(size => (
                <label
                  key={size}
                  className="text-foreground flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    value={size}
                    checked={selectedSizes.includes(size)}
                    onChange={event => {
                      if (event.target.checked) {
                        setSelectedSizes(prev => [...prev, size]);
                      } else {
                        setSelectedSizes(prev =>
                          prev.filter(selectedSize => selectedSize !== size)
                        );
                      }
                    }}
                  />
                  <span>{size}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section
          className={cn(CARD_CLASS, 'grid gap-4 sm:grid-cols-2')}
          aria-label={t('sections.flagsBadge')}
        >
          <div>
            <label className={LABEL_CLASS} htmlFor="badge">
              {t('fields.badge')}
            </label>
            <select
              id="badge"
              name="badge"
              className={INPUT_CLASS}
              value={badge}
              onChange={event => {
                const next = event.target.value as ProductAdminInput['badge'];
                setBadge(next);

                if (next !== 'SALE') {
                  setOriginalPriceErrors({});
                }
              }}
            >
              <option value="NONE">{t('badge.none')}</option>
              <option value="SALE">{t('badge.sale')}</option>
              <option value="NEW">{t('badge.new')}</option>
            </select>
          </div>

          <div className="border-border bg-muted/20 flex flex-wrap items-center gap-6 rounded-lg border px-4 py-3">
            <div className="flex items-center space-x-2">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                checked={isActive}
                onChange={event => setIsActive(event.target.checked)}
                className="border-border text-accent focus:ring-accent h-4 w-4 rounded"
              />
              <label
                className="text-foreground text-sm font-medium"
                htmlFor="isActive"
              >
                {t('fields.isActive')}
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                id="isFeatured"
                name="isFeatured"
                type="checkbox"
                checked={isFeatured}
                onChange={event => setIsFeatured(event.target.checked)}
                className="border-border text-accent focus:ring-accent h-4 w-4 rounded"
              />
              <label
                className="text-foreground text-sm font-medium"
                htmlFor="isFeatured"
              >
                {t('fields.isFeatured')}
              </label>
            </div>
          </div>
        </section>

        <section className={CARD_CLASS} aria-label={t('sections.description')}>
          <label className={LABEL_CLASS} htmlFor="description">
            {t('fields.description')}
          </label>
          <textarea
            id="description"
            name="description"
            className={cn(TEXTAREA_CLASS, 'mt-2')}
            rows={4}
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
        </section>

        <section className={CARD_CLASS} aria-label={t('sections.photoManagement')}>
          <label className={LABEL_CLASS} htmlFor="images">
            {t('fields.photos')}
          </label>
          <input
            id="images"
            name="images"
            className={cn(INPUT_CLASS, 'mt-2 h-auto py-2')}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoFilesChange}
            aria-invalid={imageError ? true : undefined}
            aria-describedby={imageError ? imageErrorId : undefined}
          />
          <p className="text-muted-foreground mt-2 text-sm">
            {t('photos.helper')}
          </p>
          {photos.length > 0 ? (
            <div className="mt-4 space-y-3">
              {photos.map((photo, index) => (
                <div
                  key={photo.key}
                  className="border-border bg-muted/20 flex items-start gap-4 rounded-lg border p-4"
                >
                  <Image
                    src={photo.previewUrl}
                    alt={t('photos.photoAlt', { index: index + 1 })}
                    width={96}
                    height={96}
                    unoptimized
                    className="h-24 w-24 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">
                        {t('photos.photoLabel', { index: index + 1 })}
                      </span>
                      {photo.isPrimary ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500">
                          {t('photos.primary')}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground text-xs">
                        {photo.source === 'existing'
                          ? t('photos.status.saved')
                          : photo.source === 'legacy'
                            ? t('photos.status.legacy')
                            : t('photos.status.new')}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={SECONDARY_BUTTON_CLASS}
                        onClick={() => setPrimaryPhoto(photo.key)}
                        disabled={photo.isPrimary}
                      >
                        {t('photos.actions.setPrimary')}
                      </button>
                      <button
                        type="button"
                        className={SECONDARY_BUTTON_CLASS}
                        onClick={() => movePhoto(photo.key, -1)}
                        disabled={index === 0}
                      >
                        {t('photos.actions.moveUp')}
                      </button>
                      <button
                        type="button"
                        className={SECONDARY_BUTTON_CLASS}
                        onClick={() => movePhoto(photo.key, 1)}
                        disabled={index === photos.length - 1}
                      >
                        {t('photos.actions.moveDown')}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-red-500/30 px-3 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
                        onClick={() => removePhoto(photo.key)}
                      >
                        {t('photos.actions.remove')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {imageError ? (
            <p
              id={imageErrorId}
              className="mt-1 text-sm text-red-600"
              role="alert"
            >
              {imageError}
            </p>
          ) : null}
        </section>

        <button
          type="submit"
          className={PRIMARY_BUTTON_CLASS}
          disabled={isSubmitting}
          aria-disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting
            ? mode === 'create'
              ? t('actions.creating')
              : t('actions.updating')
            : mode === 'create'
              ? t('actions.create')
              : t('actions.save')}
        </button>
      </form>
    </section>
  );
}
