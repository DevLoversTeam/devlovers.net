'use client';

import type { ComponentProps } from 'react';

import { Link } from '@/i18n/routing';

interface AnimatedNavLinkProps {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  ariaCurrent?: ComponentProps<typeof Link>['aria-current'];
}

export function AnimatedNavLink({
  href,
  isActive,
  children,
  onClick,
  className = '',
  ariaCurrent,
}: AnimatedNavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={ariaCurrent ?? (isActive ? 'page' : undefined)}
      className={`group relative px-3 py-2 text-sm font-medium transition-all duration-300 ease-out ${
        isActive
          ? '[color:var(--accent-primary)]'
          : 'text-muted-foreground hover:[color:var(--accent-hover)]'
      } ${className} `}
    >
      {children}

      <span
        className={`absolute inset-x-0 -bottom-3 h-12 transition-opacity duration-300 ease-out ${isActive ? 'opacity-50' : 'opacity-0 group-hover:opacity-40'} `}
        style={{
          background: `radial-gradient(ellipse 80px 40px at center bottom, ${
            isActive ? 'var(--accent-primary)' : 'var(--accent-hover)'
          } 0%, transparent 70%)`,
          filter: 'blur(10px)',
        }}
        aria-hidden="true"
      />

      {isActive && (
        <span
          className="absolute bottom-[-12px] left-1/2 -translate-x-1/2 scale-100 opacity-100 transition-all duration-300 ease-out"
          style={{
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderBottom: '8px solid var(--accent-primary)',
            filter: 'drop-shadow(0 0 6px var(--accent-primary))',
          }}
          aria-hidden="true"
        />
      )}

      {isActive ? (
        <span
          className="absolute bottom-[-15px] left-1/2 h-[2px] w-full -translate-x-1/2 opacity-100 transition-all duration-300 ease-out"
          style={{
            background: `linear-gradient(90deg, 
              transparent 0%, 
              var(--accent-primary) 50%, 
              transparent 100%)`,
            boxShadow: `0 0 12px 2px var(--accent-primary), 0 0 6px 1px var(--accent-primary)`,
          }}
          aria-hidden="true"
        />
      ) : (
        <span
          className="absolute bottom-[-15px] left-1/2 h-[3px] w-0 -translate-x-1/2 opacity-0 transition-all duration-300 ease-out group-hover:w-full group-hover:opacity-100"
          style={{
            background: `linear-gradient(90deg, 
              transparent 0%,
              var(--accent-hover) 20%,
              transparent 40%,
              var(--accent-hover) 60%,
              transparent 80%,
              var(--accent-hover) 100%)`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s ease-in-out infinite',
            boxShadow: `0 0 10px 2px var(--accent-hover)`,
          }}
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
