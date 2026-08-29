// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join('/')}` : key,
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} {...props} />
  ),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  type DashboardQuestionProgressItem,
  QuestionProgressSection,
} from '@/components/dashboard/QuestionProgressSection';

const progress: DashboardQuestionProgressItem[] = [
  {
    categoryId: 'category-git',
    categorySlug: 'git',
    categoryTitle: 'Git Fundamentals',
    totalQuestions: 100,
    viewedCount: 25,
    bookmarkedCount: 3,
  },
  {
    categoryId: 'category-css',
    categorySlug: 'css',
    categoryTitle: 'CSS Fundamentals',
    totalQuestions: 40,
    viewedCount: 40,
    bookmarkedCount: 1,
  },
];

describe('QuestionProgressSection', () => {
  it('renders topic progress and direct question links', () => {
    render(<QuestionProgressSection progress={progress} />);

    expect(screen.getByText('title')).toBeTruthy();
    expect(screen.getByText('Git Fundamentals')).toBeTruthy();
    expect(screen.getByText('25/100')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('inProgress')).toBeTruthy();
    expect(screen.getByText('complete')).toBeTruthy();

    expect(
      screen.getByRole('link', { name: 'continueTopic:Git Fundamentals' })
    ).toHaveAttribute('href', '/q&a?category=git');
    expect(
      screen.getByRole('link', { name: 'openSaved:Git Fundamentals/3' })
    ).toHaveAttribute('href', '/q&a?category=git&filter=bookmarked');

    expect(
      screen.getByRole('progressbar', {
        name: 'topicProgress:Git Fundamentals',
      })
    ).toHaveAttribute('aria-valuenow', '25');
  });

  it('renders a Q&A call to action when progress is empty', () => {
    render(<QuestionProgressSection progress={[]} />);

    expect(screen.getByText('emptyDescription')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'browseQuestions' })
    ).toHaveAttribute('href', '/q&a');
  });
});
