import type { CurrencyCode } from '@/lib/shop/currency';

export type AdminProductPriceRow = {
  currency: CurrencyCode;
  // canonical (minor units)
  priceMinor: number;
  originalPriceMinor: number | null;
  // legacy mirror (keep during rollout)
  price: string;
  originalPrice: string | null;
};

export type AdminProductsFilter = {
  isActive?: boolean;
  category?: string;
  type?: string;
};

// Internal typing helpers (used across products/* modules)
export type ProductsTable = typeof import('@/db/schema').products;
export type ProductRow = ProductsTable['$inferSelect'];
export type DbClient = typeof import('@/db').db;

export type NormalizedPriceRow = {
  currency: CurrencyCode;
  priceMinor: number;
  originalPriceMinor: number | null;
};
