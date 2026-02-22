'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useRouter } from '@/i18n/routing';

type MobileMenuContextType = {
  isOpen: boolean;
  isAnimating: boolean;
  isPending: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  startNavigation: (href: string) => void;
};

const MobileMenuContext = createContext<MobileMenuContextType | undefined>(
  undefined
);

export function useMobileMenu() {
  const context = useContext(MobileMenuContext);
  if (!context) {
    throw new Error('useMobileMenu must be used within MobileMenuProvider');
  }
  return context;
}

export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wasNavigatingRef = useRef(false);
  const prevPathnameRef = useRef(pathname);
  const prevSearchRef = useRef(searchParams.toString());

  const close = useCallback(() => {
    setIsAnimating(false);
    setTimeout(() => {
      setIsOpen(false);
      wasNavigatingRef.current = false;
    }, 310);
  }, []);

  const open = useCallback(() => {
    wasNavigatingRef.current = false;
    setIsOpen(true);
    setTimeout(() => setIsAnimating(true), 10);
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, close, open]);

  const startNavigation = useCallback(
    (href: string) => {
      const [targetPath, targetSearch = ''] = href.split('?');
      const currentSearch = searchParams.toString();

      const strippedPathname = pathname.replace(/^\/(en|uk|pl)/, '') || '/';

      if (strippedPathname === targetPath && targetSearch === currentSearch) {
        close();
        return;
      }

      wasNavigatingRef.current = true;
      prevPathnameRef.current = pathname;
      prevSearchRef.current = currentSearch;
      setIsNavigating(true);
      router.push(href);
    },
    [router, pathname, searchParams, close]
  );

  useEffect(() => {
    if (!isNavigating) return;

    const currentSearch = searchParams.toString();
    const pathChanged = pathname !== prevPathnameRef.current;
    const searchChanged = currentSearch !== prevSearchRef.current;

    if (pathChanged || searchChanged) {
      queueMicrotask(() => {
        setIsNavigating(false);
      });
    }
  }, [pathname, searchParams, isNavigating]);

  useEffect(() => {
    if (!isNavigating && wasNavigatingRef.current && isOpen) {
      wasNavigatingRef.current = false;
      queueMicrotask(() => {
        close();
      });
    }
  }, [isNavigating, isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  return (
    <MobileMenuContext.Provider
      value={{
        isOpen,
        isAnimating,
        isPending: isNavigating,
        open,
        close,
        toggle,
        startNavigation,
      }}
    >
      {children}
    </MobileMenuContext.Provider>
  );
}