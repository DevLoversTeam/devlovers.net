'use client';

import { SITE_LINKS } from '@/lib/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link } from '@/i18n/routing';

export default function SiteMobileHeader() {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Toggle menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls="site-mobile-nav"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 md:hidden"
            onClick={close}
          />
          <nav
            id="site-mobile-nav"
            className="fixed left-0 right-0 top-16 z-50 border-t border-border bg-background px-4 py-4 md:hidden"
          >
            <div className="flex flex-col gap-1">
              {SITE_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
