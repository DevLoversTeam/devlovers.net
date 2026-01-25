// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('prism-react-renderer', () => ({
  Highlight: ({
    code,
    children,
  }: {
    code: string;
    children: (args: {
      className: string;
      style: Record<string, unknown>;
      tokens: Array<Array<{ content: string; types: string[] }>>;
      getLineProps: (args: { line: { content: string }[] }) => Record<string, unknown>;
      getTokenProps: (args: { token: { content: string } }) => Record<string, unknown>;
    }) => unknown;
  }) =>
    children({
      className: 'code',
      style: {},
      tokens: [[{ content: code, types: [] }]],
      getLineProps: () => ({}),
      getTokenProps: ({ token }: { token: { content: string } }) => ({
        children: token.content,
      }),
    }),
  themes: { github: {}, nightOwl: {} },
}));

import CodeBlock from '@/components/q&a/CodeBlock';

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders language label and copies to clipboard', async () => {
    render(<CodeBlock code="const a = 1;" language="js" />);

    expect(screen.getByText('js')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Copy code'));
      await Promise.resolve();
    });

    const writeText = navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>;
    expect(writeText).toHaveBeenCalledWith('const a = 1;');

    expect(screen.getByText('Copied')).toBeTruthy();

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByText('Copy')).toBeTruthy();
  });
});
