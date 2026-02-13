'use client';

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { RotateCw } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Question {
  id: number;
  question: string;
  answer: React.ReactNode;
  category: string;
  tip?: string;
}

const categoryIcons: Record<string, string> = {
  React: '/icons/react.svg',
  JavaScript: '/icons/javascript.svg',
  'Node.js': '/icons/nodejs.svg',
  'Next.js': '/icons/nextjs.svg', 
  TypeScript: '/icons/typescript.svg',
};

const categoryColors: Record<string, string> = {
  React: '#61DAFB',
  JavaScript: '#F7DF1E',
  'Node.js': '#339933',
  'Next.js': '#FFFFFF',
  TypeScript: '#3178C6',
};

export function FlipCardQA() {
  const t = useTranslations('homepage.flipCard');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Refs for cleanup
  const flipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const nextCardTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  const questions: Question[] = [1, 2, 3, 4, 5].map((id) => ({
    id,
    question: t(`questions.${id}.question`),
    answer: t.rich(`questions.${id}.answer`, {
      strong: (chunks) => <strong>{chunks}</strong>,
    }),
    category: t(`questions.${id}.category`),
    tip: t(`questions.${id}.tip`),
  }));

  const currentQuestion = questions[currentIndex];
  // Helper to safely get category icon/color since translation might return a string not in the keys if logic changed
  // But here categories are 'React', etc. matching the keys.
  const categoryIcon = categoryIcons[currentQuestion.category] || categoryIcons['JavaScript'];
  const categoryColor = categoryColors[currentQuestion.category] || categoryColors['JavaScript'];

  const flipRotation = useMotionValue(0);
  
  // Sync flip state with motion value
  useEffect(() => {
    flipRotation.set(isFlipped ? 180 : 0);
  }, [isFlipped, flipRotation]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-100, 100], [10, -10]); 
  // Combine tilt (from x) and flip (from state)
  const tiltY = useTransform(x, [-100, 100], [-10, 10]);
  const rotateY = useTransform([tiltY, flipRotation], ([tilt, flip]: [number, number]) => tilt + flip);
  
  const springConfig = { damping: 20, stiffness: 260 }; // Use snappier config for both
  const rotateXSpring = useSpring(rotateX, springConfig);
  const rotateYSpring = useSpring(rotateY, springConfig);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isFlipped || isPaused) {
      setProgress(0);
      return;
    }

    const duration = 8000;
    const interval = 50;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += interval;
      const newProgress = (elapsed / duration) * 100;

      if (newProgress >= 100) {
        setIsFlipped(true);

        // Clear any existing timeouts to be safe
        if (nextCardTimerRef.current) clearTimeout(nextCardTimerRef.current);
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

        nextCardTimerRef.current = setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % questions.length);
        }, 300);

        resetTimerRef.current = setTimeout(() => {
          setIsFlipped(false);
          setProgress(0);
        }, 600);
      } else {
        setProgress(newProgress);
      }
    }, interval);

    flipTimerRef.current = timer;

    return () => {
      clearInterval(timer);
      if (nextCardTimerRef.current) clearTimeout(nextCardTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [isFlipped, isPaused, currentIndex, questions.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setIsFlipped((prev) => !prev);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setIsFlipped(false);
      setCurrentIndex((prev) => (prev + 1) % questions.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setIsFlipped(false);
      setCurrentIndex((prev) => (prev - 1 + questions.length) % questions.length);
    }
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNavigate = (index: number) => {
    setIsFlipped(false);
    setCurrentIndex(index);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const xPct = (mouseX / width - 0.5) * 200; // -100 to 100
    const yPct = (mouseY / height - 0.5) * 200; // -100 to 100

    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    if (isMobile) return;
    x.set(0);
    y.set(0);
    setIsPaused(false);
  };

  const handleMouseEnter = () => {
    if (isMobile) return;
    setIsPaused(true);
  };

  return (
    <div className="relative w-full max-w-xl">
      <div
        className="relative h-[320px] perspective-1000 sm:h-[340px]"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <motion.div
          className="relative h-full w-full cursor-pointer preserve-3d"
          style={{
            rotateX: rotateXSpring,
            rotateY: rotateYSpring,
          }}
          onClick={handleFlip}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-label={`${t('ui.answer')}. ${isFlipped ? t('ui.clickAgain') : t('ui.clickToReveal')}.`}
        >
          <div className="backface-hidden absolute inset-0 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white/80 p-6 shadow-xl backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-white/5 dark:shadow-2xl">
            {categoryIcon && (
              <div className="pointer-events-none absolute -bottom-10 -right-10 opacity-[0.08] dark:opacity-[0.07]">
                <Image
                  src={categoryIcon}
                  alt=""
                  width={240}
                  height={240}
                  className="rotate-[-15deg] object-contain grayscale"
                />
              </div>
            )}

            <div className="relative z-10 flex h-10 items-center justify-center">
              <div
                className="flex items-center gap-2 rounded-full px-4 py-2 backdrop-blur-md transition-colors"
                style={{
                  backgroundColor: `${categoryColor}15`,
                  border: `1px solid ${categoryColor}30`,
                }}
              >
                {categoryIcon && (
                  <div className="relative h-5 w-5 shrink-0">
                    <Image
                      src={categoryIcon}
                      alt=""
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                  </div>
                )}
                <span className="text-xs font-semibold text-gray-900 dark:text-white sm:text-sm">
                  {currentQuestion.category}
                </span>
              </div>
            </div>

            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-2 py-4 sm:py-6">
              <h3 className="text-center text-xl font-bold leading-tight text-gray-900 drop-shadow-sm sm:text-2xl sm:leading-snug dark:text-white">
                {currentQuestion.question}
              </h3>
            </div>

            <div className="relative z-10 flex h-16 flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-2 opacity-60">
                <div
                  className="h-px w-8"
                  style={{ backgroundColor: categoryColor }}
                />
                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: categoryColor }} />
                <div
                  className="h-px w-8"
                  style={{ backgroundColor: categoryColor }}
                />
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
                {isMobile ? t('ui.tapToReveal') : t('ui.clickToReveal')}
              </p>
            </div>
          </div>

          <div className="backface-hidden absolute inset-0 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white/90 p-6 shadow-sm backdrop-blur-md sm:p-8 [transform:rotateY(180deg)] dark:border-neutral-800 dark:bg-neutral-900/10">
            {categoryIcon && (
              <div className="pointer-events-none absolute -bottom-10 -right-10 opacity-[0.08] dark:opacity-[0.07]">
                <Image
                  src={categoryIcon}
                  alt=""
                  width={240}
                  height={240}
                  className="rotate-[-15deg] object-contain grayscale"
                />
              </div>
            )}

            <div className="relative z-10 flex h-10 items-center justify-center">
              <div
                className="flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 backdrop-blur-sm dark:bg-green-500/20"
                style={{
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                }}
              >
                {categoryIcon && (
                  <div className="relative h-5 w-5 shrink-0">
                    <Image
                      src={categoryIcon}
                      alt=""
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                  </div>
                )}
                <span className="text-xs font-semibold text-green-800 dark:text-green-100 sm:text-sm">
                  {t('ui.answer')}
                </span>
              </div>
            </div>

            <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-4 sm:px-6 sm:py-6">
              <p className="text-center text-sm leading-relaxed text-gray-700 sm:text-base sm:leading-relaxed dark:text-neutral-300">
                {currentQuestion.answer}
              </p>
            </div>

            <div className="relative z-10 flex min-h-[4rem] items-center justify-center px-4">
              {currentQuestion.tip ? (
                <div className="flex flex-col items-center">
                  <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 opacity-90 dark:text-indigo-300 dark:opacity-70">
                    {t('ui.proTip')}
                  </span>
                  <p className="text-center text-xs font-medium text-gray-600 dark:text-gray-400">
                    {currentQuestion.tip}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {isMobile ? t('ui.tapAgain') : t('ui.clickAgain')}
                </p>
              )}
            </div>
          </div>
        </motion.div>


      </div>

      <div className="mt-6 flex justify-center gap-2">
        {questions.map((_, index) => (
          <button
            key={index}
            onClick={() => handleNavigate(index)}
            className="relative focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2"
            aria-label={`Go to question ${index + 1}`}
            aria-current={index === currentIndex ? 'true' : 'false'}
          >
            {index === currentIndex ? (
              <div className="relative h-2 w-8">
                <div className="absolute inset-0 rounded-full bg-gray-300 dark:bg-gray-700" />
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-hover)]"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.05, ease: 'linear' }}
                />
              </div>
            ) : (
              <div className="h-2 w-2 rounded-full bg-gray-300 transition-colors hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600" />
            )}
          </button>
        ))}
      </div>


    </div>
  );
}
