import 'dotenv/config';

import { and, eq } from 'drizzle-orm';

import rawData from '../parse/questions.json';
import { db } from './index';
import { categories, questions, questionTranslations } from './schema';

type RawQuestion = {
  category: string;
  order?: number;
  translations: Record<
    string,
    {
      question: string;
      answerBlocks: unknown;
    }
  >;
};

const data = Array.isArray(rawData) ? (rawData as RawQuestion[]) : [];

function normalizeLocale(locale: string) {
  return locale.trim().toLowerCase();
}

async function seedQuestions() {
  if (!data.length) {
    console.log('No questions to seed - skipping.');
    return;
  }

  const localeTotals = new Map<string, number>();
  for (const q of data) {
    for (const locale of Object.keys(q.translations ?? {})) {
      const normalized = normalizeLocale(locale);
      localeTotals.set(normalized, (localeTotals.get(normalized) ?? 0) + 1);
    }
  }

  console.log(
    `[seed] Loaded ${data.length} questions with locales: ${Array.from(
      localeTotals.entries()
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([locale, count]) => `${locale}(${count})`)
      .join(', ')}`
  );

  for (const q of data) {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, q.category))
      .limit(1);

    if (!category) {
      console.log(`Category ${q.category} not found, skipping question...`);
      continue;
    }

    const sortOrder = q.order ?? 0;

    const [existingQuestion] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(
        and(
          eq(questions.categoryId, category.id),
          eq(questions.sortOrder, sortOrder)
        )
      )
      .limit(1);

    const questionId =
      existingQuestion?.id ??
      (
        await db
          .insert(questions)
          .values({
            categoryId: category.id,
            sortOrder,
          })
          .returning({ id: questions.id })
      )[0]!.id;

    const translations = Object.entries(q.translations ?? {}).map(
      ([locale, content]) => ({
        questionId,
        locale: normalizeLocale(locale),
        question: content.question,
        answerBlocks: content.answerBlocks,
      })
    );

    if (!translations.length) {
      console.warn(
        `[seed] Question in category ${q.category} has no translations, skipping translations insert`
      );
      continue;
    }

    const insertedLocales: string[] = [];
    for (const translation of translations) {
      const [inserted] = await db
        .insert(questionTranslations)
        .values(translation)
        .onConflictDoUpdate({
          target: [questionTranslations.questionId, questionTranslations.locale],
          set: {
            question: translation.question,
            answerBlocks: translation.answerBlocks,
          },
        })
        .returning({ locale: questionTranslations.locale });
      if (inserted?.locale) {
        insertedLocales.push(inserted.locale);
      }
    }

    const expectedLocales = translations.map(t => t.locale).sort();
    const uniqueInsertedLocales = Array.from(new Set(insertedLocales)).sort();

    if (uniqueInsertedLocales.join(',') !== expectedLocales.join(',')) {
      console.warn(
        `[seed] Translation insert mismatch for question ${questionId}: expected [${expectedLocales.join(
          ', '
        )}] but inserted [${uniqueInsertedLocales.join(', ')}]`
      );
    }
  }

  console.log('Questions seeded!');
}

seedQuestions().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
