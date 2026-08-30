import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
  sql,
} from 'drizzle-orm';

import { db } from '@/db';
import { categories, categoryTranslations } from '@/db/schema/categories';
import { userQuestionProgress } from '@/db/schema/questionProgress';
import { questions } from '@/db/schema/questions';

export type QuestionProgressRecord = {
  questionId: string;
  viewedAt: Date | null;
  bookmarkedAt: Date | null;
  lastOpenedAt: Date | null;
  updatedAt: Date;
};

export type CategoryQuestionProgress = {
  totalQuestions: number;
  viewedCount: number;
  bookmarkedCount: number;
  viewedQuestionIds: string[];
  bookmarkedQuestionIds: string[];
  lastOpenedQuestionId: string | null;
  items: QuestionProgressRecord[];
};

export type DashboardQuestionProgress = {
  categoryId: string;
  categorySlug: string;
  categoryTitle: string | null;
  totalQuestions: number;
  viewedCount: number;
  bookmarkedCount: number;
  lastOpenedAt: Date | null;
  lastActivityAt: Date | null;
  lastOpenedQuestionId: string | null;
};

const progressSelection = {
  questionId: userQuestionProgress.questionId,
  viewedAt: userQuestionProgress.viewedAt,
  bookmarkedAt: userQuestionProgress.bookmarkedAt,
  lastOpenedAt: userQuestionProgress.lastOpenedAt,
  updatedAt: userQuestionProgress.updatedAt,
};

export async function questionExists(questionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);

  return rows.length > 0;
}

export async function questionCategoryExists(
  categorySlug: string
): Promise<boolean> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, categorySlug.toLowerCase()))
    .limit(1);

  return rows.length > 0;
}

export async function getQuestionProgressForCategory(
  userId: string,
  categorySlug: string
): Promise<CategoryQuestionProgress> {
  const normalizedCategorySlug = categorySlug.toLowerCase();
  const categoryCondition = eq(categories.slug, normalizedCategorySlug);

  const [items, totalRows] = await Promise.all([
    db
      .select(progressSelection)
      .from(userQuestionProgress)
      .innerJoin(questions, eq(questions.id, userQuestionProgress.questionId))
      .innerJoin(categories, eq(categories.id, questions.categoryId))
      .where(and(eq(userQuestionProgress.userId, userId), categoryCondition))
      .orderBy(questions.sortOrder, questions.id),
    db
      .select({ total: count() })
      .from(questions)
      .innerJoin(categories, eq(categories.id, questions.categoryId))
      .where(categoryCondition),
  ]);

  const viewedQuestionIds: string[] = [];
  const bookmarkedQuestionIds: string[] = [];
  let lastOpenedQuestionId: string | null = null;
  let latestOpenedAt = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    if (item.viewedAt) viewedQuestionIds.push(item.questionId);
    if (item.bookmarkedAt) bookmarkedQuestionIds.push(item.questionId);

    if (item.lastOpenedAt) {
      const openedAt = item.lastOpenedAt.getTime();
      if (openedAt > latestOpenedAt) {
        latestOpenedAt = openedAt;
        lastOpenedQuestionId = item.questionId;
      }
    }
  }

  return {
    totalQuestions: totalRows[0]?.total ?? 0,
    viewedCount: viewedQuestionIds.length,
    bookmarkedCount: bookmarkedQuestionIds.length,
    viewedQuestionIds,
    bookmarkedQuestionIds,
    lastOpenedQuestionId,
    items,
  };
}

export async function markQuestionViewed(
  userId: string,
  questionId: string,
  openedAt: Date = new Date()
): Promise<QuestionProgressRecord> {
  const [progress] = await db
    .insert(userQuestionProgress)
    .values({
      userId,
      questionId,
      viewedAt: openedAt,
      lastOpenedAt: openedAt,
      updatedAt: openedAt,
    })
    .onConflictDoUpdate({
      target: [userQuestionProgress.userId, userQuestionProgress.questionId],
      set: {
        viewedAt: sql`coalesce(${userQuestionProgress.viewedAt}, excluded.viewed_at)`,
        lastOpenedAt: openedAt,
        updatedAt: openedAt,
      },
    })
    .returning(progressSelection);

  if (!progress) {
    throw new Error('Failed to mark question as viewed');
  }

  return progress;
}

export async function setQuestionBookmark(
  userId: string,
  questionId: string,
  bookmarked: boolean,
  changedAt: Date = new Date()
): Promise<QuestionProgressRecord | null> {
  if (bookmarked) {
    const [progress] = await db
      .insert(userQuestionProgress)
      .values({
        userId,
        questionId,
        viewedAt: changedAt,
        bookmarkedAt: changedAt,
        lastOpenedAt: changedAt,
        updatedAt: changedAt,
      })
      .onConflictDoUpdate({
        target: [userQuestionProgress.userId, userQuestionProgress.questionId],
        set: {
          viewedAt: sql`coalesce(${userQuestionProgress.viewedAt}, excluded.viewed_at)`,
          bookmarkedAt: changedAt,
          lastOpenedAt: sql`coalesce(${userQuestionProgress.lastOpenedAt}, excluded.last_opened_at)`,
          updatedAt: changedAt,
        },
      })
      .returning(progressSelection);

    if (!progress) {
      throw new Error('Failed to bookmark question');
    }

    return progress;
  }

  const [viewedProgress] = await db
    .update(userQuestionProgress)
    .set({ bookmarkedAt: null, updatedAt: changedAt })
    .where(
      and(
        eq(userQuestionProgress.userId, userId),
        eq(userQuestionProgress.questionId, questionId),
        isNotNull(userQuestionProgress.viewedAt)
      )
    )
    .returning(progressSelection);

  if (viewedProgress) return viewedProgress;

  await db
    .delete(userQuestionProgress)
    .where(
      and(
        eq(userQuestionProgress.userId, userId),
        eq(userQuestionProgress.questionId, questionId),
        isNull(userQuestionProgress.viewedAt),
        isNotNull(userQuestionProgress.bookmarkedAt)
      )
    );

  return null;
}

export async function resetQuestionProgressForCategory(
  userId: string,
  categorySlug: string
): Promise<CategoryQuestionProgress> {
  const categoryQuestionIds = db
    .select({ id: questions.id })
    .from(questions)
    .innerJoin(categories, eq(categories.id, questions.categoryId))
    .where(eq(categories.slug, categorySlug.toLowerCase()));

  await db
    .delete(userQuestionProgress)
    .where(
      and(
        eq(userQuestionProgress.userId, userId),
        inArray(userQuestionProgress.questionId, categoryQuestionIds),
        isNull(userQuestionProgress.bookmarkedAt)
      )
    );

  await db
    .update(userQuestionProgress)
    .set({ viewedAt: null, lastOpenedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(userQuestionProgress.userId, userId),
        inArray(userQuestionProgress.questionId, categoryQuestionIds),
        isNotNull(userQuestionProgress.bookmarkedAt)
      )
    );

  return getQuestionProgressForCategory(userId, categorySlug);
}

export async function getUserQuestionProgressForDashboard(
  userId: string,
  locale: string
): Promise<DashboardQuestionProgress[]> {
  const viewedCount =
    sql<number>`count(${userQuestionProgress.questionId}) filter (where ${userQuestionProgress.viewedAt} is not null)`.mapWith(
      Number
    );
  const bookmarkedCount =
    sql<number>`count(${userQuestionProgress.questionId}) filter (where ${userQuestionProgress.bookmarkedAt} is not null)`.mapWith(
      Number
    );
  const lastActivityAt = max(userQuestionProgress.updatedAt);

  return db
    .select({
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryTitle: categoryTranslations.title,
      totalQuestions: countDistinct(questions.id),
      viewedCount,
      bookmarkedCount,
      lastOpenedAt: max(userQuestionProgress.lastOpenedAt),
      lastActivityAt,
      lastOpenedQuestionId: sql<string | null>`(
        array_agg(
          ${userQuestionProgress.questionId}
          order by ${userQuestionProgress.lastOpenedAt} desc nulls last
        ) filter (where ${userQuestionProgress.lastOpenedAt} is not null)
      )[1]`,
    })
    .from(categories)
    .innerJoin(questions, eq(questions.categoryId, categories.id))
    .leftJoin(
      categoryTranslations,
      and(
        eq(categoryTranslations.categoryId, categories.id),
        eq(categoryTranslations.locale, locale)
      )
    )
    .leftJoin(
      userQuestionProgress,
      and(
        eq(userQuestionProgress.questionId, questions.id),
        eq(userQuestionProgress.userId, userId)
      )
    )
    .groupBy(categories.id, categories.slug, categoryTranslations.title)
    .having(sql`count(${userQuestionProgress.questionId}) > 0`)
    .orderBy(desc(lastActivityAt), categories.displayOrder);
}
