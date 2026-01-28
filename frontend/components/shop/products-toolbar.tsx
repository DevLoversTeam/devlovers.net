'use client';

import React from 'react';
import { Filter, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ProductSort } from '@/components/shop/product-sort';
import { ProductFilters } from '@/components/shop/product-filters';

export function ProductsToolbar() {
  const [open, setOpen] = React.useState(false);
  const t = useTranslations('shop.toolbar');

  const dialogTitleId = React.useId();
  const dialogId = React.useId();

  const openBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement | null>(null);

  const close = React.useCallback(() => setOpen(false), []);

  const getFocusable = React.useCallback((root: HTMLElement) => {
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    return Array.from(root.querySelectorAll<HTMLElement>(selectors)).filter(
      el => {
        // ignore elements that are not actually visible/clickable
        const style = window.getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none';
      }
    );
  }, []);

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

    const triggerEl = openBtnRef.current;
    const dialogEl = document.getElementById(dialogId) as HTMLElement | null;

    const focusFirst = () => {
      if (!dialogEl) return;
      const focusables = getFocusable(dialogEl);
      (focusables[0] ?? dialogEl).focus();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!dialogEl) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = getFocusable(dialogEl);
      if (focusables.length === 0) {
        // if nothing is focusable, keep focus on dialog itself
        e.preventDefault();
        dialogEl.focus();
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

      // If focus somehow escaped, pull it back in.
      if (!active || !dialogEl.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.documentElement.classList.add('overflow-hidden');

    requestAnimationFrame(() => {
      // prefer close button, else first focusable, else dialog
      const closeEl = closeBtnRef.current;
      if (closeEl) closeEl.focus();
      else focusFirst();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.documentElement.classList.remove('overflow-hidden');
      requestAnimationFrame(() => triggerEl?.focus());
    };
  }, [open, close, dialogId, getFocusable]);

  return (
    <>
      {/* No w-full here: on mobile header stretches items; on desktop it stays content-sized (fixes "center gap"). */}
      <div
        role="group"
        aria-label={t('label')}
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
          aria-label={t('openFilters')}
          aria-controls={dialogId}
          aria-expanded={open}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          {t('filters')}
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
          />

          <div
            id={dialogId}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-labelledby={dialogTitleId}
            className="absolute right-0 top-0 h-full w-full max-w-sm overflow-y-auto bg-background shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <h2
                id={dialogTitleId}
                className="text-sm font-semibold text-foreground"
              >
                {t('filters')}
              </h2>

              <button
                ref={closeBtnRef}
                type="button"
                onClick={close}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label={t('close')}
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
