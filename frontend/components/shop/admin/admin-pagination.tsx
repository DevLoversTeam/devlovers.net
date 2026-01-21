import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type AdminPaginationProps = {
  basePath: string; // e.g. "/shop/admin/products"
  page: number;
  hasNext: boolean;
  className?: string;
};

function pageHref(basePath: string, page: number) {
  if (page <= 1) return basePath; // canonical without ?page=1
  return `${basePath}?page=${page}`;
}

export function AdminPagination({
  basePath,
  page,
  hasNext,
  className,
}: AdminPaginationProps) {
  const hasPrev = page > 1;

  const disabledClass =
    'inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-60';
  const linkClass =
    'inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary';

  return (
    <nav aria-label="Pagination" className={cn('mt-6', className)}>
      <ul className="flex items-center justify-between gap-3">
        <li>
          {hasPrev ? (
            <Link
              href={pageHref(basePath, page - 1)}
              rel="prev"
              aria-label="Previous page"
              className={linkClass}
            >
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              Previous
            </span>
          )}
        </li>

        <li>
          <span aria-current="page" className="text-sm text-muted-foreground">
            Page {page}
          </span>
        </li>

        <li>
          {hasNext ? (
            <Link
              href={pageHref(basePath, page + 1)}
              rel="next"
              aria-label="Next page"
              className={linkClass}
            >
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              Next
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
