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
  dirtyLocales: z.array(localeSchema),
  difficulty: z.enum(['beginner', 'medium', 'advanced']).optional(),
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
    answers: z.array(patchQuestionAnswerSchema)
    .length(4)
    .refine(
        answers => answers.filter(a => a.isCorrect).length === 1,
        { message: 'Exactly one correct answer required' }
    ),
}).refine(
  data => data.dirtyLocales.length > 0 || data.difficulty !== undefined,
  { message: 'At least one locale must be dirty or difficulty must be provided' }
);

export type PatchQuestionBody = z.infer<typeof patchQuestionSchema>;

// ── JSON upload schemas  ──

const jsonQuestionAnswerSchema = z.object({
  uk: z.string().min(1),
  en: z.string().min(1),
  pl: z.string().min(1),
  correct: z.boolean(),
});

export const jsonQuestionSchema = z.object({
  id: z.string().uuid().optional(),
  order: z.number().int().positive(),
  difficulty: z.enum(['beginner', 'medium', 'advanced']),
  uk: z.object({
    q: z.string().min(1),
    exp: z.string().min(1),
  }),
  en: z.object({
    q: z.string().min(1),
    exp: z.string().min(1),
  }),
  pl: z.object({
    q: z.string().min(1),
    exp: z.string().min(1),
  }),
  answers: z
    .array(jsonQuestionAnswerSchema)
    .length(4)
    .refine(
      answers => answers.filter(a => a.correct).length === 1,
      { message: 'Exactly one correct answer required' }
    ),
});

export const jsonQuestionsFileSchema = z.object({
  questions: z.array(jsonQuestionSchema).min(1, 'File must contain at least one question'),
});

export type JsonQuestion = z.infer<typeof jsonQuestionSchema>;

// ── Create quiz ──

const localeTranslationSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
});

export const createQuizSchema = z.object({
  categoryId: z.string().uuid(),
  slug: z.string().min(1).max(100).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must be lowercase alphanumeric with hyphens'
  ),
  timeLimitSeconds: z.number().int().positive().nullable().optional(),
  translations: z.object({
    en: localeTranslationSchema,
    uk: localeTranslationSchema,
    pl: localeTranslationSchema,
  }),
  questions: z.array(jsonQuestionSchema).min(1, 'At least one question required'),
});

export type CreateQuizBody = z.infer<typeof createQuizSchema>;

// ── Patch quiz (status / active toggle) ──

export const patchQuizSchema = z.object({
  status: z.enum(['draft', 'ready']).optional(),
  isActive: z.boolean().optional(),
  timeLimitSeconds: z.number().int().positive().nullable().optional(),
  translations: z.object({
    en: localeTranslationSchema,
    uk: localeTranslationSchema,
    pl: localeTranslationSchema,
  }).optional(),
}).refine(
  data => data.status !== undefined || data.isActive !== undefined || data.translations !== undefined || data.timeLimitSeconds !== undefined,
  { message: 'At least one field required' }
);

export type PatchQuizBody = z.infer<typeof patchQuizSchema>;

// ── Add questions to existing draft ──

export const addQuestionsSchema = z.object({
  questions: z.array(jsonQuestionSchema).min(1, 'At least one question required'),
});

export type AddQuestionsBody = z.infer<typeof addQuestionsSchema>;

// ── Create category ──

export const createCategorySchema = z.object({
  slug: z.string().min(1).max(50).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must be lowercase alphanumeric with hyphens'
  ),
  translations: z.object({
    en: z.object({ title: z.string().min(1) }),
    uk: z.object({ title: z.string().min(1) }),
    pl: z.object({ title: z.string().min(1) }),
  }),
});

export type CreateCategoryBody = z.infer<typeof createCategorySchema>;
