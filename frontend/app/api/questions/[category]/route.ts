import { NextResponse } from 'next/server';
import { db } from '@/db';
import { categories, questions, questionTranslations } from '@/db/schema';
import { eq, sql, and, ilike } from 'drizzle-orm';

export const revalidate = 300;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_LOCALE = 'uk';

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

    // Find category by slug
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
      response.headers.set(
        'Cache-Control',
        'public, s-maxage=300, stale-while-revalidate=600'
      );
      return response;
    }

    // Base conditions: category match + locale match
    const baseCondition = and(
      eq(questions.categoryId, cat.id),
      eq(questionTranslations.locale, locale)
    );

    const whereCondition = search
      ? and(baseCondition, ilike(questionTranslations.question, `%${search}%`))
      : baseCondition;

    // Count total
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

    // Get items with translations
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
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600'
    );
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
