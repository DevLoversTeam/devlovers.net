import {
  CATALOG_PAGE_SIZE,
  CATEGORY_TILES,
  type CatalogSort,
} from '@/lib/config/catalog';
import {
  catalogFilterSchema,
  dbProductSchema,
  productBadgeValues,
  shopProductSchema,
  type CatalogFilters,
  type DbProduct,
  type ProductBadge,
  type ShopProduct as ValidationShopProduct,
} from '@/lib/validation/shop';
import {
  getActiveProductsPage,
  getFeaturedProducts,
  getPublicProductBySlug,
} from '@/db/queries/shop/products';
import { fromDbMoney } from './money';
import { resolveCurrencyFromLocale } from './currency';
import { getPublicProductBaseBySlug } from '@/db/queries/shop/products';
import { logError } from '@/lib/logging';

export type ShopProduct = ValidationShopProduct;

export interface ShopCategory {
  id: string;
  name: string;
  slug: string;
  image: string;
}

export interface HomepageContent {
  hero: {
    headline: string;
    subheadline: string;
    ctaText: string;
    ctaLink: string;
  };
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

export type ProductPageData =
  | { kind: 'available'; product: ShopProduct }
  | {
      kind: 'unavailable';
      product: {
        id: string;
        slug: string;
        name: string;
        image: string;
        description?: string;
        badge: ProductBadge;
      };
    }
  | { kind: 'not_found' };

export async function getProductPageData(
  slug: string,
  locale: string = 'en'
): Promise<ProductPageData> {
  const currency = resolveCurrencyFromLocale(locale);

  const dbProduct = await getPublicProductBySlug(slug, currency);
  if (dbProduct) {
    const mapped = mapToShopProduct(dbProduct);
    if (mapped) return { kind: 'available', product: mapped };
    return { kind: 'not_found' };
  }

  const base = await getPublicProductBaseBySlug(slug);
  if (!base) return { kind: 'not_found' };

  const badge: ProductBadge = productBadgeValues.includes(
    base.badge as ProductBadge
  )
    ? (base.badge as ProductBadge)
    : 'NONE';

  return {
    kind: 'unavailable',
    product: {
      id: base.id,
      slug: base.slug,
      name: base.title,
      image: base.imageUrl || placeholderImage,
      description: base.description ?? undefined,
      badge,
    },
  };
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
    image: validated.imageUrl || placeholderImage,
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

/**
 * IMPORTANT:
 * Pass `locale` from the route segment when possible (app/[locale]/...),
 * because currency policy is locale-based: uk -> UAH, otherwise USD.
 */
export async function getCatalogProducts(
  filters: unknown,
  locale: string = 'en'
): Promise<CatalogPage> {
  const { category, type, color, size, sort, page, limit } =
    validateCatalogFilters(filters);

  const currency = resolveCurrencyFromLocale(locale);

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
    const currency = resolveCurrencyFromLocale(locale);

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
  const currency = resolveCurrencyFromLocale(locale);

  const featured: DbProduct[] = await getFeaturedProducts(currency, 4);

  const featuredProducts = featured
    .map(mapToShopProduct)
    .filter((product): product is ShopProduct => product !== null);

  const fallbackCatalog = featuredProducts.length
    ? featuredProducts
    : (
        await getCatalogProducts(
          { category: 'all', page: 1, limit: CATALOG_PAGE_SIZE },
          locale
        )
      ).products.slice(0, 4);

  return {
    hero: {
      headline: 'Postgres-powered storefront for developers',
      subheadline:
        'All product content now lives in Neon/Postgres via Drizzle—no CMS required.',
      ctaText: 'Shop now',
      ctaLink: '/shop/products',
    },
    newArrivals: fallbackCatalog,
    categories: CATEGORY_TILES,
  };
}
