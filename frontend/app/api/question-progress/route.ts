import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getQuestionProgressForCategory,
  questionCategoryExists,
  resetQuestionProgressForCategory,
} from '@/db/queries/question-progress';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const categoryQuerySchema = z.object({
  category: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
});

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseCategory(request: Request) {
  const { searchParams } = new URL(request.url);
  return categoryQuerySchema.safeParse({
    category: searchParams.get('category'),
  });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return noStoreJson({ code: 'UNAUTHORIZED' }, 401);
  }

  const parsed = parseCategory(request);
  if (!parsed.success) {
    return noStoreJson(
      { code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      400
    );
  }

  try {
    const exists = await questionCategoryExists(parsed.data.category);
    if (!exists) {
      return noStoreJson({ code: 'CATEGORY_NOT_FOUND' }, 404);
    }

    const progress = await getQuestionProgressForCategory(
      user.id,
      parsed.data.category
    );

    return noStoreJson({ progress });
  } catch (error) {
    console.error('[GET /api/question-progress]', error);
    return noStoreJson({ code: 'INTERNAL_ERROR' }, 500);
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return noStoreJson({ code: 'UNAUTHORIZED' }, 401);
  }

  const parsed = parseCategory(request);
  if (!parsed.success) {
    return noStoreJson(
      { code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      400
    );
  }

  try {
    const exists = await questionCategoryExists(parsed.data.category);
    if (!exists) {
      return noStoreJson({ code: 'CATEGORY_NOT_FOUND' }, 404);
    }

    const progress = await resetQuestionProgressForCategory(
      user.id,
      parsed.data.category
    );

    return noStoreJson({ success: true, progress });
  } catch (error) {
    console.error('[DELETE /api/question-progress]', error);
    return noStoreJson({ code: 'INTERNAL_ERROR' }, 500);
  }
}
