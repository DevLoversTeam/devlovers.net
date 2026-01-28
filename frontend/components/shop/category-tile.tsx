import Image from 'next/image';
import { Link } from '@/i18n/routing';
import type { ShopCategory } from '@/lib/shop/data';
import { getTranslations } from 'next-intl/server';

interface CategoryTileProps {
  category: ShopCategory;
}

export async function CategoryTile({ category }: CategoryTileProps) {
  const t = await getTranslations('shop.products');
  const tCategories = await getTranslations('shop.catalog.categories');
  const tCategoryTile = await getTranslations('shop.categoryTile');
  const href = `/shop/products?category=${encodeURIComponent(category.slug)}`;

  const categoryName = tCategories(category.slug);

  return (
    <Link
      href={href}
      aria-label={tCategoryTile('shopCategory', { name: categoryName })}
      className={[
        // IMPORTANT: make it block-level so aspect-ratio + Image fill work correctly
        'group relative block w-full',
        'aspect-[4/3] overflow-hidden rounded-lg bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      ].join(' ')}
    >
      <Image
        src={category.image || '/placeholder.svg'}
        alt={categoryName}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />

      <div
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
        aria-hidden="true"
      />

      <div className="absolute bottom-0 left-0 p-5 sm:p-6">
        <h3 className="text-xl font-bold text-white sm:text-2xl">
          {categoryName}
        </h3>

        <span
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-white/90 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        >
          {t('shopNow')} <span>→</span>
        </span>
      </div>
    </Link>
  );
}
