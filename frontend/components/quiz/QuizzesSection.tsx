'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { QuizCard } from './QuizCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { categoryData } from '@/data/category';

interface Quiz {
  id: string;
  slug: string;
  title: string | null;
  description: string | null;
  questionsCount: number;
  timeLimitSeconds: number | null;
  categorySlug: string | null;
  categoryName: string | null;
}

interface UserProgress {
  bestScore: number;
  totalQuestions: number;
  attemptsCount: number;
}

interface QuizzesSectionProps {
  quizzes: Quiz[];
  userProgressMap: Record<string, UserProgress>;
}

export default function QuizzesSection({
  quizzes,
  userProgressMap,
}: QuizzesSectionProps) {
  const t = useTranslations('quiz.section');
  const params = useParams();
  const locale = params.locale as string;
  const localeKey = (['uk', 'en', 'pl'] as const).includes(
    locale as 'uk' | 'en' | 'pl'
  )
    ? (locale as 'uk' | 'en' | 'pl')
    : 'en';

  const DEFAULT_CATEGORY = categoryData[0]?.slug || 'html';
  const [active, setActive] = useState(DEFAULT_CATEGORY);

  return (
    <div className="w-full">
      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="!bg-transparent !p-0 !h-auto !w-full grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 mb-6 gap-2">
          {categoryData.map(category => (
            <TabsTrigger
              key={category.slug}
              value={category.slug}
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              {category.translations[localeKey] ??
                category.translations.en ??
                category.slug}
            </TabsTrigger>
          ))}
        </TabsList>

        {categoryData.map(category => {
          const categoryQuizzes = quizzes.filter(
            quiz => quiz.categorySlug === category.slug
          );

          return (
            <TabsContent key={category.slug} value={category.slug}>
              {categoryQuizzes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categoryQuizzes.map(quiz => (
                    <QuizCard
                      key={quiz.id}
                      quiz={{
                        id: quiz.id,
                        slug: quiz.slug,
                        title: quiz.title,
                        description: quiz.description,
                        questionsCount: quiz.questionsCount,
                        timeLimitSeconds: quiz.timeLimitSeconds,
                        categoryName: quiz.categoryName ?? category.slug,
                      }}
                      userProgress={userProgressMap[quiz.id] || null}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400">
                    {t('noQuizzes')}
                  </p>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
