import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  markQuestionViewed,
  questionExists,
  setQuestionBookmark,
} from '@/db/queries/question-progress';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  questionId: z.string().uuid(),
});

const mutationSchema = z.union([
  z.object({ viewed: z.literal(true) }).strict(),
  z.object({ bookmarked: z.boolean() }).strict(),
]);

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ questionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return noStoreJson({ code: 'UNAUTHORIZED' }, 401);
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return noStoreJson(
      { code: 'VALIDATION_ERROR', details: parsedParams.error.flatten() },
      400
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsedBody = mutationSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return noStoreJson(
      { code: 'VALIDATION_ERROR', details: parsedBody.error.flatten() },
      400
    );
  }

  try {
    const exists = await questionExists(parsedParams.data.questionId);
    if (!exists) {
      return noStoreJson({ code: 'QUESTION_NOT_FOUND' }, 404);
    }

    const progress =
      'viewed' in parsedBody.data
        ? await markQuestionViewed(user.id, parsedParams.data.questionId)
        : await setQuestionBookmark(
            user.id,
            parsedParams.data.questionId,
            parsedBody.data.bookmarked
          );

    return noStoreJson({ success: true, progress });
  } catch (error) {
    console.error('[PUT /api/question-progress/:questionId]', error);
    return noStoreJson({ code: 'INTERNAL_ERROR' }, 500);
  }
}
