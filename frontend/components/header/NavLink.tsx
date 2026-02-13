'use client';

import { usePathname } from 'next/navigation';

import { AnimatedNavLink } from '@/components/shared/AnimatedNavLink';

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function NavLink({ href, children, className = '' }: NavLinkProps) {
  const pathname = usePathname();

  const isActive = (() => {
    const cleanPathname = pathname.replace(/^\/(uk|en|pl)(?=\/|$)/, '') || '/';

    if (href === '/' && cleanPathname === '/') return true;

    if (href !== '/') {
      if (cleanPathname === href || cleanPathname.startsWith(`${href}/`))
        return true;
      if (href === '/quizzes' && cleanPathname.startsWith('/quiz/'))
        return true;
    }

    return false;
  })();

  return (
    <AnimatedNavLink href={href} isActive={isActive} className={className}>
      {children}
    </AnimatedNavLink>
  );
}
