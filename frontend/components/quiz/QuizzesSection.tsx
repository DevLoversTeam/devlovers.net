'use client';

import { useTranslations } from 'next-intl';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { QuizCard } from './QuizCard';
import { Tabs, TabsList, TabsContent } from '@/components/ui/tabs';
import { categoryData } from '@/data/category';
import { CategoryTabButton } from '@/components/shared/CategoryTabButton';
import { categoryTabStyles } from '@/data/categoryStyles';

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = params.locale as string;
  const localeKey = (['uk', 'en', 'pl'] as const).includes(
    locale as 'uk' | 'en' | 'pl'
  )
    ? (locale as 'uk' | 'en' | 'pl')
    : 'en';

  const DEFAULT_CATEGORY = categoryData[0]?.slug || 'git';

  const categoryFromUrl = searchParams.get('category');
  const validCategory = categoryData.some(c => c.slug === categoryFromUrl);
  const activeCategory = validCategory ? categoryFromUrl! : DEFAULT_CATEGORY;

  const handleCategoryChange = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('category', category);
    router.replace(`?${params.toString()}`, { scroll: false });
  };


  return (
    <div className="w-full">
      <Tabs value={activeCategory} onValueChange={handleCategoryChange}>
        <TabsList className="!bg-transparent !p-0 !h-auto !w-full flex flex-wrap items-stretch justify-start gap-3 mb-6">
        {categoryData.map(category => {
          const slug = category.slug as keyof typeof categoryTabStyles;
          return (
            <CategoryTabButton
              key={slug}
              value={slug}
              label={
                category.translations[localeKey] ??
                category.translations.en ??
                slug
              }
              style={categoryTabStyles[slug]}
              isActive={activeCategory === slug}
            />
          );
        })}
        </TabsList>
        {categoryData.map(category => {
          const categoryQuizzes = quizzes.filter(
            quiz => quiz.categorySlug === category.slug
          );
          return (
            <TabsContent key={category.slug} value={category.slug}>
              {categoryQuizzes.length > 0 ? (
                <div className="max-w-5xl">
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
                        categorySlug: quiz.categorySlug ?? category.slug,
                      }}
                      userProgress={userProgressMap[quiz.id] || null}
                    />
                  ))}
                </div>
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
