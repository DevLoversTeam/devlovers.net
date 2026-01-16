'use client';

import React from 'react';
import { Filter, X } from 'lucide-react';

import { ProductSort } from '@/components/shop/product-sort';
import { ProductFilters } from '@/components/shop/product-filters';

export function ProductsToolbar() {
  const [open, setOpen] = React.useState(false);

  const dialogTitleId = React.useId();
  const dialogId = React.useId();

  const openBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement | null>(null);

  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;

    const mq = window.matchMedia('(min-width: 1024px)');
    if (mq.matches) {
      setOpen(false);
      return;
    }

    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };

    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const mq = window.matchMedia('(min-width: 1024px)');
    if (mq.matches) return;

    // snapshot refs for cleanup (eslint react-hooks/exhaustive-deps warning)
    const triggerEl = openBtnRef.current;
    const initialCloseEl = closeBtnRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', onKeyDown);
    document.documentElement.classList.add('overflow-hidden');

    requestAnimationFrame(() =>
      (initialCloseEl ?? closeBtnRef.current)?.focus()
    );

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.documentElement.classList.remove('overflow-hidden');

      requestAnimationFrame(() => triggerEl?.focus());
    };
  }, [open, close]);

  return (
    <>
      {/* No w-full here: on mobile header stretches items; on desktop it stays content-sized (fixes “center gap”). */}
      <div
        role="group"
        aria-label="Product listing controls"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-0 flex-1 sm:flex-none sm:min-w-[260px]">
          <ProductSort />
        </div>

        <button
          ref={openBtnRef}
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground lg:hidden"
          aria-label="Open filters"
          aria-controls={dialogId}
          aria-expanded={open}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filters
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close filters"
            onClick={close}
          />

          <div
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="absolute right-0 top-0 h-full w-full max-w-sm overflow-y-auto bg-background shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <h2
                id={dialogTitleId}
                className="text-sm font-semibold text-foreground"
              >
                Filters
              </h2>

              <button
                ref={closeBtnRef}
                type="button"
                onClick={close}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="px-4 py-6">
              {/* Do NOT auto-close on every click */}
              <ProductFilters />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
