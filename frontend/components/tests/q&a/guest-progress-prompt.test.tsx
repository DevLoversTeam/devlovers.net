// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { GuestProgressPrompt } from '@/components/q&a/GuestProgressPrompt';

describe('GuestProgressPrompt', () => {
  beforeEach(() => {
    routerPush.mockClear();
  });

  it('explains progress saving and navigates to login with returnTo', () => {
    const onClose = vi.fn();

    render(
      <GuestProgressPrompt
        isOpen
        returnTo="/en/q&a?category=git&filter=bookmarked"
        onClose={onClose}
      />
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('title')).toBeTruthy();
    expect(screen.getByText('description')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'login' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(routerPush).toHaveBeenCalledWith(
      '/login?returnTo=%2Fen%2Fq%26a%3Fcategory%3Dgit%26filter%3Dbookmarked'
    );
  });

  it('allows the guest to continue without saving', () => {
    const onClose = vi.fn();

    render(<GuestProgressPrompt isOpen returnTo="/en/q&a" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'continue' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
