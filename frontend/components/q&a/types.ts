'use client';

import { categoryData } from '@/data/category';

const SUPPORTED_LOCALES = ['uk', 'en', 'pl'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type CategorySlug = (typeof categoryData)[number]['slug'];

export type TextNode = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  boldItalic?: boolean;
};

export type CodeBlock = {
  type: 'code';
  language: string | null;
  content: string;
};

export type ListEntry = ListItemBlock | ListItemChild;

export type BulletListBlock = {
  type: 'bulletList';
  children: ListEntry[];
};

export type NumberedListBlock = {
  type: 'numberedList';
  children: ListEntry[];
};

export type ListItemChild = TextNode | CodeBlock | BulletListBlock | NumberedListBlock;

export type ListItemBlock = {
  type: 'listItem';
  children: ListItemChild[];
};

export type ParagraphBlock = {
  type: 'paragraph';
  children: TextNode[];
};

export type HeadingBlock = {
  type: 'heading';
  level: 3 | 4;
  children: TextNode[];
};

export type TableCell = TextNode[];

export type TableBlock = {
  type: 'table';
  header: TableCell[];
  rows: TableCell[][];
};

export type AnswerBlock =
  | ParagraphBlock
  | HeadingBlock
  | BulletListBlock
  | NumberedListBlock
  | CodeBlock
  | TableBlock;

export interface QuestionEntry {
  id?: number | string;
  question: string;
  category: string;
  answerBlocks: AnswerBlock[];
}

export interface QuestionApiItem {
  id: string;
  categoryId: string;
  sortOrder: number | null;
  difficulty: string | null;
  question: string;
  answerBlocks: AnswerBlock[];
  locale: Locale;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  locale: Locale;
}

export const qaConstants = {
  supportedLocales: SUPPORTED_LOCALES,
} as const;
