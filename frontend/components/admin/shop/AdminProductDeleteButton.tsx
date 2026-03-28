'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

interface AdminProductDeleteButtonProps {
  id: string;
  title: string;
  csrfToken: string;
  className?: string;
}

export function AdminProductDeleteButton({
  id,
  title,
  csrfToken,
  className,
}: AdminProductDeleteButtonProps) {
  const router = useRouter();
  const t = useTranslations('shop.admin.deleteProduct');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorId = useId();

  const onDelete = async () => {
    setError(null);

    if (!csrfToken) {
      setError(t('securityMissing'));
      return;
    }

    const ok = window.confirm(t('confirmDelete', { title }));
    if (!ok) return;

    setIsLoading(true);

    try {
      const response = await fetch(`/api/shop/admin/products/${id}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': csrfToken,
        },
      });

      if (!response.ok) {
        let code: string | undefined;
        try {
          const body = await response.json();
          code = typeof body?.code === 'string' ? body.code : undefined;
        } catch {
          // ignore
        }

        if (
          response.status === 403 &&
          (code === 'CSRF_MISSING' || code === 'CSRF_INVALID')
        ) {
          setError(t('securityExpired'));
          return;
        }

        if (response.status === 404) {
          setError(t('notFound'));
          router.refresh();
          return;
        }
        if (response.status === 409 && code === 'PRODUCT_IN_USE') {
          setError(t('referenced'));
          return;
        }

        setError(t('failedDelete'));
        return;
      }

      router.refresh();
    } catch {
      setError(t('failedDelete'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`.trim()}>
      <button
        type="button"
        onClick={onDelete}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-describedby={error ? errorId : undefined}
        className="inline-flex h-8 w-full max-w-full items-center justify-center rounded-md border border-red-500/30 px-2.5 text-center text-[11px] leading-none font-medium whitespace-nowrap text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? t('deleting') : t('delete')}
      </button>

      {error ? (
        <p
          id={errorId}
          role="status"
          aria-live="polite"
          className="max-w-[12rem] truncate text-xs text-red-600"
          title={error}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
