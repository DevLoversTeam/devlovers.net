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
    <nav
      aria-label="Pagination"
      className={cn('mt-6 flex items-center justify-between gap-3', className)}
    >
      {hasPrev ? (
        <Link href={pageHref(basePath, page - 1)} rel="prev" className={linkClass}>
          Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Previous
        </span>
      )}

      <span className="text-sm text-muted-foreground">Page {page}</span>

      {hasNext ? (
        <Link href={pageHref(basePath, page + 1)} rel="next" className={linkClass}>
          Next
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Next
        </span>
      )}
    </nav>
  );
}
