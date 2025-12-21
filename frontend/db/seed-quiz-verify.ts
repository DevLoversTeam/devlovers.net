import { db } from './index';
import {
  quizzes,
  quizTranslations,
  quizQuestions,
  quizQuestionContent,
  quizAnswers,
  quizAnswerTranslations,
} from '@/db/schema/quiz';
import { eq, sql } from 'drizzle-orm';

async function verifyQuizSeed() {
  console.log('🔍 Verifying quiz seed data...\n');

  console.log('📊 Record counts:');

  const quizCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(quizzes);
  console.log(`   quizzes: ${quizCount[0].count}`);

  const quizTransCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(quizTranslations);
  console.log(`   quiz_translations: ${quizTransCount[0].count}`);

  const questionCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(quizQuestions);
  console.log(`   quiz_questions: ${questionCount[0].count}`);

  const questionContentCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(quizQuestionContent);
  console.log(`   quiz_question_content: ${questionContentCount[0].count}`);

  const answerCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(quizAnswers);
  console.log(`   quiz_answers: ${answerCount[0].count}`);

  const answerTransCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(quizAnswerTranslations);
  console.log(`   quiz_answer_translations: ${answerTransCount[0].count}`);

  console.log('\n📝 Quiz data:');
  const quizData = await db.query.quizzes.findFirst({
    where: eq(quizzes.slug, 'react-fundamentals'),
    with: {
      translations: true,
    },
  });

  if (quizData) {
    console.log(`   ID: ${quizData.id}`);
    console.log(`   Slug: ${quizData.slug}`);
    console.log(`   Questions: ${quizData.questionsCount}`);
    console.log(`   Time limit: ${quizData.timeLimitSeconds}s`);
    console.log('   Translations:');
    quizData.translations?.forEach(t => {
      console.log(`     [${t.locale}] ${t.title}`);
    });
  }

  console.log('\n❓ Sample question (first one):');
  const sampleQuestion = await db.query.quizQuestions.findFirst({
    where: eq(quizQuestions.quizId, 'quiz-react-fundamentals'),
    orderBy: (q, { asc }) => asc(q.displayOrder),
    with: {
      content: true,
      answers: {
        with: {
          translations: true,
        },
      },
    },
  });

  if (sampleQuestion) {
    console.log(`   ID: ${sampleQuestion.id}`);
    console.log(`   Difficulty: ${sampleQuestion.difficulty}`);
    console.log('   Question text per locale:');
    sampleQuestion.content?.forEach(c => {
      console.log(`     [${c.locale}] ${c.questionText}`);
    });

    console.log('   Answers:');
    sampleQuestion.answers?.forEach(a => {
      const correct = a.isCorrect ? '✅' : '❌';
      console.log(
        `     ${correct} ${a.translations?.[0]?.answerText?.slice(0, 50)}...`
      );
    });

    console.log('\n📖 Explanation JSON structure (UK):');
    const ukContent = sampleQuestion.content?.find(c => c.locale === 'uk');
    if (ukContent?.explanation) {
      console.log(JSON.stringify(ukContent.explanation, null, 2));
    }
  }

  console.log('\n🌍 Locale coverage check:');
  const locales = ['uk', 'en', 'pl'];

  for (const locale of locales) {
    const contentCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(quizQuestionContent)
      .where(eq(quizQuestionContent.locale, locale));

    const answerTransCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(quizAnswerTranslations)
      .where(eq(quizAnswerTranslations.locale, locale));

    console.log(
      `   [${locale}] questions: ${contentCount[0].count}, answers: ${answerTransCount[0].count}`
    );
  }

  console.log('\n✅ Verification complete!');
}

async function getQuizForLocale(slug: string, locale: string) {
  console.log(`\n🎯 Fetching quiz "${slug}" for locale "${locale}":\n`);

  const quiz = await db.query.quizzes.findFirst({
    where: eq(quizzes.slug, slug),
    with: {
      translations: {
        where: eq(quizTranslations.locale, locale),
      },
      questions: {
        orderBy: (q, { asc }) => asc(q.displayOrder),
        with: {
          content: {
            where: eq(quizQuestionContent.locale, locale),
          },
          answers: {
            orderBy: (a, { asc }) => asc(a.displayOrder),
            with: {
              translations: {
                where: eq(quizAnswerTranslations.locale, locale),
              },
            },
          },
        },
      },
    },
  });

  if (!quiz) {
    console.log('Quiz not found!');
    return;
  }

  const result = {
    id: quiz.id,
    slug: quiz.slug,
    title: quiz.translations?.[0]?.title,
    description: quiz.translations?.[0]?.description,
    questionsCount: quiz.questionsCount,
    timeLimitSeconds: quiz.timeLimitSeconds,
    questions: quiz.questions?.map((q, idx) => ({
      id: q.id,
      number: `${idx + 1}.`,
      text: q.content?.[0]?.questionText,
      difficulty: q.difficulty,
      explanation: q.content?.[0]?.explanation,
      answers: q.answers?.map(a => ({
        id: a.id,
        text: a.translations?.[0]?.answerText,
        isCorrect: a.isCorrect,
      })),
    })),
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}

async function main() {
  await verifyQuizSeed();
  await getQuizForLocale('react-fundamentals', 'uk');
  await getQuizForLocale('react-fundamentals', 'en');
  await getQuizForLocale('react-fundamentals', 'pl');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
