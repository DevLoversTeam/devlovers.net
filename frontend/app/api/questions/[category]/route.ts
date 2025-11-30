import { NextResponse } from 'next/server';
import { db } from '@/db';
import { questions, categories } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ category: string }> }
) {
  const { category } = await ctx.params; // <-- ВАЖНО: await !!!

  // найти категорию
  const cat = await db
    .select()
    .from(categories)
    .where(eq(categories.name, category))
    .limit(1);

  if (!cat.length) {
    return NextResponse.json([]);
  }

  // получить вопросы этой категории
  const items = await db
    .select()
    .from(questions)
    .where(eq(questions.categoryId, cat[0].id))
    .orderBy(questions.id);

  return NextResponse.json(items);
}
