import { ProductCard } from '@/components/shop/product-card';
import { Hero } from '@/components/shop/shop-hero';
import { CategoryTile } from '@/components/shop/category-tile';
import { getHomepageContent } from '@/lib/shop/data';
import Link from 'next/link';

export default async function HomePage() {
  const content = await getHomepageContent();

  return (
    <>
      <Hero
        headline={content.hero.headline}
        subheadline={content.hero.subheadline}
        ctaText={content.hero.ctaText}
        ctaLink={content.hero.ctaLink}
      />

      <section className="border-t border-border bg-background py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              New Arrivals
            </h2>
            <Link
              href="/shop/products?filter=new"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              View all →
            </Link>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {content.newArrivals.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-background py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Shop by Category
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {content.categories.map(category => (
              <CategoryTile key={category.id} category={category} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-foreground py-16 text-background">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Code. Create. Collect.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-background/80">
            Join thousands of developers who express their passion through
            premium merch.
          </p>
          <div className="mt-8">
            <Link
              href="/shop/products"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-colors hover:bg-accent/90"
            >
              Browse all products
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
