'use client';

import { ArrowUpRight } from 'lucide-react';
import { HeaderButton } from '@/components/shared/HeaderButton';

type FeaturedPostCtaButtonProps = {
  href: string;
  label: string;
  className?: string;
};

export function FeaturedPostCtaButton({
  href,
  label,
  className,
}: FeaturedPostCtaButtonProps) {
  return (
    <HeaderButton
      href={href}
      variant="icon"
      icon={ArrowUpRight}
      label={label}
      className={className}
    />
  );
}
