import { Link } from '@/i18n/routing';
import { and, desc, eq } from 'drizzle-orm';
import { ShopAdminTopbar } from '@/components/shop/admin/shop-admin-topbar';
import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';

import { AdminProductStatusToggle } from '@/components/shop/admin/admin-product-status-toggle';
import { AdminPagination } from '@/components/shop/admin/admin-pagination';
import { db } from '@/db';
import { products, productPrices } from '@/db/schema';
import { formatMoney, resolveCurrencyFromLocale } from '@/lib/shop/currency';
import { fromDbMoney } from '@/lib/shop/money';
import { logWarn } from '@/lib/logging';

const PAGE_SIZE = 25;

function parsePage(input: string | undefined): number {
  const n = Number.parseInt(input ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function formatDate(value: Date | null, locale: string) {
  if (!value) return '-';
  return value.toLocaleDateString(locale);
}

function safeFromDbMoney(
  value: unknown,
  ctx: { productId: string; currency: string }
): number | null {
  if (value == null) return null;

  try {
    return fromDbMoney(value);
  } catch (err) {
    logWarn('admin_products_from_db_money_failed', {
      ...ctx,
      valueType: typeof value,
      value,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export default async function AdminProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await guardShopAdminPage();
  const { locale } = await params;
  const sp = await searchParams;

  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  const displayCurrency = resolveCurrencyFromLocale(locale);

  const all = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      category: products.category,
      type: products.type,
      stock: products.stock,
      badge: products.badge,
      isActive: products.isActive,
      isFeatured: products.isFeatured,
      createdAt: products.createdAt,
      price: productPrices.price,
    })
    .from(products)
    .leftJoin(
      productPrices,
      and(
        eq(productPrices.productId, products.id),
        eq(productPrices.currency, displayCurrency)
      )
    )
    // стабільне сортування (tie-breaker)
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasNext = all.length > PAGE_SIZE;
  const rows = all.slice(0, PAGE_SIZE);

  return (
    <>
      <ShopAdminTopbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Admin · Products</h1>
          <Link
            href="/shop/admin/products/new"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            New product
          </Link>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full table-fixed divide-y divide-border text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-[20%] px-3 py-2 text-left font-semibold text-foreground">Title</th>
                <th className="w-[18%] px-3 py-2 text-left font-semibold text-foreground">Slug</th>
                <th className="w-[8%] px-3 py-2 text-left font-semibold text-foreground">Price</th>
                <th className="w-[8%] px-3 py-2 text-left font-semibold text-foreground">Category</th>
                <th className="w-[8%] px-3 py-2 text-left font-semibold text-foreground">Type</th>
                <th className="w-[5%] px-3 py-2 text-left font-semibold text-foreground">Stock</th>
                <th className="w-[5%] px-3 py-2 text-left font-semibold text-foreground">Badge</th>
                <th className="w-[5%] px-3 py-2 text-left font-semibold text-foreground">Active</th>
                <th className="w-[6%] px-3 py-2 text-left font-semibold text-foreground">Featured</th>
                <th className="w-[8%] px-3 py-2 text-left font-semibold text-foreground">Created</th>
                <th className="w-[9%] px-3 py-2 text-left font-semibold text-foreground">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {rows.map(row => {
                const priceMinor = safeFromDbMoney(row.price, {
                  productId: row.id,
                  currency: displayCurrency,
                });

                return (
                  <tr key={row.id} className="hover:bg-muted/50">
                    <td className="px-3 py-2 font-medium text-foreground max-w-0">
                      <div className="truncate" title={row.title}>{row.title}</div>
                    </td>

                    <td className="px-3 py-2 text-muted-foreground max-w-0">
                      <div className="truncate" title={row.slug}>{row.slug}</div>
                    </td>

                    <td className="px-3 py-2 text-foreground whitespace-nowrap">
                      {priceMinor === null ? '-' : formatMoney(priceMinor, displayCurrency, locale)}
                    </td>

                    <td className="px-3 py-2 text-muted-foreground max-w-0">
                      <div className="truncate" title={row.category ?? '-'}>{row.category ?? '-'}</div>
                    </td>

                    <td className="px-3 py-2 text-muted-foreground max-w-0">
                      <div className="truncate" title={row.type ?? '-'}>{row.type ?? '-'}</div>
                    </td>

                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{row.stock}</td>

                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {row.badge === 'NONE' ? '-' : row.badge}
                    </td>

                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                        {row.isActive ? 'Yes' : 'No'}
                      </span>
                    </td>

                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                        {row.isFeatured ? 'Yes' : 'No'}
                      </span>
                    </td>

                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {formatDate(row.createdAt, locale)}
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/shop/products/${row.slug}`}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                          View
                        </Link>
                        <Link
                          href={`/shop/admin/products/${row.id}/edit`}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                          Edit
                        </Link>
                        <AdminProductStatusToggle id={row.id} initialIsActive={row.isActive} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <AdminPagination
            basePath="/shop/admin/products"
            page={page}
            hasNext={hasNext}
          />
        </div>
      </div>
    </>
  );
}
