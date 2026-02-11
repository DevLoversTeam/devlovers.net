'use client';

import Image from 'next/image';
import { useState } from 'react';

import { cn } from '@/lib/utils';

interface UserAvatarProps {
  src: string;
  username: string;
  userId?: string;
  className?: string;
  sizes?: string;
}

function UserAvatarInner({
  src,
  username,
  userId,
  className,
  sizes = '40px',
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const seed = userId ? `${username}-${userId}` : username;
  const fallback = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
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

export function UserAvatar(props: UserAvatarProps) {
  return <UserAvatarInner key={props.src} {...props} />;
}
