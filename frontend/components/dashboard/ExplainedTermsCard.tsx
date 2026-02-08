'use client';

import { BookOpen, ChevronDown, GripVertical, RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import AIWordHelper from '@/components/q&a/AIWordHelper';
import { getCachedTerms } from '@/lib/ai/explainCache';
import {
  getHiddenTerms,
  hideTermFromDashboard,
  unhideTermFromDashboard,
} from '@/lib/ai/hiddenTerms';
import { saveTermOrder, sortTermsByOrder } from '@/lib/ai/termOrder';

export function ExplainedTermsCard() {
  const t = useTranslations('dashboard.explainedTerms');
  const [terms, setTerms] = useState<string[]>([]);
  const [hiddenTerms, setHiddenTerms] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const cached = getCachedTerms();
    const hidden = getHiddenTerms();

    const visibleTerms = cached.filter(
      term => !hidden.has(term.toLowerCase().trim())
    );

    const sortedTerms = sortTermsByOrder(visibleTerms);

    setTerms(sortedTerms);
    const hiddenArray = cached.filter(term =>
      hidden.has(term.toLowerCase().trim())
    );
    setHiddenTerms(sortTermsByOrder(hiddenArray));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRemoveTerm = (term: string) => {
    hideTermFromDashboard(term);
    setTerms(prevTerms => prevTerms.filter(t => t !== term));
    setHiddenTerms(prevHidden => [...prevHidden, term]);
  };

  const handleRestoreTerm = (term: string) => {
    unhideTermFromDashboard(term);
    setHiddenTerms(prevHidden => prevHidden.filter(t => t !== term));
    setTerms(prevTerms => {
      const updated = [...prevTerms, term];
      saveTermOrder(updated);
      return updated;
    });
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    setTerms(prevTerms => {
      const newTerms = [...prevTerms];
      const [dragged] = newTerms.splice(draggedIndex, 1);
      newTerms.splice(targetIndex, 0, dragged);

      saveTermOrder(newTerms);
      return newTerms;
    });

    setDraggedIndex(null);
  };

  const handleTermClick = (term: string) => {
    setSelectedTerm(term);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedTerm(null);
  };

  const hasTerms = terms.length > 0;
  const hasHiddenTerms = hiddenTerms.length > 0;

  const cardStyles = `
    relative overflow-hidden rounded-2xl
    border border-gray-100 dark:border-white/5
    bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl
    p-8 transition-all hover:border-[var(--accent-primary)]/30 dark:hover:border-[var(--accent-primary)]/30
  `;

  return (
    <>
      <section className={cardStyles} aria-labelledby="explained-terms-heading">
        <div>
          <div className="mb-6 flex items-center gap-3">
            <div
              className="rounded-full bg-gray-100 p-3 dark:bg-neutral-800/50"
              aria-hidden="true"
            >
              <BookOpen className="h-6 w-6 text-(--accent-primary)" />
            </div>
            <div>
              <h3
                id="explained-terms-heading"
                className="text-xl font-bold text-gray-900 dark:text-white"
              >
                {t('title')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('subtitle')}
              </p>
            </div>
          </div>

          {hasTerms ? (
            <>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                {t('termCount', { count: terms.length })}
              </p>
            <div className="flex flex-wrap gap-2">
              {terms.map((term, index) => (
                <div
                  key={`${term}-${index}`}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  className={`group relative inline-flex items-center gap-1 rounded-lg border px-2 py-2 pr-8 transition-all ${
                    draggedIndex === index ? 'opacity-50' : ''
                  } border-gray-100 bg-gray-50/50 hover:border-(--accent-primary)/30 hover:bg-white dark:border-white/5 dark:bg-neutral-800/50 dark:hover:border-(--accent-primary)/30 dark:hover:bg-neutral-800`}
                >
                  <button
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    aria-label={t('ariaDragHandle', { term })}
                    className={`cursor-grab active:cursor-grabbing touch-none ${
                      draggedIndex === index ? 'cursor-grabbing' : ''
                    }`}
                  >
                    <GripVertical className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                  </button>
                  <button
                    onClick={() => handleTermClick(term)}
                    className="font-medium text-gray-900 dark:text-white"
                  >
                    {term}
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleRemoveTerm(term);
                    }}
                    aria-label={t('ariaHide', { term })}
                    className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-gray-400 opacity-0 shadow-sm transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:bg-neutral-800 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('empty')}
              </p>
              <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                {t('emptyHint')}
              </p>
            </div>
          )}

          {/* Explained Terms Section */}
          <div className="mt-6">
              <button
                onClick={() => setShowMore(!showMore)}
                className="mb-3 flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-white/5 dark:bg-neutral-800/50 dark:text-gray-300 dark:hover:bg-neutral-800"
              >
                <span>
                  {showMore
                    ? t('hideExplainedTerms')
                    : t('explainedTermsButton', { count: hiddenTerms.length })}
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`}
                />
              </button>

                {showMore && (
                  <div>
                    {hasHiddenTerms ? (
                      <div className="flex flex-wrap gap-2">
                        {hiddenTerms.map(term => (
                          <div
                            key={term}
                            className="group relative inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-100/50 px-3 py-2 pr-8 opacity-60 transition-all hover:opacity-100 dark:border-white/10 dark:bg-neutral-800/30"
                          >
                            <button
                              onClick={() => handleTermClick(term)}
                              className="font-medium text-gray-700 dark:text-gray-400"
                            >
                              {term}
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleRestoreTerm(term);
                              }}
                              aria-label={t('ariaRestore', { term })}
                              className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-gray-400 opacity-0 shadow-sm transition-opacity hover:bg-green-50 hover:text-green-600 group-hover:opacity-100 dark:bg-neutral-800 dark:hover:bg-green-900/20 dark:hover:text-green-400"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                        {t('noHiddenTerms')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
        </section>

      {selectedTerm && (
        <AIWordHelper
          term={selectedTerm}
          isOpen={isModalOpen}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}
