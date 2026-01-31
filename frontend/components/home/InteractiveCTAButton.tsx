'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { createCTAVariants } from '@/lib/home/cta-variants';

export function InteractiveCTAButton() {
  const t = useTranslations('homepage');

  const [index, setIndex] = React.useState(0);
  const [isHovered, setIsHovered] = React.useState(false);

  const variants = createCTAVariants(t('cta'));
  const current = variants[index];
  const nextIndex = (index + 1) % variants.length;
  const next = variants[nextIndex];

  const handleEnter = () => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    if (isHovered) return;
    setIsHovered(true);
  };

  const handleLeave = () => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    if (!isHovered) return;
    setIndex(nextIndex);
    setIsHovered(false);
  };

  return (
    <Link
      href="/q&a"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={`
        group relative inline-flex items-center overflow-hidden rounded-2xl
        px-8 sm:px-10 md:px-12 py-3 md:py-3.5 lg:py-4
        text-xs md:text-sm font-semibold tracking-[0.25em] uppercase text-white
        ${current.shadow} ${current.shadowDark}
        transition-shadow duration-700 ease-out
        active:scale-95
active:brightness-110
active:shadow-xl

        focus-visible:outline-none focus-visible:ring-2 ${current.ring} focus-visible:ring-offset-2
      `}
    >
      <span
        className={`absolute inset-0 bg-gradient-to-r ${current.gradient} ${current.gradientDark}`}
      />

      {isHovered && (
        <span
          className={`absolute inset-0 bg-gradient-to-r ${next.gradient} ${next.gradientDark} animate-wave-slide-up`}
        />
      )}

      <span
        className="pointer-events-none absolute inset-[2px] rounded-2xl
        bg-gradient-to-r from-white/20 via-white/5 to-white/20
        opacity-40 supports-[hover:hover]:group-hover:opacity-60 transition-opacity"
      />

      <span className="relative z-10">
        <span
          key={isHovered ? nextIndex : index}
          className={`inline-block ${isHovered ? 'animate-text-fade-in' : ''}`}
        >
          {isHovered ? next.text : current.text}
        </span>
      </span>
    </Link>
  );
}
