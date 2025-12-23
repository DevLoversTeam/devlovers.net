export type Locale = 'uk' | 'en' | 'pl';

export interface AnswerBlock {
  type: 'paragraph' | 'numberedList' | 'bulletList' | 'code';
  language?: string;
  children: AnswerBlockChild[];
}

export interface AnswerBlockChild {
  type?: 'listItem';
  text?: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  children?: AnswerBlockChild[];
}

export interface QuizQuestionSeed {
  id: string;
  displayOrder: number;
  difficulty: 'beginner' | 'medium' | 'advanced';
  content: Record<
    Locale,
    {
      questionText: string;
      explanation: AnswerBlock[];
    }
  >;
  answers: {
    id: string;
    displayOrder: number;
    isCorrect: boolean;
    translations: Record<Locale, string>;
  }[];
}

export const p = (children: AnswerBlockChild[]): AnswerBlock => ({
  type: 'paragraph',
  children,
});

export const t = (
  text: string,
  opts?: { bold?: boolean; italic?: boolean; code?: boolean }
): AnswerBlockChild => ({
  text,
  ...opts,
});

export const code = (text: string, language = 'javascript'): AnswerBlock => ({
  type: 'code',
  language,
  children: [{ text }],
});

export const ul = (items: string[]): AnswerBlock => ({
  type: 'bulletList',
  children: items.map(item => ({
    type: 'listItem' as const,
    children: [{ text: item }],
  })),
});

export const ol = (items: string[]): AnswerBlock => ({
  type: 'numberedList',
  children: items.map(item => ({
    type: 'listItem' as const,
    children: [{ text: item }],
  })),
});
