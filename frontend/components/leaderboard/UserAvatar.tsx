'use client';

import Image from 'next/image';
import { useState } from 'react';

import { cn } from '@/lib/utils';

interface UserAvatarProps {
  src: string;
  username: string;
  className?: string;
  sizes?: string;
}

export function UserAvatar({
  src,
  username,
  className,
  sizes = '40px',
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const fallback = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(username)}`;
  const imgSrc = hasError ? fallback : src;
  const isSvg = imgSrc.endsWith('.svg') || imgSrc.includes('/svg?');

  return (
    <Image
      src={imgSrc}
      alt={username}
      fill
      unoptimized={isSvg}
      className={cn('object-cover', className)}
      sizes={sizes}
      onError={() => setHasError(true)}
    />
  );
}
