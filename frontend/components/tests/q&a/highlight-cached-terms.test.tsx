// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import HighlightCachedTerms from '@/components/q&a/HighlightCachedTerms';

describe('HighlightCachedTerms', () => {
  it('highlights cached term and calls onTermClick', () => {
    const onTermClick = vi.fn();
    const cachedTerms = new Set(['html']);

    render(
      <HighlightCachedTerms
        text="HTML and CSS"
        cachedTerms={cachedTerms}
        onTermClick={onTermClick}
      />
    );

    fireEvent.click(screen.getByText('HTML'));

    expect(onTermClick).toHaveBeenCalledWith('html');
  });

  it('renders plain text when no cached terms', () => {
    render(
      <HighlightCachedTerms text="No highlights" cachedTerms={new Set()} />
    );

    expect(screen.getByText('No highlights')).toBeTruthy();
  });
});
