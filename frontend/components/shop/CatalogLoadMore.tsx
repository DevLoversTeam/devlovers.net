'use client';

import { useTranslations } from 'next-intl';

import {
  SHOP_DISABLED,
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';
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
  const t = useTranslations('shop.products');
  const tCommon = useTranslations('common');

  if (!hasMore) return null;

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={isLoading}
        aria-busy={isLoading}
        className={cn(
          SHOP_OUTLINE_BTN_BASE,
          SHOP_OUTLINE_BTN_INTERACTIVE,
          SHOP_FOCUS,
          SHOP_DISABLED,
          'gap-2 px-6 py-2.5'
        )}
      >
        {isLoading ? tCommon('loading') : t('loadMore')}
      </button>
    </div>
  );
}
