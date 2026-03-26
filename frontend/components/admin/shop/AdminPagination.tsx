import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type AdminPaginationProps = {
  basePath: string;
  page: number;
  hasNext: boolean;
  className?: string;
  query?: Record<string, string | undefined>;
};

function pageHref(
  basePath: string,
  page: number,
  query?: Record<string, string | undefined>
) {
  const params = new URLSearchParams();

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (!value) continue;
      params.set(key, value);
    }
  }

  if (page > 1) {
    params.set('page', String(page));
  }

  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

export async function AdminPagination({
  basePath,
  page,
  hasNext,
  className,
  query,
}: AdminPaginationProps) {
  const hasPrev = page > 1;
  const t = await getTranslations('shop.admin.pagination');

  const disabledClass =
    'inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-muted-foreground opacity-60';
  const linkClass =
    'inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary';

  return (
    <nav aria-label={t('label')} className={cn('mt-6', className)}>
      <ul className="flex items-center justify-between gap-3">
        <li>
          {hasPrev ? (
            <Link
              href={pageHref(basePath, page - 1, query)}
              rel="prev"
              aria-label={t('previousPage')}
              className={linkClass}
            >
              {t('previous')}
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              {t('previous')}
            </span>
          )}
        </li>

        <li>
          <span aria-current="page" className="text-muted-foreground text-sm">
            {t('page', { page })}
          </span>
        </li>

        <li>
          {hasNext ? (
            <Link
              href={pageHref(basePath, page + 1, query)}
              rel="next"
              aria-label={t('nextPage')}
              className={linkClass}
            >
              {t('next')}
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              {t('next')}
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
