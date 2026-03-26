'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

interface AdminProductStatusToggleProps {
  id: string;
  initialIsActive: boolean;
  csrfToken: string;
  className?: string;
}

export function AdminProductStatusToggle({
  id,
  initialIsActive,
  csrfToken,
  className,
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
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`.trim()}>
      <button
        type="button"
        onClick={toggleStatus}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-pressed={isActive}
        aria-describedby={error ? errorId : undefined}
        className={`inline-flex h-8 w-full max-w-full items-center justify-center rounded-md border px-2.5 text-center text-[11px] leading-none font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isActive
            ? 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10'
            : 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
        }`}
      >
        {buttonLabel}
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
