// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlogCategoryLinks } from '@/components/blog/BlogCategoryLinks';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'categories.tech': 'Технології',
      'categories.career': 'Кар\'єра',
      'categories.insights': 'Інсайти',
      'categories.news': 'Новини',
      'categories.growth': 'Кар\'єра',
      home: 'Головна',
    };
    return map[key] || key;
  },
}));

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/blog/category/tech',
}));

vi.mock('@/components/shared/AnimatedNavLink', () => ({
  AnimatedNavLink: ({ href, children, isActive }: any) => (
    <a href={href} data-active={isActive ? 'true' : 'false'}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/shared/HeaderButton', () => ({
  HeaderButton: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

describe('BlogCategoryLinks', () => {
  it('renders home and category links with slugs', () => {
    render(
      <BlogCategoryLinks
        categories={[
          { _id: '1', title: 'Tech' },
          { _id: '2', title: 'Growth' },
        ]}
      />
    );

    expect(screen.getByText('Головна')).toBeInTheDocument();
    expect(screen.getByText('Технології')).toBeInTheDocument();
    expect(screen.getByText("Кар'єра")).toBeInTheDocument();
    expect(screen.getByText('Технології').closest('a')).toHaveAttribute(
      'href',
      '/blog/category/tech'
    );
  });
});
