import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminOrdersPageMock = vi.hoisted(() => vi.fn());
const adminPaginationMock = vi.hoisted(() => vi.fn());

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/db/queries/shop/admin-orders', () => ({
  getAdminOrdersPage: (args: unknown) => getAdminOrdersPageMock(args),
}));

vi.mock('@/components/admin/shop/AdminPagination', () => ({
  AdminPagination: (props: unknown) => {
    adminPaginationMock(props);
    return null;
  },
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => createElement('a', { href, ...props }, children),
}));

vi.mock('@/lib/security/csrf', () => ({
  CSRF_FORM_FIELD: 'csrf',
  issueCsrfToken: vi.fn(() => 'csrf-token'),
}));

import AdminOrdersPage from '@/app/[locale]/admin/shop/orders/page';

describe('admin orders page filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getAdminOrdersPageMock.mockResolvedValue({
      items: [],
      total: 0,
    });
  });

  it('reads filters from URL params and preserves them in pagination state', async () => {
    const html = renderToStaticMarkup(
      await AdminOrdersPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({
          page: '2',
          status: 'paid',
          dateFrom: '2026-03-01',
          dateTo: '2026-03-31',
        }),
      })
    );

    const args = getAdminOrdersPageMock.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      limit: 26,
      offset: 25,
      status: 'paid',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });
    expect(args.createdAtGte.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(args.createdAtLt.toISOString()).toBe('2026-04-01T00:00:00.000Z');

    expect(adminPaginationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: '/admin/shop/orders',
        page: 2,
        query: {
          status: 'paid',
          dateFrom: '2026-03-01',
          dateTo: '2026-03-31',
        },
      })
    );

    expect(html).toContain('name="status"');
    expect(html).toContain('option value="paid" selected=""');
    expect(html).toContain('name="dateFrom"');
    expect(html).toContain('value="2026-03-01"');
    expect(html).toContain('name="dateTo"');
    expect(html).toContain('value="2026-03-31"');
  });

  it('normalizes invalid page filters safely back to the unfiltered state', async () => {
    renderToStaticMarkup(
      await AdminOrdersPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({
          status: 'not-a-status',
          dateFrom: '2026-02-31',
          dateTo: '2026-03-31',
        }),
      })
    );

    expect(getAdminOrdersPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 26,
        offset: 0,
        status: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        createdAtGte: undefined,
        createdAtLt: undefined,
      })
    );

    expect(adminPaginationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          status: undefined,
          dateFrom: undefined,
          dateTo: undefined,
        },
      })
    );
  });
});
