'use client';

import { useSearchParams } from 'next/navigation';

type BlogPageHeaderProps = {
  title: string;
  subtitle: string;
};

export function BlogPageHeader({ title, subtitle }: BlogPageHeaderProps) {
  const searchParams = useSearchParams();
  const authorParam = (searchParams?.get('author') || '').trim();
  if (authorParam) return null;

  return (
    <>
      <h1 className="text-5xl font-extrabold mb-3 text-center leading-[1.1] bg-gradient-to-b from-[color-mix(in_srgb,var(--accent-primary)_70%,white)] to-[var(--accent-hover)] bg-clip-text text-transparent">
        {title}
      </h1>
      <p className="mx-auto mb-10 max-w-2xl text-center text-base text-gray-500 dark:text-gray-400">
        {subtitle}
      </p>
    </>
  );
}
