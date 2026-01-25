'use client';

import { Link } from '@/i18n/routing';

type LogoProps = {
  href: string;
};

export function Logo({ href }: LogoProps) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 items-center gap-2 active:scale-95 transition-transform"
    >
      <span
        className="
          truncate text-xl font-bold tracking-tight
          bg-[linear-gradient(90deg,var(--logo-foreground,var(--foreground)),var(--accent-hover))]
          bg-[length:200%_100%]
          bg-[position:0%_50%]
          bg-clip-text text-transparent
          transition-[background-position] duration-500 ease-out
          group-hover:bg-[position:100%_50%]
          group-active:bg-[position:100%_50%]
        "
      >
        DevLovers
      </span>
    </Link>
  );
}
