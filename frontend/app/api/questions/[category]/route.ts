import { and, eq, ilike,sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { categories, questions, questionTranslations } from '@/db/schema';
import { buildQaCacheKey, getQaCache, setQaCache } from '@/lib/cache/qa';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_LOCALE = 'uk';
type QaApiResponse = {
  items: {
    id: string;
    categoryId: string;
    sortOrder: number;
    difficulty: string | null;
    question: string;
    answerBlocks: unknown;
    locale: string;
  }[];
  total: number;
  page: number;
  totalPages: number;
  locale: string;
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ category: string }> }
) {
  try {
    const { category } = await ctx.params;
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, Number(searchParams.get('page') ?? DEFAULT_PAGE));
    const limit = Math.min(
      50,
      Math.max(1, Number(searchParams.get('limit') ?? DEFAULT_LIMIT))
    );
    const offset = (page - 1) * limit;

    const locale =
      searchParams.get('locale') ||
      req.headers.get('x-locale') ||
      DEFAULT_LOCALE;

    const search = searchParams.get('search')?.trim();
    const cacheKey = buildQaCacheKey({
      category,
      locale,
      page,
      limit,
      search,
    });

    const cached = await getQaCache<QaApiResponse>(cacheKey);

    if (cached) {
      const response = NextResponse.json(cached);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('x-qa-cache', 'HIT');
      return response;
    }

    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, category.toLowerCase()))
      .limit(1);

    if (!cat) {
      const response = NextResponse.json({
        items: [],
        total: 0,
        page: 1,
        totalPages: 0,
        locale,
      });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const baseCondition = and(
      eq(questions.categoryId, cat.id),
      eq(questionTranslations.locale, locale)
    );

    const whereCondition = search
      ? and(baseCondition, ilike(questionTranslations.question, `%${search}%`))
      : baseCondition;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .innerJoin(
        questionTranslations,
        eq(questions.id, questionTranslations.questionId)
      )
      .where(whereCondition);

    const total = Number(count);
    const totalPages = Math.ceil(total / limit);

    const items = await db
      .select({
        id: questions.id,
        categoryId: questions.categoryId,
        sortOrder: questions.sortOrder,
        difficulty: questions.difficulty,
        question: questionTranslations.question,
        answerBlocks: questionTranslations.answerBlocks,
        locale: questionTranslations.locale,
      })
      .from(questions)
      .innerJoin(
        questionTranslations,
        eq(questions.id, questionTranslations.questionId)
      )
      .where(whereCondition)
      .orderBy(questions.sortOrder)
      .limit(limit)
      .offset(offset);

    const response = NextResponse.json({
      items,
      total,
      page,
      totalPages,
      locale,
    });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('x-qa-cache', 'MISS');

    await setQaCache(cacheKey, {
      items,
      total,
      page,
      totalPages,
      locale,
    });

    return response;
  } catch (error) {
    console.error('[GET /api/questions/:category]', error);

    return NextResponse.json(
      {
        items: [],
        total: 0,
        page: 1,
        totalPages: 0,
        locale: DEFAULT_LOCALE,
      },
      { status: 500 }
    );
  }
}
