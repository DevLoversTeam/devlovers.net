import 'server-only';

import {
  getActiveProductsPage,
  getPublicProductBaseBySlug,
  getPublicProductBySlug,
} from '@/db/queries/shop/products';
import {
  CATALOG_PAGE_SIZE,
  type CatalogSort,
  CATEGORY_TILES,
} from '@/lib/config/catalog';
import { logError } from '@/lib/logging';
import {
  type CatalogFilters,
  catalogFilterSchema,
  type DbProduct,
  dbProductSchema,
  type ProductBadge,
  productBadgeValues,
  type ProductImage,
  type ShopProduct as ValidationShopProduct,
  type ShopProductImage,
  shopProductSchema,
} from '@/lib/validation/shop';

import { resolveStandardStorefrontCurrency } from './commercial-policy';
import { fromDbMoney } from './money';

export type ShopProduct = ValidationShopProduct;

export interface ShopCategory {
  id: string;
  name: string;
  slug: string;
  image: string;
}

export interface HomepageContent {
  newArrivals: ShopProduct[];
  categories: readonly ShopCategory[];
}

export interface CatalogPage {
  products: ShopProduct[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ProductPageDisplayProduct {
  id: string;
  slug: string;
  name: string;
  image: string;
  images: ShopProductImage[];
  primaryImage?: ShopProductImage;
  description?: string;
  badge: ProductBadge;
}

type AvailableProductPageViewModelInput = {
  kind: 'available';
  commerceProduct: ShopProduct;
};

type UnavailableProductPageViewModelInput = {
  kind: 'unavailable';
  product: ProductPageDisplayProduct;
  commerceProduct: null;
};

export type ProductPageData =
  | (AvailableProductPageViewModelInput & {
      product: ProductPageDisplayProduct;
    })
  | UnavailableProductPageViewModelInput
  | { kind: 'not_found' };

type ProductPageViewModelInput =
  | AvailableProductPageViewModelInput
  | UnavailableProductPageViewModelInput
  | { kind: 'not_found' };

export async function getProductPageData(
  slug: string,
  locale: string = 'en'
): Promise<ProductPageData> {
  void locale;
  const currency = resolveStandardStorefrontCurrency();

  const dbProduct = await getPublicProductBySlug(slug, currency);
  if (dbProduct) {
    const mapped = mapToShopProduct(dbProduct);
    if (!mapped) {
      throw new Error(
        `Invalid shop product data for PDP: slug=${slug} productId=${dbProduct.id}`
      );
    }

    return toProductPageViewModel({
      kind: 'available',
      commerceProduct: mapped,
    });
  }

  const base = await getPublicProductBaseBySlug(slug);
  if (!base) return { kind: 'not_found' };

  const badge: ProductBadge = productBadgeValues.includes(
    base.badge as ProductBadge
  )
    ? (base.badge as ProductBadge)
    : 'NONE';

  return toProductPageViewModel({
    kind: 'unavailable',
    product: {
      id: base.id,
      slug: base.slug,
      name: base.title,
      image: base.imageUrl || placeholderImage,
      images: base.images.map(mapToShopProductImage),
      primaryImage: base.primaryImage
        ? mapToShopProductImage(base.primaryImage)
        : undefined,
      description: base.description ?? undefined,
      badge,
    },
    commerceProduct: null,
  });
}

export class CatalogValidationError extends Error {
  readonly status = 400;
  readonly details: unknown;

  constructor(details: unknown) {
    super('Invalid catalog query');
    this.name = 'CatalogValidationError';
    this.details = details;
  }
}

const placeholderImage = '/placeholder.svg';

type ProductGallerySource = {
  image?: string;
  images?: ShopProductImage[];
  primaryImage?: ShopProductImage;
};

function getGalleryIdentity(
  image: Pick<ShopProductImage, 'id' | 'url'>
): string {
  return image.id || image.url;
}

function mapToShopProductImage(image: ProductImage) {
  return {
    id: image.id,
    url: image.imageUrl || placeholderImage,
    publicId: image.imagePublicId,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
  };
}

function toProductPageDisplayProduct(input: {
  id: string;
  slug: string;
  name: string;
  image: string;
  images?: ShopProductImage[];
  primaryImage?: ShopProductImage;
  description?: string;
  badge: ProductBadge;
}): ProductPageDisplayProduct {
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    image: input.image,
    images: input.images ?? [],
    primaryImage: input.primaryImage,
    description: input.description,
    badge: input.badge,
  };
}

export function toProductPageViewModel(
  data: ProductPageViewModelInput
): ProductPageData {
  if (data.kind === 'not_found') return data;

  if (data.kind === 'available') {
    return {
      kind: 'available',
      product: toProductPageDisplayProduct({
        id: data.commerceProduct.id,
        slug: data.commerceProduct.slug,
        name: data.commerceProduct.name,
        image: data.commerceProduct.image,
        images: data.commerceProduct.images,
        primaryImage: data.commerceProduct.primaryImage,
        description: data.commerceProduct.description,
        badge: data.commerceProduct.badge ?? 'NONE',
      }),
      commerceProduct: data.commerceProduct,
    };
  }

  return {
    kind: 'unavailable',
    product: toProductPageDisplayProduct(data.product),
    commerceProduct: null,
  };
}

export function getProductGalleryImages(
  product: ProductGallerySource
): ShopProductImage[] {
  const explicitImages = Array.isArray(product.images)
    ? product.images.filter(
        image => typeof image?.url === 'string' && image.url.trim().length > 0
      )
    : [];

  const explicitPrimary =
    (product.primaryImage &&
    typeof product.primaryImage.url === 'string' &&
    product.primaryImage.url.trim().length > 0
      ? product.primaryImage
      : undefined) ??
    explicitImages.find(image => image.isPrimary) ??
    explicitImages[0];

  if (explicitImages.length > 0) {
    const seen = new Set<string>();
    const ordered: ShopProductImage[] = [];

    const pushImage = (image?: ShopProductImage) => {
      if (!image) return;
      const identity = getGalleryIdentity(image);
      if (seen.has(identity)) return;
      seen.add(identity);
      ordered.push(image);
    };

    pushImage(explicitPrimary);
    explicitImages.forEach(pushImage);

    return ordered;
  }

  const fallbackUrl =
    typeof product.image === 'string' && product.image.trim().length > 0
      ? product.image
      : placeholderImage;

  return [
    {
      id: 'fallback:primary',
      url: fallbackUrl,
      publicId: undefined,
      sortOrder: 0,
      isPrimary: true,
    },
  ];
}

function deriveStock(product: DbProduct): boolean {
  if (!product.isActive) return false;
  return product.stock > 0;
}

function deriveBadge(product: DbProduct): ProductBadge {
  const priceCents = fromDbMoney(product.price);
  const originalPriceCents = product.originalPrice
    ? fromDbMoney(product.originalPrice)
    : undefined;

  if (product.badge === 'SALE') return 'SALE';

  if (originalPriceCents !== undefined && originalPriceCents > priceCents) {
    return 'SALE';
  }

  return productBadgeValues.includes(product.badge as ProductBadge)
    ? (product.badge as ProductBadge)
    : 'NONE';
}

function validateDbProduct(product: DbProduct): DbProduct | null {
  const parsed = dbProductSchema.safeParse(product);
  if (!parsed.success) {
    logError('shop_invalid_db_product', parsed.error, {
      productId: product?.id ?? null,
      slug: product?.slug ?? null,
      currency: (product as any)?.currency ?? null,
    });
    return null;
  }
  return parsed.data;
}

function validateCatalogFilters(filters: unknown): CatalogFilters {
  const parsedFilters = catalogFilterSchema.safeParse(filters);

  if (!parsedFilters.success) {
    throw new CatalogValidationError(parsedFilters.error.format());
  }

  return parsedFilters.data;
}

function mapToShopProduct(product: DbProduct): ShopProduct | null {
  const validated = validateDbProduct(product);
  if (!validated) return null;

  const inStock = deriveStock(validated);
  const badge = deriveBadge(validated);

  const candidate = {
    id: validated.id,
    slug: validated.slug,
    name: validated.title,
    price: fromDbMoney(validated.price),
    currency: validated.currency,
    image:
      validated.primaryImage?.imageUrl ||
      validated.imageUrl ||
      placeholderImage,
    images: validated.images.map(mapToShopProductImage),
    primaryImage: validated.primaryImage
      ? mapToShopProductImage(validated.primaryImage)
      : undefined,
    originalPrice: validated.originalPrice
      ? fromDbMoney(validated.originalPrice)
      : undefined,
    createdAt: validated.createdAt,
    category: validated.category ?? undefined,
    type: validated.type ?? undefined,
    colors: validated.colors ?? [],
    sizes: validated.sizes ?? [],
    description: validated.description ?? undefined,
    badge,
    inStock,
  };

  const parsed = shopProductSchema.safeParse(candidate);
  if (!parsed.success) {
    logError('shop_invalid_shop_product', parsed.error, {
      productId: validated.id,
      slug: validated.slug,
      currency: validated.currency,
    });
    return null;
  }

  return parsed.data;
}

export async function getCatalogProducts(
  filters: unknown,
  locale: string = 'en'
): Promise<CatalogPage> {
  const { category, type, color, size, sort, page, limit } =
    validateCatalogFilters(filters);

  void locale;
  const currency = resolveStandardStorefrontCurrency();

  const { items, total } = await getActiveProductsPage({
    currency,
    limit,
    offset: (page - 1) * limit,
    category,
    type,
    color,
    size,
    sort: sort as CatalogSort | undefined,
  });

  const products = items
    .map(mapToShopProduct)
    .filter((product): product is ShopProduct => product !== null);

  const hasMore = page * limit < total;

  return { products, total, page, pageSize: limit, hasMore };
}

export async function getProductDetail(
  slug: string,
  locale: string = 'en'
): Promise<ShopProduct | null> {
  try {
    void locale;
    const currency = resolveStandardStorefrontCurrency();

    const dbProduct = await getPublicProductBySlug(slug, currency);

    if (!dbProduct) return null;

    return mapToShopProduct(dbProduct) ?? null;
  } catch (error) {
    logError('shop_load_product_failed', error, { slug, locale });
    return null;
  }
}

export async function getHomepageContent(
  locale: string = 'en'
): Promise<HomepageContent> {
  const newestCatalog = await getCatalogProducts(
    {
      category: 'all',
      sort: 'newest',
      page: 1,
      limit: Math.max(12, CATALOG_PAGE_SIZE),
    },
    locale
  );

  const newArrivals = newestCatalog.products.slice(0, 4);

  return {
    newArrivals,
    categories: CATEGORY_TILES,
  };
}
