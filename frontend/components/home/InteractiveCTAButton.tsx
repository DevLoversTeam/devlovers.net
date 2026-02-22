'use client';

import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from 'framer-motion';
import { useTranslations } from 'next-intl';
import React, { useRef, useState, useEffect } from 'react';
import { Link } from '@/i18n/routing';

const MotionLink = motion(Link);

export const InteractiveCTAButton = React.forwardRef<HTMLAnchorElement>(
  function InteractiveCTAButton(props, forwardedRef) {
    const t = useTranslations('homepage');
    const internalRef = useRef<HTMLAnchorElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    const [currentText, setCurrentText] = useState(t('cta'));
    const [variantIndex, setVariantIndex] = useState(0);
    const [isFirstRender, setIsFirstRender] = useState(true);

    const textVariants = [
      t('cta'),
      t('ctaVariants.1'),
      t('ctaVariants.2'),
      t('ctaVariants.3'),
      t('ctaVariants.4'),
      t('ctaVariants.5'),
      t('ctaVariants.6'),
      t('ctaVariants.7'),
      t('ctaVariants.8'),
    ];

    useEffect(() => {
      setIsFirstRender(false);
    }, []);

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const springConfig = { damping: 15, stiffness: 150, mass: 0.1 };
    const springX = useSpring(x, springConfig);
    const springY = useSpring(y, springConfig);

    const rotate = useMotionValue(0);
    const background = useMotionTemplate`linear-gradient(${rotate}deg, var(--accent-primary), var(--accent-hover))`;

    const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
      const el = internalRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const distanceX = e.clientX - centerX;
      const distanceY = e.clientY - centerY;

      x.set(distanceX / 4);
      y.set(distanceY / 4);
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
      x.set(0);
      y.set(0);
    };

    const handleMouseEnter = () => {
      setIsHovered(true);
      const nextIndex = (variantIndex + 1) % textVariants.length;
      const finalIndex = nextIndex === 0 ? 1 : nextIndex;

      setVariantIndex(finalIndex);
      setCurrentText(textVariants[finalIndex]);
    };

    useEffect(() => {
      if (isHovered) {
        const interval = setInterval(() => {
          rotate.set((rotate.get() + 2) % 360);
        }, 16);
        return () => clearInterval(interval);
      }
    }, [isHovered, rotate]);

    return (
      <MotionLink
        href="/q&a"
        ref={(node: HTMLAnchorElement) => {
          internalRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
        style={{ x: springX, y: springY }}
        className="group relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-full px-12 py-4 text-sm font-bold tracking-widest text-white uppercase shadow-[0_10px_30px_rgba(0,0,0,0.15)] transition-shadow duration-300 hover:shadow-[0_20px_40px_rgba(30,94,255,0.4)] dark:hover:shadow-[0_20px_40px_rgba(255,45,85,0.5)]"
        {...props}
      >
        <motion.span
          className="absolute inset-0 z-0"
          style={{ background }}
          animate={{
            scale: isHovered ? 1.1 : 1,
          }}
          transition={{ duration: 0.4 }}
        />

        <motion.span
          className="absolute inset-0 z-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100"
          animate={{
            x: isHovered ? ['100%', '-100%'] : '100%',
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'linear',
          }}
        />

        <span className="relative z-10 flex h-5 min-w-[100px] items-center justify-center gap-2 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={currentText}
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              exit={{ y: '-100%', opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 30,
                mass: 0.5,
              }}
              className="block origin-center text-center whitespace-nowrap"
            >
              {currentText}
            </motion.span>
          </AnimatePresence>
        </span>
      </MotionLink>
    );
  }
);
