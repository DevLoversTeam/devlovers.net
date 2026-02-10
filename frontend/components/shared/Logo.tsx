'use client';

import { useMobileMenu } from '@/components/header/MobileMenuContext';
import { Link } from '@/i18n/routing';

type LogoProps = {
  href: string;
};

export function Logo({ href }: LogoProps) {
  const { startNavigation } = useMobileMenu();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    startNavigation(href);
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="group flex min-w-0 items-center gap-2 transition-transform active:scale-95"
    >
      <span className="truncate bg-[linear-gradient(90deg,var(--logo-foreground,var(--foreground)),var(--accent-hover))] bg-[length:200%_100%] bg-clip-text bg-[position:0%_50%] text-xl font-bold tracking-tight text-transparent transition-[background-position] duration-500 ease-out group-hover:bg-[position:100%_50%] group-active:bg-[position:100%_50%]">
        DevLovers
      </span>
    </Link>
  );
}
