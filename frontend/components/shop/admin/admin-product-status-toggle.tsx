'use client';

import { useId, useState } from 'react';

interface AdminProductStatusToggleProps {
  id: string;
  initialIsActive: boolean;
}

export function AdminProductStatusToggle({
  id,
  initialIsActive,
}: AdminProductStatusToggleProps) {
  const [isActive, setIsActive] = useState(initialIsActive);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For accessible association; stable per component instance.
  const errorId = useId();

  const toggleStatus = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/shop/admin/products/${id}/status`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        setError('Failed to update status');
        return;
      }

      const data: { product?: { isActive?: boolean } } = await response.json();

      if (typeof data.product?.isActive === 'boolean') {
        setIsActive(data.product.isActive);
      }
    } catch {
      // Avoid noisy console in UI components; keep UX deterministic.
      setError('Failed to update status');
    } finally {
      setIsLoading(false);
    }
  };

  const buttonLabel = isLoading
    ? 'Updating'
    : isActive
    ? 'Deactivate'
    : 'Activate';

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={toggleStatus}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-pressed={isActive}
        aria-describedby={error ? errorId : undefined}
        className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
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
