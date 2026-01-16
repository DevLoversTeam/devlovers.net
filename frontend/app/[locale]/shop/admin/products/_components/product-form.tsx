'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CATEGORIES, COLORS, PRODUCT_TYPES, SIZES } from '@/lib/config/catalog';
import type { ProductAdminInput } from '@/lib/validation/shop';
import { logError } from '@/lib/logging';

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
  initialValues?: Partial<ProductAdminInput> & { imageUrl?: string };
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

type SaleRuleDetails = {
  currency?: CurrencyCode;
  field?: string;
  rule?: 'required' | 'greater_than_price';
};

const SALE_REQUIRED_MSG = 'Original price is required for SALE.';
const SALE_GREATER_MSG = 'Original price must be greater than price for SALE.';

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
    throw new Error(`Invalid money value: "${value}"`);
  }
  const [whole, frac = ''] = s.split('.');
  const frac2 = (frac + '00').slice(0, 2);
  const minor = Number(whole) * 100 + Number(frac2);
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new Error(`Invalid money value: "${value}"`);
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

export function ProductForm({
  mode,
  productId,
  initialValues,
}: ProductFormProps) {
  const router = useRouter();

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

  const [imageFile, setImageFile] = useState<File | null>(null);
  const existingImageUrl = initialValues?.imageUrl;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [originalPriceErrors, setOriginalPriceErrors] = useState<
    Partial<Record<CurrencyCode, string>>
  >({});

  // Hydrate state from initialValues once per product in EDIT mode.
  // In edit: slug must come from DB and stay stable (no title->slug regeneration).
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

    // Reset transient UI state when switching between products in EDIT mode.
    // Do NOT do this in submit: it breaks retries (e.g., clears selected image).
    setError(null);
    setSlugError(null);
    setImageError(null);
    setOriginalPriceErrors({});
    setIsSubmitting(false);
    setImageFile(null);

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
    hydratedKeyRef.current = key;
  }, [mode, initialValues, productId]);

  const slugValue = useMemo(() => {
    if (mode === 'edit') return slug; // slug в edit має бути стабільним (з БД)
    // In create mode, always derive from current title to avoid stale slug on fast submit.
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

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    setImageError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError(null);
    setSlugError(null);
    setImageError(null);
    setOriginalPriceErrors({});

    if (mode === 'create' && !imageFile) {
      setImageError('Image file is required.');
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

      for (const p of effectivePrices) {
        if (!p.price.length && p.originalPrice.length) {
          setError(
            `${p.currency}: price is required when original price is set.`
          );
          return;
        }
      }

      const usd = effectivePrices.find(p => p.currency === 'USD');
      if (!usd || !usd.price.length) {
        setError('USD price is required.');
        return;
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
        setError(e instanceof Error ? e.message : 'Invalid price value.');
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

      if (imageFile) {
        formData.append('image', imageFile);
      }

      const response = await fetch(
        mode === 'create'
          ? '/api/shop/admin/products'
          : `/api/shop/admin/products/${productId}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          body: formData,
        }
      );

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        if (data.code === 'SLUG_CONFLICT' || data.field === 'slug') {
          setSlugError('This slug is already used. Try changing the title.');
        }

        if (data.code === 'IMAGE_UPLOAD_FAILED' || data.field === 'image') {
          setImageError(data.error ?? 'Failed to upload image');
        }

        if (data.code === 'SALE_ORIGINAL_REQUIRED') {
          const details = data.details as SaleRuleDetails | undefined;
          const currency = details?.currency;
          const msg =
            details?.rule === 'greater_than_price'
              ? SALE_GREATER_MSG
              : SALE_REQUIRED_MSG;

          if (currency === 'USD' || currency === 'UAH') {
            setOriginalPriceErrors(prev => ({ ...prev, [currency]: msg }));
          }

          setError(data.error ?? msg);
          return;
        }

        setError(
          data.error ??
            `Failed to ${mode === 'create' ? 'create' : 'update'} product`
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
        `Unexpected error while ${
          mode === 'create' ? 'creating' : 'updating'
        } product.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const describedBySlug = slugError
    ? `${slugHelpId} ${slugErrorId}`
    : slugHelpId;

  return (
    <section
      className="mx-auto max-w-2xl px-4 py-8"
      aria-labelledby={headingId}
    >
      <header>
        <h1 id={headingId} className="text-2xl font-bold text-foreground">
          {mode === 'create' ? 'Create new product' : 'Edit product'}
        </h1>
      </header>

      {error ? (
        <div
          id={formErrorId}
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <form
        className="mt-6 space-y-4"
        onSubmit={handleSubmit}
        encType="multipart/form-data"
        aria-describedby={error ? formErrorId : undefined}
      >
        <section className="grid gap-4 sm:grid-cols-2" aria-label="Basic info">
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="title"
            >
              Title
            </label>
            <input
              id="title"
              name="title"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              type="text"
              value={title}
              onChange={event => setTitle(event.target.value)}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="slug"
              >
                Slug
              </label>
              <span id={slugHelpId} className="text-xs text-muted-foreground">
                Auto-generated from title
              </span>
            </div>
            <input
              id="slug"
              name="slug"
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
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

        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold text-foreground">
            Prices
          </legend>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">
                USD (required)
              </legend>

              <div>
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="price-usd"
                >
                  Price (USD)
                </label>
                <input
                  id="price-usd"
                  name="price-usd"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  type="text"
                  inputMode="decimal"
                  placeholder="59.00"
                  value={usdRow?.price ?? ''}
                  onChange={e => setPriceField('USD', 'price', e.target.value)}
                  required
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="original-usd"
                >
                  Original price (USD)
                </label>
                <input
                  id="original-usd"
                  name="original-usd"
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    usdOriginalError ? 'border-red-500' : 'border-border'
                  }`}
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

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">
                UAH (optional)
              </legend>

              <div>
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="price-uah"
                >
                  Price (UAH)
                </label>
                <input
                  id="price-uah"
                  name="price-uah"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  type="text"
                  inputMode="decimal"
                  placeholder="1999.00"
                  value={uahRow?.price ?? ''}
                  onChange={e => setPriceField('UAH', 'price', e.target.value)}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="original-uah"
                >
                  Original price (UAH)
                </label>
                <input
                  id="original-uah"
                  name="original-uah"
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    uahOriginalError ? 'border-red-500' : 'border-border'
                  }`}
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
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Checkout currency is server-selected by locale. Prices must exist in{' '}
            <span className="font-mono">product_prices</span> for that currency,
            or checkout fails.
          </p>
        </fieldset>

        <section
          className="grid gap-4 sm:grid-cols-2"
          aria-label="Inventory and SKU"
        >
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="stock"
            >
              Stock
            </label>
            <input
              id="stock"
              name="stock"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              type="number"
              value={stock}
              onChange={event => setStock(event.target.value)}
              min={0}
              inputMode="numeric"
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="sku"
            >
              SKU
            </label>
            <input
              id="sku"
              name="sku"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              type="text"
              value={sku}
              onChange={event => setSku(event.target.value)}
            />
          </div>
        </section>

        <section
          className="grid gap-4 sm:grid-cols-2"
          aria-label="Catalog attributes"
        >
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="category"
            >
              Category
            </label>
            <select
              id="category"
              name="category"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              value={category}
              onChange={event => setCategory(event.target.value)}
            >
              <option value="">Select category</option>
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
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="type"
            >
              Type
            </label>
            <select
              id="type"
              name="type"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              value={type}
              onChange={event => setType(event.target.value)}
            >
              <option value="">Select type</option>
              {PRODUCT_TYPES.map(productType => (
                <option key={productType.slug} value={productType.slug}>
                  {productType.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Variants">
          <fieldset>
            <legend className="block text-sm font-medium text-foreground">
              Colors
            </legend>
            <div className="mt-2 flex flex-col gap-2 rounded-md border border-border px-3 py-2">
              {COLORS.map(color => (
                <label
                  key={color.slug}
                  className="flex items-center gap-2 text-sm text-foreground"
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
            <legend className="block text-sm font-medium text-foreground">
              Sizes
            </legend>
            <div className="mt-2 flex flex-col gap-2 rounded-md border border-border px-3 py-2">
              {SIZES.map(size => (
                <label
                  key={size}
                  className="flex items-center gap-2 text-sm text-foreground"
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
          className="grid gap-4 sm:grid-cols-2"
          aria-label="Flags and badge"
        >
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="badge"
            >
              Badge
            </label>
            <select
              id="badge"
              name="badge"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              value={badge}
              onChange={event => {
                const next = event.target.value as ProductAdminInput['badge'];
                setBadge(next);

                if (next !== 'SALE') {
                  setOriginalPriceErrors({});
                }
              }}
            >
              <option value="NONE">None</option>
              <option value="SALE">SALE</option>
              <option value="NEW">NEW</option>
            </select>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center space-x-2">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                checked={isActive}
                onChange={event => setIsActive(event.target.checked)}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="isActive"
              >
                Is Active
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                id="isFeatured"
                name="isFeatured"
                type="checkbox"
                checked={isFeatured}
                onChange={event => setIsFeatured(event.target.checked)}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="isFeatured"
              >
                Is Featured
              </label>
            </div>
          </div>
        </section>

        <section aria-label="Description">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="description"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            rows={4}
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
        </section>

        <section aria-label="Image upload">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="image"
          >
            Image
          </label>
          <input
            id="image"
            name="image"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            required={mode === 'create'}
            aria-invalid={imageError ? true : undefined}
            aria-describedby={imageError ? imageErrorId : undefined}
          />
          {existingImageUrl && !imageFile ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Current image will be kept unless you upload a new one.
            </p>
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
          className="mt-6 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
          disabled={isSubmitting}
          aria-disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting
            ? mode === 'create'
              ? 'Creating...'
              : 'Updating...'
            : mode === 'create'
            ? 'Create product'
            : 'Save changes'}
        </button>
      </form>
    </section>
  );
}
