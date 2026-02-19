import { z } from 'zod';

export const localeSchema = z.enum(['en', 'uk', 'pl']);

export type AdminLocaleValue = z.infer<typeof localeSchema>;

const patchQuestionAnswerSchema = z.object({
  id: z.string().uuid(),
  isCorrect: z.boolean(),
  translations: z.object({
        en: z.object({ answerText: z.string().min(1, 'Answer text is required') }),
        uk: z.object({ answerText: z.string().min(1, 'Answer text is required') }),
        pl: z.object({ answerText: z.string().min(1, 'Answer text is required') }),
    }), 
});

export const patchQuestionSchema = z.object({
  dirtyLocales: z
    .array(localeSchema)
    .min(1, 'At least one locale must be dirty'),

    translations: z.object({
    en: z.object({
        questionText: z.string().min(1, 'Question text is required'),
        explanation: z.array(z.unknown()).min(1, 'Explanation is required'),
    }),
    uk: z.object({
        questionText: z.string().min(1, 'Question text is required'),
        explanation: z.array(z.unknown()).min(1, 'Explanation is required'),
    }),
    pl: z.object({
        questionText: z.string().min(1, 'Question text is required'),
        explanation: z.array(z.unknown()).min(1, 'Explanation is required'),
    }),
    }),
    // Current quizzes always have 4 answers. Update when supporting different quiz types in PR2.
    answers: z.array(patchQuestionAnswerSchema)
    .length(4)
    .refine(
        answers => answers.filter(a => a.isCorrect).length === 1,
        { message: 'Exactly one correct answer required' }
    ),
});

export type PatchQuestionBody = z.infer<typeof patchQuestionSchema>;
