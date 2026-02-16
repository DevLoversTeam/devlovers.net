'use client';

import { ChevronDown, MessageSquare, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

interface FeedbackFormProps {
  userName?: string | null;
  userEmail?: string | null;
}

export function FeedbackForm({ userName, userEmail }: FeedbackFormProps) {
  const t = useTranslations('dashboard.feedback');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [categoryError, setCategoryError] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categories = [
    { value: 'Bug Report', label: t('categoryBug') },
    { value: 'Suggestion', label: t('categorySuggestion') },
    { value: 'Question', label: t('categoryQuestion') },
    { value: 'Other', label: t('categoryOther') },
  ];

  const selectedLabel = categories.find(c => c.value === category)?.label;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryRef.current &&
        !categoryRef.current.contains(event.target as Node)
      ) {
        setCategoryOpen(false);
      }
    };

    const handleSmoothScroll = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href="#feedback"]');
      if (anchor) {
        e.preventDefault();
        document
          .getElementById('feedback')
          ?.scrollIntoView({ behavior: 'smooth' });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('click', handleSmoothScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('click', handleSmoothScroll);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const cardStyles = `
    relative overflow-hidden rounded-2xl
    border border-gray-200 dark:border-white/10
    bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl
    p-4 sm:p-6 md:p-8 transition-all hover:border-(--accent-primary)/30 dark:hover:border-(--accent-primary)/30
  `;

  const inputStyles =
    'w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-neutral-800/50 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none transition-colors focus:border-(--accent-primary) focus:ring-1 focus:ring-(--accent-primary)';

  const primaryBtnStyles = `
    group relative inline-flex items-center justify-center gap-2 rounded-full
    px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white
    bg-(--accent-primary) hover:bg-(--accent-hover)
    transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100
  `;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!category) {
      setCategoryError(true);
      return;
    }
    setCategoryError(false);
    setLoading(true);
    setStatus('idle');

    const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY;
    if (!accessKey) {
      console.error(
        'FeedbackForm: NEXT_PUBLIC_WEB3FORMS_KEY is not defined. Add it to your .env file.'
      );
      setStatus('error');
      setLoading(false);
      return;
    }

    const formData = new FormData(e.currentTarget);

    const data = {
      access_key: accessKey,
      subject: `DevLovers Feedback: ${formData.get('category')}`,
      from_name: formData.get('name'),
      email: formData.get('email'),
      category: formData.get('category'),
      message: formData.get('message'),
      botcheck: '',
    };

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (result.success) {
        setStatus('success');
        setCategory('');
        (e.target as HTMLFormElement).reset();
        successTimerRef.current = setTimeout(() => setStatus('idle'), 5000);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={cardStyles} aria-labelledby="feedback-heading">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="rounded-full bg-gray-100 p-3 dark:bg-neutral-800/50"
          aria-hidden="true"
        >
          <MessageSquare className="h-5 w-5 text-(--accent-primary)" />
        </div>
        <div>
          <h3
            id="feedback-heading"
            className="text-xl font-bold text-gray-900 dark:text-white"
          >
            {t('title')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('description')}
          </p>
        </div>
      </div>

      {status === 'success' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
          {t('success')}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="botcheck" className="hidden" />

          <div className="grid gap-4 sm:grid-cols-2">
            <input
              name="name"
              type="text"
              placeholder={t('name')}
              defaultValue={userName ?? ''}
              required
              onInvalid={e => (e.target as HTMLInputElement).setCustomValidity(t('requiredField'))}
              onInput={e => (e.target as HTMLInputElement).setCustomValidity('')}
              className={inputStyles}
            />
            <input
              name="email"
              type="email"
              placeholder={t('email')}
              defaultValue={userEmail ?? ''}
              required
              onInvalid={e => (e.target as HTMLInputElement).setCustomValidity(t('requiredField'))}
              onInput={e => (e.target as HTMLInputElement).setCustomValidity('')}
              className={inputStyles}
            />
          </div>

          <input type="hidden" name="category" value={category} />
          <div className="relative" ref={categoryRef}>
            <button
              type="button"
              onClick={() => setCategoryOpen(!categoryOpen)}
              className={`flex w-full items-center justify-between rounded-xl border bg-gray-50/50 px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:bg-neutral-800/50 dark:text-gray-300 dark:hover:bg-neutral-800 ${categoryError ? 'border-red-400 dark:border-red-500/50' : 'border-gray-200 dark:border-white/5'}`}
            >
              <span className={selectedLabel ? '' : 'text-gray-400 dark:text-gray-500'}>
                {selectedLabel ?? t('category')}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${categoryOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {categoryOpen && (
              <div className="absolute left-0 z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
                {categories.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      setCategory(c.value);
                      setCategoryError(false);
                      setCategoryOpen(false);
                    }}
                    className={`block w-full px-4 py-2 text-left text-sm transition-colors ${
                      category === c.value
                        ? 'bg-(--accent-primary)/10 font-medium text-(--accent-primary)'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {categoryError && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                {t('requiredField')}
              </p>
            )}
          </div>

          <textarea
            name="message"
            placeholder={t('messagePlaceholder')}
            required
            onInvalid={e => (e.target as HTMLTextAreaElement).setCustomValidity(t('requiredField'))}
            onInput={e => (e.target as HTMLTextAreaElement).setCustomValidity('')}
            rows={4}
            className={`${inputStyles} resize-none`}
          />

          {status === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {t('error')}
            </div>
          )}

          <div className="flex justify-center">
            <button type="submit" disabled={loading} className={primaryBtnStyles}>
              <Send className="h-4 w-4" />
              <span>{loading ? t('submitting') : t('submit')}</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
