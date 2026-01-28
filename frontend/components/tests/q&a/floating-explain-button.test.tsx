// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import FloatingExplainButton from '@/components/q&a/FloatingExplainButton';

describe('FloatingExplainButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onClick when button clicked', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();

    render(
      <FloatingExplainButton
        position={{ x: 10, y: 20 }}
        onClick={onClick}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByLabelText('buttonText'));

    expect(onClick).toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses on outside click and scroll', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();

    render(
      <FloatingExplainButton
        position={{ x: 10, y: 20 }}
        onClick={onClick}
        onDismiss={onDismiss}
      />
    );

    vi.runAllTimers();

    fireEvent.mouseDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.scroll(window);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
