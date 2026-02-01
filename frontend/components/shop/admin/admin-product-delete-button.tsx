'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface AdminProductDeleteButtonProps {
  id: string;
  title: string;
  csrfToken: string;
}

export function AdminProductDeleteButton({
  id,
  title,
  csrfToken,
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
    <div className="flex w-full min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={onDelete}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-describedby={error ? errorId : undefined}
        className="w-full max-w-full whitespace-normal break-words leading-tight rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 text-center"
      >
        {isLoading ? t('deleting') : t('delete')}
      </button>

      {error ? (
        <p
          id={errorId}
          role="status"
          aria-live="polite"
          className="max-w-[9rem] truncate text-xs text-red-600"
          title={error}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
