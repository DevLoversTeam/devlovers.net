// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCachedTermsMock = vi.fn();
const storage = new Map<string, string>();

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  },
  configurable: true,
});

vi.mock('@/lib/ai/explainCache', () => ({
  getCachedTerms: () => getCachedTermsMock(),
}));

vi.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="accordion">{children}</div>
  ),
  AccordionItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AccordionTrigger: ({
    children,
    leading,
    trailing,
    onClick,
  }: {
    children: React.ReactNode;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <div>
      {leading}
      <button type="button" onClick={onClick}>
        {children}
      </button>
      {trailing}
    </div>
  ),
  AccordionContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/q&a/CodeBlock', () => ({
  __esModule: true,
  default: ({ code, content }: { code?: string; content?: string }) => (
    <pre data-testid="code-block">{content ?? code}</pre>
  ),
}));

vi.mock('@/components/q&a/SelectableText', () => ({
  __esModule: true,
  default: ({
    children,
    onTextSelect,
    onSelectionClear,
  }: {
    children: React.ReactNode;
    onTextSelect: (text: string, position: { x: number; y: number }) => void;
    onSelectionClear: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onTextSelect('CSS', { x: 10, y: 20 })}
      >
        select-text
      </button>
      <button type="button" onClick={onSelectionClear}>
        clear-selection
      </button>
      {children}
    </div>
  ),
}));

vi.mock('@/components/q&a/FloatingExplainButton', () => ({
  __esModule: true,
  default: ({
    onClick,
    onDismiss,
  }: {
    onClick: () => void;
    onDismiss: () => void;
  }) => (
    <div>
      <button type="button" onClick={onClick}>
        explain
      </button>
      <button type="button" onClick={onDismiss}>
        dismiss
      </button>
    </div>
  ),
}));

vi.mock('@/components/q&a/AIWordHelper', () => ({
  __esModule: true,
  default: ({ term, isOpen }: { term: string; isOpen: boolean }) => (
    <div data-testid="ai-helper">{isOpen ? `open:${term}` : 'closed'}</div>
  ),
}));

vi.mock('@/components/q&a/HighlightCachedTerms', () => ({
  __esModule: true,
  default: ({
    text,
    cachedTerms,
    onTermClick,
  }: {
    text: string;
    cachedTerms: Set<string>;
    onTermClick: (term: string) => void;
  }) => {
    const normalized = text.toLowerCase().trim();
    if (!cachedTerms.has(normalized)) {
      return <span>{text}</span>;
    }

    return (
      <button type="button" onClick={() => onTermClick(text)}>
        {text}
      </button>
    );
  },
}));

import AccordionList from '@/components/q&a/AccordionList';
import type { QuestionEntry } from '@/components/q&a/types';

describe('AccordionList', () => {
  beforeEach(() => {
    getCachedTermsMock.mockReturnValue([]);
    localStorage.clear();
  });

  it('renders questions and answer blocks', () => {
    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is CSS?',
        category: 'css',
        answerBlocks: [
          {
            type: 'paragraph',
            children: [{ text: 'CSS styles pages.' }],
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    expect(screen.getByText('What is CSS?')).toBeTruthy();
    expect(screen.getByText('CSS styles pages.')).toBeTruthy();
  });

  it('marks an accordion as viewed after opening it', () => {
    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is CSS?',
        category: 'css',
        answerBlocks: [
          {
            type: 'paragraph',
            children: [{ text: 'CSS styles pages.' }],
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    expect(
      screen.queryByRole('button', { name: 'Add bookmark' })
    ).toBeNull();

    fireEvent.click(screen.getByText('What is CSS?'));

    expect(
      screen.getByRole('button', { name: 'Add bookmark' })
    ).toBeTruthy();
    expect(
      JSON.parse(
        localStorage.getItem('devlovers_qa_viewed_questions') ?? '[]'
      )
    ).toContain('q1');
  });

  it('toggles bookmark state for viewed accordion', () => {
    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is CSS?',
        category: 'css',
        answerBlocks: [
          {
            type: 'paragraph',
            children: [{ text: 'CSS styles pages.' }],
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    fireEvent.click(screen.getByText('What is CSS?'));
    fireEvent.click(screen.getByRole('button', { name: 'Add bookmark' }));

    expect(
      screen.getByRole('button', { name: 'Remove bookmark' })
    ).toBeTruthy();
    expect(
      JSON.parse(
        localStorage.getItem('devlovers_qa_bookmarked_questions') ?? '[]'
      )
    ).toContain('q1');
  });

  it('opens AI helper from selection', () => {
    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is CSS?',
        category: 'css',
        answerBlocks: [
          {
            type: 'paragraph',
            children: [{ text: 'CSS styles pages.' }],
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    fireEvent.click(screen.getByText('select-text'));
    fireEvent.click(screen.getByText('explain'));

    expect(screen.getByTestId('ai-helper').textContent).toBe('open:CSS');
  });

  it('opens AI helper when cached term clicked', () => {
    getCachedTermsMock.mockReturnValue(['HTML']);

    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is HTML?',
        category: 'html',
        answerBlocks: [
          {
            type: 'paragraph',
            children: [{ text: 'HTML' }],
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    fireEvent.click(screen.getByText('HTML'));

    expect(screen.getByTestId('ai-helper').textContent).toBe('open:HTML');
  });

  it('clears selection when requested', () => {
    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is CSS?',
        category: 'css',
        answerBlocks: [
          {
            type: 'paragraph',
            children: [{ text: 'CSS styles pages.' }],
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    fireEvent.click(screen.getByText('select-text'));
    expect(screen.getByText('explain')).toBeTruthy();

    fireEvent.click(screen.getByText('clear-selection'));
    expect(screen.queryByText('explain')).toBeNull();
  });

  it('keeps selection when modal is open', () => {
    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is CSS?',
        category: 'css',
        answerBlocks: [
          {
            type: 'paragraph',
            children: [{ text: 'CSS styles pages.' }],
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    fireEvent.click(screen.getByText('select-text'));
    fireEvent.click(screen.getByText('explain'));
    expect(screen.getByTestId('ai-helper').textContent).toBe('open:CSS');

    fireEvent.click(screen.getByText('clear-selection'));
    expect(screen.getByTestId('ai-helper').textContent).toBe('open:CSS');
  });

  it('renders mixed answer blocks', () => {
    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is HTML?',
        category: 'html',
        answerBlocks: [
          {
            type: 'paragraph',
            children: [
              { text: 'Plain' },
              { text: 'Bold', bold: true },
              { text: 'Italic', italic: true },
              { text: 'Both', boldItalic: true },
              { text: 'Inline', code: true },
            ],
          },
          {
            type: 'heading',
            level: 3,
            children: [{ text: 'Heading' }],
          },
          {
            type: 'bulletList',
            children: [
              {
                type: 'listItem',
                children: [
                  { text: 'Item 1' },
                  { type: 'code', language: 'js', content: 'const a = 1;' },
                  {
                    type: 'bulletList',
                    children: [{ text: 'Nested' }],
                  },
                ],
              },
              { text: 'Loose item' },
            ],
          },
          {
            type: 'numberedList',
            children: [
              {
                type: 'listItem',
                children: [{ text: 'Numbered' }],
              },
            ],
          },
          {
            type: 'table',
            header: [[{ text: 'Col' }]],
            rows: [[[{ text: 'Cell' }]]],
          },
          {
            type: 'code',
            language: 'html',
            content: '<div></div>',
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.getByText('Italic').tagName).toBe('EM');
    expect(screen.getByText('Both').tagName).toBe('STRONG');
    expect(screen.getByText('Inline').tagName).toBe('CODE');
    expect(screen.getByText('Heading').tagName).toBe('SPAN');
    expect(screen.getByText('Nested')).toBeTruthy();
    expect(screen.getByText('Col')).toBeTruthy();
    expect(screen.getByText('Cell')).toBeTruthy();
    expect(screen.getAllByTestId('code-block').length).toBeGreaterThan(0);
  });

  it('dismisses explain button', () => {
    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is CSS?',
        category: 'css',
        answerBlocks: [
          {
            type: 'paragraph',
            children: [{ text: 'CSS styles pages.' }],
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    fireEvent.click(screen.getByText('select-text'));
    expect(screen.getByText('dismiss')).toBeTruthy();

    fireEvent.click(screen.getByText('dismiss'));
    expect(screen.queryByText('dismiss')).toBeNull();
  });

  it('renders code blocks in answers', () => {
    const items: QuestionEntry[] = [
      {
        id: 'q1',
        question: 'What is HTML?',
        category: 'html',
        answerBlocks: [
          {
            type: 'code',
            language: 'html',
            content: '<div></div>',
          },
        ],
      },
    ];

    render(<AccordionList items={items} />);

    expect(screen.getByTestId('code-block').textContent).toBe('<div></div>');
  });
});
