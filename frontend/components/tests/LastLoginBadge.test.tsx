/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LastLoginBadge } from '@/components/auth/LastLoginBadge';
import { ProviderButton } from '@/components/auth/ProviderButton';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('LastLoginBadge', () => {
  it('renders the "last used" label', () => {
    render(<LastLoginBadge />);
    expect(screen.getByText('lastUsed')).toBeDefined();
  });
});

describe('ProviderButton', () => {
  it('shows the badge when isLastUsed is true', () => {
    render(
      <ProviderButton
        provider="google"
        label="Continue with Google"
        icon={null}
        isLastUsed
      />
    );
    expect(screen.getByText('lastUsed')).toBeDefined();
  });

  it('hides the badge when isLastUsed is false', () => {
    render(
      <ProviderButton
        provider="github"
        label="Continue with GitHub"
        icon={null}
      />
    );
    expect(screen.queryByText('lastUsed')).toBeNull();
  });
});
