'use server';

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { aiLearnedTerms } from '@/db/schema/ai';
import { getCurrentUser } from '@/lib/auth';
import type { ExplanationResponse } from '@/lib/ai/prompts';

function normalizeTerm(term: string): string {
  return term.toLowerCase().trim();
}

export async function saveLearnedTerm(
  term: string,
  explanation: ExplanationResponse
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const normalized = normalizeTerm(term);
  if (!normalized) return { success: false, error: 'Invalid term' };

  try {
    await db
      .insert(aiLearnedTerms)
      .values({
        userId: user.id,
        term: normalized,
        explanationUk: explanation.uk,
        explanationEn: explanation.en,
        explanationPl: explanation.pl,
        sortOrder: 0,
      })
      .onConflictDoUpdate({
        target: [aiLearnedTerms.userId, aiLearnedTerms.term],
        set: {
          explanationUk: explanation.uk,
          explanationEn: explanation.en,
          explanationPl: explanation.pl,
        },
      });

    return { success: true };
  } catch (error) {
    console.error('[ai] Failed to save learned term:', error);
    return { success: false, error: 'Failed to save term' };
  }
}

export async function getLearnedTerms(): Promise<
  | {
      success: true;
      terms: {
        term: string;
        explanationUk: string;
        explanationEn: string;
        explanationPl: string;
        isHidden: boolean;
        sortOrder: number;
      }[];
    }
  | { success: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  try {
    const rows = await db
      .select({
        term: aiLearnedTerms.term,
        explanationUk: aiLearnedTerms.explanationUk,
        explanationEn: aiLearnedTerms.explanationEn,
        explanationPl: aiLearnedTerms.explanationPl,
        isHidden: aiLearnedTerms.isHidden,
        sortOrder: aiLearnedTerms.sortOrder,
      })
      .from(aiLearnedTerms)
      .where(eq(aiLearnedTerms.userId, user.id))
      .orderBy(asc(aiLearnedTerms.sortOrder), asc(aiLearnedTerms.createdAt));

    return { success: true, terms: rows };
  } catch (error) {
    console.error('[ai] Failed to fetch learned terms:', error);
    return { success: false, error: 'Failed to fetch terms' };
  }
}

export async function setTermHidden(
  term: string,
  isHidden: boolean
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const normalized = normalizeTerm(term);

  try {
    await db
      .update(aiLearnedTerms)
      .set({ isHidden })
      .where(
        and(
          eq(aiLearnedTerms.userId, user.id),
          eq(aiLearnedTerms.term, normalized)
        )
      );

    return { success: true };
  } catch (error) {
    console.error('[ai] Failed to update term visibility:', error);
    return { success: false, error: 'Failed to update term' };
  }
}

export async function updateTermsOrder(
  orderedTerms: string[]
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  try {
    await Promise.all(
      orderedTerms.map((term, index) =>
        db
          .update(aiLearnedTerms)
          .set({ sortOrder: index })
          .where(
            and(
              eq(aiLearnedTerms.userId, user.id),
              eq(aiLearnedTerms.term, normalizeTerm(term))
            )
          )
      )
    );

    return { success: true };
  } catch (error) {
    console.error('[ai] Failed to update term order:', error);
    return { success: false, error: 'Failed to update order' };
  }
}
