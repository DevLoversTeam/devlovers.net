'use client';

import { ChevronDown, MessageSquare, Paperclip, Send, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

const MAX_FILES = 5;

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
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [fileLimitError, setFileLimitError] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedFilesRef = useRef<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = [
    { value: 'Bug Report', label: t('categoryBug') },
    { value: 'Suggestion', label: t('categorySuggestion') },
    { value: 'Question', label: t('categoryQuestion') },
    { value: 'Other', label: t('categoryOther') },
  ];

  const selectedLabel = categories.find(c => c.value === category)?.label;

  function removeFile(name: string) {
    const updated = accumulatedFilesRef.current.filter(f => f.name !== name);
    accumulatedFilesRef.current = updated;
    setAttachmentNames(updated.map(f => f.name));
    if (updated.length < MAX_FILES) setFileLimitError(false);
  }

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

  const cardStyles = 'dashboard-card p-6 sm:p-8 lg:p-10';

  const inputStyles =
    'w-full rounded-xl border border-gray-200/50 bg-white/20 dark:border-white/10 dark:bg-neutral-800/40 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none backdrop-blur-md transition-all hover:bg-white/40 dark:hover:bg-neutral-800/60 focus:border-(--accent-primary)/50 focus:bg-white/60 dark:focus:bg-neutral-800/80 focus:ring-1 focus:ring-(--accent-primary)';

  const primaryBtnStyles = `
    group relative inline-flex items-center justify-center gap-2 rounded-full
    px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white
    bg-(--accent-primary) hover:bg-(--accent-hover) hover:shadow-[0_4px_12px_rgba(var(--accent-primary-rgb),0.3)]
    transition-all hover:-translate-y-0.5
    disabled:opacity-75
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

    const formData = new FormData(e.currentTarget);
    // Replace the stale file input value with our accumulated files
    formData.delete('attachment');
    for (const f of accumulatedFilesRef.current) {
      formData.append('attachment', f);
    }
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (result.success) {
        setStatus('success');
        setCategory('');
        setAttachmentNames([]);
        accumulatedFilesRef.current = [];
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
          className="rounded-xl bg-gray-100/50 p-3 ring-1 ring-black/5 dark:bg-neutral-800/50 dark:ring-white/10"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              name="name"
              type="text"
              placeholder={t('name')}
              defaultValue={userName ?? ''}
              required
              onInvalid={e =>
                (e.target as HTMLInputElement).setCustomValidity(
                  t('requiredField')
                )
              }
              onInput={e =>
                (e.target as HTMLInputElement).setCustomValidity('')
              }
              className={inputStyles}
            />
            <input
              name="email"
              type="email"
              placeholder={t('email')}
              defaultValue={userEmail ?? ''}
              readOnly
              className={`${inputStyles} cursor-default select-none`}
            />
          </div>

          <input type="hidden" name="category" value={category} />
          <div className="relative" ref={categoryRef}>
            <button
              type="button"
              onClick={() => setCategoryOpen(!categoryOpen)}
              className={`flex w-full items-center justify-between rounded-xl border bg-gray-50/50 px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:bg-neutral-800/50 dark:text-gray-300 dark:hover:bg-neutral-800 ${categoryError ? 'border-red-400 dark:border-red-500/50' : 'border-gray-200 dark:border-white/5'}`}
            >
              <span
                className={
                  selectedLabel ? '' : 'text-gray-400 dark:text-gray-500'
                }
              >
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
            onInvalid={e =>
              (e.target as HTMLTextAreaElement).setCustomValidity(
                t('requiredField')
              )
            }
            onInput={e =>
              (e.target as HTMLTextAreaElement).setCustomValidity('')
            }
            rows={4}
            className={`${inputStyles} resize-none`}
          />

          {status === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {t('error')}
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={loading}
              className={`${primaryBtnStyles} w-full shrink-0 sm:w-auto`}
            >
              <Send className="h-4 w-4" />
              <span>{loading ? t('submitting') : t('submit')}</span>
            </button>

            <div className="w-full sm:w-auto">
              <input
                ref={fileInputRef}
                type="file"
                name="attachment"
                id="feedback-attachment"
                accept="image/png, image/jpeg, image/jpg, image/webp, image/gif, application/pdf, text/plain, .doc, .docx, .xls, .xlsx"
                multiple
                className="hidden"
                onChange={e => {
                  const newFiles = Array.from(e.target.files ?? []);
                  const merged = [...accumulatedFilesRef.current];
                  let limitReached = false;
                  for (const f of newFiles) {
                    if (!merged.some(ex => ex.name === f.name)) {
                      if (merged.length >= MAX_FILES) {
                        limitReached = true;
                        break;
                      }
                      merged.push(f);
                    }
                  }
                  if (limitReached) setFileLimitError(true);
                  accumulatedFilesRef.current = merged;
                  setAttachmentNames(merged.map(f => f.name));
                  // Reset so the same file can be re-picked and input is ready for next selection
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <label
                htmlFor="feedback-attachment"
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/50 px-8 py-3 text-sm font-semibold tracking-widest text-gray-600 uppercase transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-(--accent-primary)/50 focus:outline-hidden sm:w-auto dark:border-white/10 dark:bg-neutral-900/50 dark:text-gray-300 dark:hover:bg-neutral-800"
              >
                <Paperclip className="h-4 w-4" />
                <span>{t('attachFile')}</span>
              </label>
            </div>
          </div>

          {fileLimitError && (
            <p className="text-xs text-red-500 dark:text-red-400">
              {t('tooManyFiles', { max: MAX_FILES })}
            </p>
          )}

          {attachmentNames.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {attachmentNames.map(name => (
                <li
                  key={name}
                  className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-300"
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="max-w-40 truncate">{name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(name)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-neutral-700"
                    aria-label={t('removeFile', { name })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </section>
  );
}
