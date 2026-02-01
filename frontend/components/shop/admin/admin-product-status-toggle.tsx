'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

interface AdminProductStatusToggleProps {
  id: string;
  initialIsActive: boolean;
  csrfToken: string;
}

export function AdminProductStatusToggle({
  id,
  initialIsActive,
  csrfToken,
}: AdminProductStatusToggleProps) {
  const [isActive, setIsActive] = useState(initialIsActive);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('shop.admin.statusToggle');

  const errorId = useId();

  const toggleStatus = async () => {
    setIsLoading(true);
    setError(null);

    if (!csrfToken) {
      setError(t('securityMissing'));
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/shop/admin/products/${id}/status`, {
        method: 'PATCH',
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

        setError(t('failedUpdate'));
        return;
      }

      const data: { product?: { isActive?: boolean } } = await response.json();
      if (typeof data.product?.isActive === 'boolean') {
        setIsActive(data.product.isActive);
      }
    } catch {
      setError(t('failedUpdate'));
    } finally {
      setIsLoading(false);
    }
  };

  const buttonLabel = isLoading
    ? t('updating')
    : isActive
      ? t('deactivate')
      : t('activate');

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={toggleStatus}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-pressed={isActive}
        aria-describedby={error ? errorId : undefined}
        className="w-full max-w-full whitespace-normal break-words leading-tight rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 text-center"
      >
        {buttonLabel}
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
