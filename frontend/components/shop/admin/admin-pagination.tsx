import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';

type AdminPaginationProps = {
  basePath: string;
  page: number;
  hasNext: boolean;
  className?: string;
};

function pageHref(basePath: string, page: number) {
  if (page <= 1) return basePath;
  return `${basePath}?page=${page}`;
}

export async function AdminPagination({
  basePath,
  page,
  hasNext,
  className,
}: AdminPaginationProps) {
  const hasPrev = page > 1;
  const t = await getTranslations('shop.admin.pagination');

  const disabledClass =
    'inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-60';
  const linkClass =
    'inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary';

  return (
    <nav aria-label={t('label')} className={cn('mt-6', className)}>
      <ul className="flex items-center justify-between gap-3">
        <li>
          {hasPrev ? (
            <Link
              href={pageHref(basePath, page - 1)}
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
          <span aria-current="page" className="text-sm text-muted-foreground">
            {t('page', { page })}
          </span>
        </li>

        <li>
          {hasNext ? (
            <Link
              href={pageHref(basePath, page + 1)}
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
