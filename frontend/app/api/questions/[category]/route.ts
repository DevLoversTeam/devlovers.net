import { and, eq, ilike } from 'drizzle-orm';
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

function dedupeItems(items: QaApiResponse['items']) {
  const seenById = new Set<string>();
  const seenByText = new Set<string>();
  const unique: QaApiResponse['items'] = [];

  for (const item of items) {
    if (seenById.has(item.id)) {
      continue;
    }

    const textKey = `${item.locale}:${item.question.trim().toLowerCase()}`;
    if (seenByText.has(textKey)) {
      continue;
    }

    seenById.add(item.id);
    seenByText.add(textKey);
    unique.push(item);
  }

  return unique;
}

function normalizeResponse(data: QaApiResponse, limit: number): QaApiResponse {
  const uniqueItems = dedupeItems(data.items);
  if (uniqueItems.length === data.items.length) {
    return data;
  }

  const removed = data.items.length - uniqueItems.length;
  const total = Math.max(0, data.total - removed);
  const totalPages = Math.ceil(total / limit);

  return {
    ...data,
    items: uniqueItems,
    total,
    totalPages,
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ category: string }> }
) {
  try {
    const { category } = await ctx.params;
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, Number(searchParams.get('page') ?? DEFAULT_PAGE));
    const limit = Math.min(
      100,
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
      const normalizedCached = normalizeResponse(cached, limit);
      const response = NextResponse.json(normalizedCached);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('x-qa-cache', 'HIT');

      if (normalizedCached.items.length !== cached.items.length) {
        await setQaCache(cacheKey, normalizedCached);
      }

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

    const allItems = await db
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
      .orderBy(questions.sortOrder, questions.id);

    const uniqueItems = dedupeItems(allItems);
    const total = uniqueItems.length;
    const totalPages = Math.ceil(total / limit);
    const items = uniqueItems.slice(offset, offset + limit);

    const payload = {
      items,
      total,
      page,
      totalPages,
      locale,
    } satisfies QaApiResponse;
    const response = NextResponse.json(payload);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('x-qa-cache', 'MISS');

    await setQaCache(cacheKey, payload);

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
