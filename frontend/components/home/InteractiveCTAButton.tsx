'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Link } from '@/i18n/routing';

export const InteractiveCTAButton = React.forwardRef<HTMLAnchorElement>(
  function InteractiveCTAButton(_, ref) {
    const t = useTranslations('homepage');

    const [variantIndex, setVariantIndex] = React.useState(1);
    const [isHovered, setIsHovered] = React.useState(false);
    const [currentText, setCurrentText] = React.useState(t('cta'));
    const [isFirstRender, setIsFirstRender] = React.useState(true);

    const textVariants = [
      t('ctaVariants.1'),
      t('ctaVariants.2'),
      t('ctaVariants.3'),
      t('ctaVariants.4'),
      t('ctaVariants.5'),
      t('ctaVariants.6'),
      t('ctaVariants.7'),
      t('ctaVariants.8'),
    ];

    React.useEffect(() => {
      setIsFirstRender(false);
    }, []);

    const handleEnter = () => {
      if (!window.matchMedia('(hover: hover)').matches) return;
      setIsHovered(true);
      setCurrentText(textVariants[variantIndex]);
    };

    const handleLeave = () => {
      if (!window.matchMedia('(hover: hover)').matches) return;
      setIsHovered(false);
      setVariantIndex(prev => (prev + 1) % textVariants.length);
    };

    const particles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      angle: (i * 360) / 8,
    }));

    return (
      <Link
        ref={ref}
        href="/q&a"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="group relative inline-flex items-center justify-center overflow-visible rounded-2xl px-8 py-3 text-xs font-semibold tracking-[0.25em] text-white uppercase shadow-[0_18px_45px_rgba(30,94,255,0.35)] transition-shadow duration-500 ease-out hover:shadow-[0_22px_55px_rgba(30,94,255,0.45)] focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 active:shadow-xl active:brightness-110 sm:px-10 md:px-12 md:py-3.5 md:text-sm lg:py-4 dark:shadow-[0_22px_60px_rgba(255,45,85,0.5)] dark:hover:shadow-[0_28px_70px_rgba(255,45,85,0.6)]"
      >
        <motion.span
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-hover) 100%)',
          }}
          animate={{
            background: isHovered
              ? [
                  'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-hover) 100%)',
                  'linear-gradient(225deg, var(--accent-hover) 0%, var(--accent-primary) 100%)',
                  'linear-gradient(315deg, var(--accent-primary) 0%, var(--accent-hover) 100%)',
                  'linear-gradient(45deg, var(--accent-hover) 0%, var(--accent-primary) 100%)',
                ]
              : 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-hover) 100%)',
          }}
          transition={{
            duration: 2,
            repeat: isHovered ? Infinity : 0,
            ease: 'linear',
          }}
        />

        <motion.span
          className="pointer-events-none absolute inset-0 rounded-2xl"
          initial={{ opacity: 0 }}
          animate={{
            opacity: isHovered ? [0.15, 0.25, 0.15] : 0,
          }}
          transition={{
            duration: 2.5,
            repeat: isHovered ? Infinity : 0,
            ease: 'easeInOut',
          }}
          style={{
            boxShadow: `
            0 0 30px 3px var(--accent-primary),
            0 0 50px 5px var(--accent-hover)
          `,
          }}
        />

        <AnimatePresence>
          {isHovered &&
            particles.map(particle => (
              <motion.span
                key={particle.id}
                className="pointer-events-none absolute h-3 w-3"
                style={{
                  left: '50%',
                  top: '50%',
                  marginLeft: '-6px',
                  marginTop: '-6px',
                }}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: [0, Math.cos((particle.angle * Math.PI) / 180) * 230, 0],
                  y: [0, Math.sin((particle.angle * Math.PI) / 180) * 60, 0],
                  scale: [0.7, 1, 0.7],
                  opacity: [0, 0.9, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: particle.id * 0.1,
                }}
              >
                <Heart
                  size={14}
                  fill="var(--accent-primary)"
                  color="var(--accent-primary)"
                  style={{
                    filter: 'drop-shadow(0 0 6px var(--accent-primary))',
                  }}
                />
              </motion.span>
            ))}
        </AnimatePresence>

        <span
          className="pointer-events-none absolute inset-[1px] rounded-2xl"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
          }}
        />

        <span className="relative z-10 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.span
              key={currentText}
              initial={
                isFirstRender ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {currentText}
            </motion.span>
          </AnimatePresence>
        </span>
      </Link>
    );
  }
);
