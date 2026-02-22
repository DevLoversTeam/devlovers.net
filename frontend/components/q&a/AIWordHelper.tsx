'use client';

import {
  BookOpen,
  Clock,
  CloudOff,
  Coffee,
  Github,
  GripHorizontal,
  Heart,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Link } from '@/i18n/routing';
import {
  getCachedExplanation,
  setCachedExplanation,
} from '@/lib/ai/explainCache';
import type { ExplanationResponse } from '@/lib/ai/prompts';
import { cn } from '@/lib/utils';
import enMessages from '@/messages/en.json';
import plMessages from '@/messages/pl.json';
import ukMessages from '@/messages/uk.json';

type Locale = 'uk' | 'en' | 'pl';

interface AIWordHelperProps {
  term: string;
  context?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

interface RateLimitState {
  isRateLimited: boolean;
  resetIn: number;
  retryAttempts: number;
}

interface ServiceErrorState {
  isServiceError: boolean;
  errorCode: string;
  retryAttempts: number;
}

const messagesByLocale = {
  uk: ukMessages,
  en: enMessages,
  pl: plMessages,
} as const;

const SUPPORTED_LOCALES: Locale[] = ['uk', 'en', 'pl'];
const DEFAULT_LOCALE: Locale = 'en';

function isValidLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale)
  );
}

function getValidLocale(value: unknown): Locale {
  return isValidLocale(value) ? value : DEFAULT_LOCALE;
}

function getLocalizedMessages(locale: Locale) {
  return messagesByLocale[locale].aiHelper;
}

function formatExplanation(text: string): React.ReactNode {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let codeBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const content = paragraphBuffer.join('\n').trim();
      if (content) {
        result.push(
          <p key={`p-${result.length}`} className="my-2">
            {content}
          </p>
        );
      }
      paragraphBuffer = [];
    }
  };

  const flushCode = () => {
    if (codeBuffer.length > 0) {
      const code = codeBuffer.join('\n').trim();

      if (code && code.length > 0) {
        result.push(
          <pre
            key={`code-${result.length}`}
            className="my-3 overflow-x-auto rounded-lg bg-gray-900 p-3 text-sm dark:bg-gray-950"
          >
            <code className="text-gray-100">{code}</code>
          </pre>
        );
      }
      codeBuffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const hasCodeContent = /[a-zA-Z0-9{}()=<>[\];:'".,/\\|!@#$%^&*+-]/.test(
      trimmed
    );
    const isCodeLine =
      /^(\s{2,}|\t)/.test(line) && trimmed.length > 0 && hasCodeContent;

    if (isCodeLine) {
      flushParagraph();

      codeBuffer.push(line.replace(/^\s{2}/, ''));
    } else {
      flushCode();
      paragraphBuffer.push(line);
    }
  }

  flushCode();
  flushParagraph();

  return result;
}

export default function AIWordHelper({
  term,
  context,
  isOpen,
  onClose,
}: AIWordHelperProps) {
  const t = useTranslations('aiHelper');
  const params = useParams();
  const validatedLocale = getValidLocale(params.locale);

  const [activeLocale, setActiveLocale] = useState<Locale>(validatedLocale);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>({
    isRateLimited: false,
    resetIn: 0,
    retryAttempts: 0,
  });
  const [serviceErrorState, setServiceErrorState] = useState<ServiceErrorState>(
    {
      isServiceError: false,
      errorCode: '',
      retryAttempts: 0,
    }
  );

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const checkAuth = async () => {
      setIsCheckingAuth(true);
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        setIsAuthenticated(Boolean(data.user));
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
      setActiveLocale(validatedLocale);
      setExplanation(null);
      setError(null);
      setRateLimitState({ isRateLimited: false, resetIn: 0, retryAttempts: 0 });
      setServiceErrorState({
        isServiceError: false,
        errorCode: '',
        retryAttempts: 0,
      });
    }
  }, [isOpen, validatedLocale]);

  const fetchExplanation = useCallback(async () => {
    const cached = getCachedExplanation(term);
    if (cached) {
      setExplanation(cached);
      setError(null);
      setRateLimitState({ isRateLimited: false, resetIn: 0, retryAttempts: 0 });
      setServiceErrorState({
        isServiceError: false,
        errorCode: '',
        retryAttempts: 0,
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, context }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        if (response.status === 429 || data.code === 'RATE_LIMITED') {
          setRateLimitState(prev => ({
            isRateLimited: true,
            resetIn: data.resetIn || 0,
            retryAttempts: prev.retryAttempts + 1,
          }));
          setError('RATE_LIMITED');
          setIsLoading(false);
          return;
        }

        if (response.status === 503) {
          setServiceErrorState(prev => ({
            isServiceError: true,
            errorCode: data.code || 'SERVICE_UNAVAILABLE',
            retryAttempts: prev.retryAttempts + 1,
          }));
          setError('SERVICE_UNAVAILABLE');
          setIsLoading(false);
          return;
        }

        throw new Error(data.error || 'Failed to fetch explanation');
      }

      const data: ExplanationResponse = await response.json();
      setExplanation(data);
      setCachedExplanation(term, data);
      setRateLimitState({ isRateLimited: false, resetIn: 0, retryAttempts: 0 });
      setServiceErrorState({
        isServiceError: false,
        errorCode: '',
        retryAttempts: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [term, context]);

  useEffect(() => {
    if (isOpen && term && isAuthenticated === true) {
      fetchExplanation();
    }
  }, [isOpen, term, isAuthenticated, fetchExplanation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragState({
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: position.x,
        offsetY: position.y,
      });
    },
    [position]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      setDragState({
        isDragging: true,
        startX: touch.clientX,
        startY: touch.clientY,
        offsetX: position.x,
        offsetY: position.y,
      });
    },
    [position]
  );

  useEffect(() => {
    if (!dragState.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;
      setPosition({
        x: dragState.offsetX + deltaX,
        y: dragState.offsetY + deltaY,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      const deltaX = touch.clientX - dragState.startX;
      const deltaY = touch.clientY - dragState.startY;
      setPosition({
        x: dragState.offsetX + deltaX,
        y: dragState.offsetY + deltaY,
      });
    };

    const handleDragEnd = () => {
      setDragState(prev => ({ ...prev, isDragging: false }));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
    document.addEventListener('touchcancel', handleDragEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleDragEnd);
      document.removeEventListener('touchcancel', handleDragEnd);
    };
  }, [dragState]);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const locales = SUPPORTED_LOCALES;

  const renderGuestCTA = () => (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-purple-600">
        <Sparkles className="h-8 w-8 text-white" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('guest.title')}
      </h3>
      <p className="max-w-xs text-sm text-gray-600 dark:text-gray-400">
        {t('guest.description')}
      </p>
      <div className="mt-2 flex gap-3">
        <Link
          href="/login"
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium',
            'bg-(--accent-primary) text-white',
            'hover:bg-(--accent-hover)',
            'transition-colors'
          )}
        >
          {t('guest.login')}
        </Link>
        <Link
          href="/signup"
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium',
            'border border-gray-300 dark:border-neutral-700',
            'text-gray-700 dark:text-gray-300',
            'hover:bg-gray-100 dark:hover:bg-neutral-800',
            'transition-colors'
          )}
        >
          {t('guest.signup')}
        </Link>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'fixed inset-0 z-50',
        'bg-black/30',
        'flex items-center justify-center',
        'p-4',
        'animate-in fade-in-0 duration-200'
      )}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-helper-title"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          'bg-white dark:bg-neutral-900',
          'rounded-xl',
          'border border-gray-200 dark:border-neutral-800',
          'w-full max-w-lg',
          'max-h-[80vh] overflow-hidden',
          'flex flex-col',
          'animate-in zoom-in-95 duration-200',
          'focus:outline-none',
          'shadow-2xl',
          dragState.isDragging && 'cursor-grabbing'
        )}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      >
        <div
          className={cn(
            'flex items-center justify-between border-b border-gray-200 p-4 dark:border-neutral-800',
            'cursor-grab active:cursor-grabbing',
            'touch-none select-none'
          )}
          onMouseDown={handleDragStart}
          onTouchStart={handleTouchStart}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-4 w-4 text-gray-400" />
            <h2
              id="ai-helper-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {t('term')}: &quot;{term}&quot;
            </h2>
          </div>
          <button
            onClick={onClose}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            className={cn(
              'rounded-lg p-1.5',
              'text-gray-500 dark:text-gray-400',
              'hover:bg-gray-100 dark:hover:bg-neutral-800',
              'transition-colors',
              'focus:ring-2 focus:ring-(--accent-primary) focus:outline-none'
            )}
            aria-label={t('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isCheckingAuth && (
          <div className="flex flex-1 items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {!isCheckingAuth && isAuthenticated === false && renderGuestCTA()}

        {!isCheckingAuth && isAuthenticated === true && (
          <>
            <div className="flex gap-2 border-b border-gray-200 p-4 dark:border-neutral-800">
              {locales.map(loc => (
                <button
                  key={loc}
                  onClick={() => setActiveLocale(loc)}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    activeLocale === loc
                      ? 'bg-(--accent-primary) text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-neutral-800 dark:text-gray-300 dark:hover:bg-neutral-700'
                  )}
                >
                  {t(`languages.${loc}`)}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoading && (
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-(--accent-primary)" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('loading')}
                  </p>
                </div>
              )}

              {error &&
                (() => {
                  const messages = getLocalizedMessages(activeLocale);
                  return (
                    <div className="flex flex-col items-center justify-center gap-4 py-8">
                      {error === 'RATE_LIMITED' ? (
                        <>
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                            {rateLimitState.retryAttempts >= 3 ? (
                              <Coffee className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                            )}
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                              {rateLimitState.retryAttempts >= 3
                                ? messages.rateLimit.persistent
                                : messages.rateLimit.title}
                            </p>
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                              {rateLimitState.retryAttempts >= 3
                                ? messages.rateLimit.persistentHint
                                : messages.rateLimit.hint.replace(
                                    '{minutes}',
                                    String(
                                      Math.max(
                                        1,
                                        Math.ceil(
                                          rateLimitState.resetIn / 60000
                                        )
                                      )
                                    )
                                  )}
                            </p>
                          </div>
                          <button
                            onClick={fetchExplanation}
                            disabled={rateLimitState.retryAttempts >= 5}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-4 py-2',
                              'text-sm font-medium',
                              'transition-colors',
                              rateLimitState.retryAttempts >= 5
                                ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                : rateLimitState.retryAttempts >= 3
                                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                                  : 'bg-(--accent-primary) text-white hover:bg-(--accent-hover)'
                            )}
                          >
                            {rateLimitState.retryAttempts >= 5 ? (
                              <>
                                <Coffee className="h-4 w-4" />
                                {messages.rateLimit.takingBreak}
                              </>
                            ) : rateLimitState.retryAttempts >= 3 ? (
                              <>
                                <Coffee className="h-4 w-4" />
                                {messages.rateLimit.patience}
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4" />
                                {messages.rateLimit.tryLater}
                              </>
                            )}
                          </button>

                          <div className="mt-4 w-full border-t border-gray-200 pt-4 dark:border-neutral-700">
                            <p className="mb-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                              {messages.rateLimit.whileWaiting}
                            </p>

                            {rateLimitState.retryAttempts < 3 ? (
                              <div className="flex flex-col gap-2">
                                <Link
                                  href="/quizzes"
                                  onClick={onClose}
                                  className={cn(
                                    'flex items-center gap-3 rounded-lg px-4 py-3',
                                    'bg-gray-50 dark:bg-neutral-800',
                                    'hover:bg-gray-100 dark:hover:bg-neutral-700',
                                    'transition-colors',
                                    'text-left'
                                  )}
                                >
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                                    <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {messages.rateLimit.takeQuiz}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {messages.rateLimit.takeQuizHint}
                                    </p>
                                  </div>
                                </Link>
                                <a
                                  href="https://github.com/DevLoversTeam"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(
                                    'flex items-center gap-3 rounded-lg px-4 py-3',
                                    'bg-gray-50 dark:bg-neutral-800',
                                    'hover:bg-gray-100 dark:hover:bg-neutral-700',
                                    'transition-colors',
                                    'text-left'
                                  )}
                                >
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                                    <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {messages.rateLimit.starGithub}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {messages.rateLimit.starGithubHint}
                                    </p>
                                  </div>
                                </a>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <a
                                  href="https://github.com/sponsors/DevLoversTeam"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(
                                    'flex items-center gap-3 rounded-lg px-4 py-3',
                                    'bg-linear-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20',
                                    'hover:from-pink-100 hover:to-purple-100 dark:hover:from-pink-900/30 dark:hover:to-purple-900/30',
                                    'border border-pink-200 dark:border-pink-800',
                                    'transition-colors',
                                    'text-left'
                                  )}
                                >
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900/30">
                                    <Heart className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {messages.rateLimit.becomeSponsor}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {messages.rateLimit.becomeSponsorHint}
                                    </p>
                                  </div>
                                </a>
                                <a
                                  href="https://github.com/DevLoversTeam"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(
                                    'flex items-center gap-3 rounded-lg px-4 py-3',
                                    'bg-gray-50 dark:bg-neutral-800',
                                    'hover:bg-gray-100 dark:hover:bg-neutral-700',
                                    'transition-colors',
                                    'text-left'
                                  )}
                                >
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-neutral-700">
                                    <Github className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {messages.rateLimit.writeReview}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {messages.rateLimit.writeReviewHint}
                                    </p>
                                  </div>
                                </a>
                              </div>
                            )}
                          </div>
                        </>
                      ) : error === 'SERVICE_UNAVAILABLE' ? (
                        <>
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                            {serviceErrorState.retryAttempts >= 3 ? (
                              <Wrench className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <CloudOff className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                              {serviceErrorState.retryAttempts >= 3
                                ? messages.serviceError.persistent
                                : messages.serviceError.title}
                            </p>
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                              {serviceErrorState.retryAttempts >= 3
                                ? messages.serviceError.persistentHint
                                : messages.serviceError.hint}
                            </p>
                          </div>
                          <button
                            onClick={fetchExplanation}
                            disabled={serviceErrorState.retryAttempts >= 5}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-4 py-2',
                              'text-sm font-medium',
                              'transition-colors',
                              serviceErrorState.retryAttempts >= 5
                                ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                : serviceErrorState.retryAttempts >= 3
                                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                                  : 'bg-(--accent-primary) text-white hover:bg-(--accent-hover)'
                            )}
                          >
                            {serviceErrorState.retryAttempts >= 5 ? (
                              <>
                                <Wrench className="h-4 w-4" />
                                {messages.serviceError.fixing}
                              </>
                            ) : serviceErrorState.retryAttempts >= 3 ? (
                              <>
                                <Wrench className="h-4 w-4" />
                                {messages.serviceError.working}
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4" />
                                {messages.serviceError.tryAgain}
                              </>
                            )}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-red-600 dark:text-red-400">
                            {messages.error}
                          </p>
                          <button
                            onClick={fetchExplanation}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-4 py-2',
                              'bg-(--accent-primary) text-white',
                              'hover:bg-(--accent-hover)',
                              'transition-colors',
                              'text-sm font-medium'
                            )}
                          >
                            <RefreshCw className="h-4 w-4" />
                            {messages.retry}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

              {explanation && !isLoading && !error && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div className="leading-relaxed whitespace-pre-wrap text-gray-800 *:my-2 dark:text-gray-200">
                    {formatExplanation(explanation[activeLocale])}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
