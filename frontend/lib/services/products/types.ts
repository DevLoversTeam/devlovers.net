import type { CurrencyCode } from '@/lib/shop/currency';

export type AdminProductPriceRow = {
  currency: CurrencyCode;

  priceMinor: number;
  originalPriceMinor: number | null;

  price: string;
  originalPrice: string | null;
};

export type AdminProductsFilter = {
  isActive?: boolean;
  category?: string;
  type?: string;
};

export type ProductsTable = typeof import('@/db/schema').products;
export type ProductRow = ProductsTable['$inferSelect'];
export type DbClient = typeof import('@/db').db;

export type NormalizedPriceRow = {
  currency: CurrencyCode;
  priceMinor: number;
  originalPriceMinor: number | null;
};
