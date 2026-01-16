// C:\Users\milka\devlovers.net-clean\frontend\components\shop\catalog-load-more.tsx

'use client';

interface CatalogLoadMoreProps {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

export function CatalogLoadMore({
  hasMore,
  isLoading,
  onLoadMore,
}: CatalogLoadMoreProps) {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={isLoading}
        aria-busy={isLoading}
        className="rounded-md border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLoading ? 'Loading...' : 'Load more'}
      </button>
    </div>
  );
}
