import { NextResponse } from 'next/server';
import { db } from '@/db';
import { questions } from '@/db/schema';
import { eq, sql, and, ilike } from 'drizzle-orm';

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

    const baseCondition = and(
      eq(questions.categorySlug, category.toLowerCase()),
      eq(questions.locale, locale)
    );

    const whereCondition = search
      ? and(baseCondition, ilike(questions.question, `%${search}%`))
      : baseCondition;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(whereCondition);

    const total = Number(count);
    const totalPages = Math.ceil(total / limit);

    const items = await db
      .select()
      .from(questions)
      .where(whereCondition)
      .orderBy(questions.sortOrder)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      items,
      total,
      page,
      totalPages,
      locale,
    });
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
