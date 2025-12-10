import { NextResponse } from 'next/server';
import { db } from '@/db';
import { questions, categories } from '@/db/schema';
import { eq, sql, and, ilike } from 'drizzle-orm';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ category: string }> }
) {
  const { category } = await ctx.params;
  const { searchParams } = new URL(req.url);

  const page = Math.max(
    1,
    parseInt(searchParams.get('page') || String(DEFAULT_PAGE), 10)
  );
  const limit = Math.max(
    1,
    Math.min(50, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10))
  );
  const search = searchParams.get('search')?.trim() || '';
  const offset = (page - 1) * limit;

  const cat = await db
    .select()
    .from(categories)
    .where(eq(categories.name, category))
    .limit(1);

  if (!cat.length) {
    return NextResponse.json({
      items: [],
      total: 0,
      page,
      totalPages: 0,
    });
  }

  const baseCondition = eq(questions.categoryId, cat[0].id);
  const whereCondition = search
    ? and(baseCondition, ilike(questions.question, `%${search}%`))
    : baseCondition;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questions)
    .where(whereCondition);

  const total = Number(countResult.count);
  const totalPages = Math.ceil(total / limit);

  const items = await db
    .select()
    .from(questions)
    .where(whereCondition)
    .orderBy(questions.id)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    items,
    total,
    page,
    totalPages,
  });
}


// import { NextResponse } from 'next/server';
// import { db } from '@/db';
// import { questions, categories } from '@/db/schema';
// import { eq, sql } from 'drizzle-orm';

// const DEFAULT_PAGE = 1;
// const DEFAULT_LIMIT = 10;

// export async function GET(
//   req: Request,
//   ctx: { params: Promise<{ category: string }> }
// ) {
//   const { category } = await ctx.params;
//   const { searchParams } = new URL(req.url);

//   const page = Math.max(
//     1,
//     parseInt(searchParams.get('page') || String(DEFAULT_PAGE), 10)
//   );
//   const limit = Math.max(
//     1,
//     Math.min(50, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10))
//   );
//   const offset = (page - 1) * limit;

//   const cat = await db
//     .select()
//     .from(categories)
//     .where(eq(categories.name, category))
//     .limit(1);

//   if (!cat.length) {
//     return NextResponse.json({
//       items: [],
//       total: 0,
//       page,
//       totalPages: 0,
//     });
//   }

//   const [countResult] = await db
//     .select({ count: sql<number>`count(*)` })
//     .from(questions)
//     .where(eq(questions.categoryId, cat[0].id));

//   const total = Number(countResult.count);
//   const totalPages = Math.ceil(total / limit);

//   const items = await db
//     .select()
//     .from(questions)
//     .where(eq(questions.categoryId, cat[0].id))
//     .orderBy(questions.id)
//     .limit(limit)
//     .offset(offset);

//   return NextResponse.json({
//     items,
//     total,
//     page,
//     totalPages,
//   });
// }
