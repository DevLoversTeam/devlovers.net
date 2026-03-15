'use client';

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Bookmark } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import AIWordHelper from '@/components/q&a/AIWordHelper';
import CodeBlock from '@/components/q&a/CodeBlock';
import FloatingExplainButton from '@/components/q&a/FloatingExplainButton';
import HighlightCachedTerms from '@/components/q&a/HighlightCachedTerms';
import SelectableText from '@/components/q&a/SelectableText';
import type {
  AnswerBlock,
  BulletListBlock,
  CodeBlock as CodeBlockEntry,
  HeadingBlock,
  ListEntry,
  ListItemBlock,
  ListItemChild,
  NumberedListBlock,
  ParagraphBlock,
  QuestionEntry,
  TableBlock,
  TextNode,
} from '@/components/q&a/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { categoryTabStyles } from '@/data/categoryStyles';
import { CACHE_KEY, getCachedTerms } from '@/lib/ai/explainCache';

type QaItemStyle = CSSProperties & {
  '--qa-accent': string;
  '--qa-accent-soft': string;
};

const QA_VIEWED_STORAGE_KEY = 'devlovers_qa_viewed_questions';
const QA_BOOKMARK_STORAGE_KEY = 'devlovers_qa_bookmarked_questions';

function readStoredQuestionIds(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(
      parsed.filter((value): value is string => typeof value === 'string')
    );
  } catch {
    return new Set();
  }
}

function writeStoredQuestionIds(storageKey: string, ids: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify([...ids]));
}

function normalizeCachedTerm(term: string): string {
  return term.toLowerCase().trim();
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isListItemBlock(value: ListEntry): value is ListItemBlock {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'listItem'
  );
}

function renderListEntries(
  entries: ListEntry[],
  highlight?: HighlightContext
): ReactNode {
  return entries.map((item, i) => {
    if (!item || typeof item !== 'object') {
      return null;
    }

    if (isListItemBlock(item)) {
      return (
        <li key={i} className="leading-relaxed">
          {renderListItemChildren(item.children, highlight)}
        </li>
      );
    }

    return (
      <li key={i} className="leading-relaxed">
        {renderListItemChildren([item], highlight)}
      </li>
    );
  });
}

interface HighlightContext {
  cachedTerms: Set<string>;
  onTermClick: (term: string) => void;
}

function renderTextNode(
  node: TextNode,
  index: number,
  highlight?: HighlightContext
): ReactNode {
  const { text, bold, italic, code, boldItalic } = node;

  const renderText = (content: string) => {
    if (highlight && highlight.cachedTerms.size > 0) {
      return (
        <HighlightCachedTerms
          text={content}
          cachedTerms={highlight.cachedTerms}
          onTermClick={highlight.onTermClick}
        />
      );
    }
    return content;
  };

  if (code) {
    return (
      <code
        key={index}
        className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-red-600"
      >
        {text}
      </code>
    );
  }

  if (boldItalic) {
    return (
      <strong key={index} className="italic">
        {renderText(text)}
      </strong>
    );
  }

  if (bold) {
    return <strong key={index}>{renderText(text)}</strong>;
  }

  if (italic) {
    return <em key={index}>{renderText(text)}</em>;
  }

  return <span key={index}>{renderText(text)}</span>;
}

function renderTextNodes(
  nodes: TextNode[],
  highlight?: HighlightContext
): ReactNode {
  return nodes.map((node, i) => renderTextNode(node, i, highlight));
}

function renderCodeBlock(block: CodeBlockEntry, index: number): ReactNode {
  return (
    <CodeBlock key={index} code={block.content} language={block.language} />
  );
}

function renderBulletList(
  block: BulletListBlock,
  index: number,
  highlight?: HighlightContext
): ReactNode {
  return (
    <ul key={index} className="my-2 ml-6 list-outside list-disc space-y-1">
      {renderListEntries(block.children, highlight)}
    </ul>
  );
}

function renderNumberedList(
  block: NumberedListBlock,
  index: number,
  highlight?: HighlightContext
): ReactNode {
  return (
    <ol key={index} className="my-2 ml-6 list-outside list-decimal space-y-1">
      {renderListEntries(block.children, highlight)}
    </ol>
  );
}

function renderListItemChildren(
  children: ListItemChild[] | undefined,
  highlight?: HighlightContext
): ReactNode {
  if (!Array.isArray(children)) {
    return null;
  }

  return children.map((child, i) => {
    if (!child || typeof child !== 'object') {
      return null;
    }

    if ('type' in child && child.type === 'code') {
      return (
        <CodeBlock key={i} code={child.content} language={child.language} />
      );
    }

    if ('type' in child && child.type === 'bulletList') {
      if (!Array.isArray(child.children)) {
        return null;
      }
      return (
        <ul key={i} className="mt-1 ml-6 list-outside list-disc space-y-1">
          {renderListEntries(child.children, highlight)}
        </ul>
      );
    }

    if ('type' in child && child.type === 'numberedList') {
      if (!Array.isArray(child.children)) {
        return null;
      }
      return (
        <ol key={i} className="mt-1 ml-6 list-outside list-decimal space-y-1">
          {renderListEntries(child.children, highlight)}
        </ol>
      );
    }

    return renderTextNode(child as TextNode, i, highlight);
  });
}

function renderParagraph(
  block: ParagraphBlock,
  index: number,
  highlight?: HighlightContext
): ReactNode {
  return (
    <p key={index} className="leading-relaxed">
      {renderTextNodes(block.children, highlight)}
    </p>
  );
}

function renderHeading(
  block: HeadingBlock,
  index: number,
  highlight?: HighlightContext
): ReactNode {
  const Tag = block.level === 3 ? 'h3' : 'h4';
  const className =
    block.level === 3
      ? 'mb-2 mt-4 text-lg font-semibold'
      : 'mb-1 mt-3 text-base font-semibold';

  return (
    <Tag key={index} className={className}>
      {renderTextNodes(block.children, highlight)}
    </Tag>
  );
}

function renderTable(
  block: TableBlock,
  index: number,
  highlight?: HighlightContext
): ReactNode {
  return (
    <div key={index} className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-300 text-sm text-gray-900 dark:text-gray-900">
        <thead>
          <tr className="bg-gray-100">
            {block.header.map((cell, i) => (
              <th
                key={i}
                className="border border-gray-300 px-3 py-2 text-left font-semibold"
              >
                {renderTextNodes(cell, highlight)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {row.map((cell, j) => (
                <td key={j} className="border border-gray-300 px-3 py-2">
                  {renderTextNodes(cell, highlight)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderBlock(
  block: AnswerBlock,
  index: number,
  highlight?: HighlightContext
): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return renderParagraph(block, index, highlight);
    case 'heading':
      return renderHeading(block, index, highlight);
    case 'bulletList':
      return renderBulletList(block, index, highlight);
    case 'numberedList':
      return renderNumberedList(block, index, highlight);
    case 'code':
      return renderCodeBlock(block, index);
    case 'table':
      return renderTable(block, index, highlight);
    default:
      return null;
  }
}

export default function AccordionList({ items }: { items: QuestionEntry[] }) {
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [buttonPosition, setButtonPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [buttonPlacement, setButtonPlacement] = useState<'above' | 'below'>(
    'above'
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [cachedTerms, setCachedTerms] = useState<Set<string>>(
    () => new Set(getCachedTerms().map(normalizeCachedTerm))
  );
  const [viewedItems, setViewedItems] = useState<Set<string>>(new Set());
  const [bookmarkedItems, setBookmarkedItems] = useState<Set<string>>(new Set());

  const refreshCachedTerms = useCallback(() => {
    const terms = getCachedTerms().map(normalizeCachedTerm);
    setCachedTerms(new Set(terms));
  }, []);

  useEffect(() => {
    setViewedItems(readStoredQuestionIds(QA_VIEWED_STORAGE_KEY));
    setBookmarkedItems(readStoredQuestionIds(QA_BOOKMARK_STORAGE_KEY));
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY) {
        refreshCachedTerms();
      }
      if (e.key === QA_VIEWED_STORAGE_KEY) {
        setViewedItems(readStoredQuestionIds(QA_VIEWED_STORAGE_KEY));
      }
      if (e.key === QA_BOOKMARK_STORAGE_KEY) {
        setBookmarkedItems(readStoredQuestionIds(QA_BOOKMARK_STORAGE_KEY));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshCachedTerms]);

  const handleCachedTermClick = useCallback((term: string) => {
    setSelectedText(term);
    setModalOpen(true);
  }, []);

  const handleTextSelect = useCallback(
    (text: string, position: { x: number; y: number }) => {
      setSelectedText(text);
      setButtonPosition(position);
      setButtonPlacement(window.innerWidth < 640 ? 'below' : 'above');
    },
    []
  );

  const handleSelectionClear = useCallback(() => {
    if (!modalOpen) {
      setSelectedText(null);
      setButtonPosition(null);
    }
  }, [modalOpen]);

  const handleExplainClick = useCallback(() => {
    setModalOpen(true);
    setButtonPosition(null);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setSelectedText(null);
    refreshCachedTerms();
  }, [refreshCachedTerms]);

  const handleButtonDismiss = useCallback(() => {
    setSelectedText(null);
    setButtonPosition(null);
  }, []);

  const highlightContext: HighlightContext = {
    cachedTerms,
    onTermClick: handleCachedTermClick,
  };

  const clearSelection = useCallback(() => {
    if (typeof window === 'undefined') return;
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) {
      selection.removeAllRanges();
    }
  }, []);

  const markAsViewed = useCallback((questionId: string) => {
    setViewedItems(prev => {
      if (prev.has(questionId)) {
        return prev;
      }

      const next = new Set(prev);
      next.add(questionId);
      writeStoredQuestionIds(QA_VIEWED_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const toggleBookmark = useCallback((questionId: string) => {
    setBookmarkedItems(prev => {
      const next = new Set(prev);

      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }

      writeStoredQuestionIds(QA_BOOKMARK_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <>
      <Accordion type="single" collapsible className="w-full">
        {items.map((q, idx) => {
          const key = q.id ?? idx;
          const questionId = String(key);
          const accentColor =
            categoryTabStyles[q.category as keyof typeof categoryTabStyles]
              ?.accent ?? '#A1A1AA';
          const animationDelay = `${Math.min(idx, 10) * 60}ms`;
          const isViewed = viewedItems.has(questionId);
          const isBookmarked = bookmarkedItems.has(questionId);
          const itemStyle: QaItemStyle = {
            animationDelay,
            animationFillMode: 'both',
            '--qa-accent': accentColor,
            '--qa-accent-soft': hexToRgba(accentColor, 0.22),
          };
          return (
            <AccordionItem
              key={key}
              value={String(key)}
              className="qa-accordion-item animate-in fade-in slide-in-from-bottom-2 mb-3 rounded-xl border border-black/5 bg-white/90 shadow-sm transition-colors duration-500 last:mb-0 last:border-b motion-reduce:animate-none dark:border-white/10 dark:bg-neutral-900/80"
              style={itemStyle}
            >
              <AccordionTrigger
                className="px-4 hover:no-underline"
                onPointerDown={clearSelection}
                onClick={() => markAsViewed(questionId)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{q.question}</span>
                  <span className="flex h-6 w-[108px] shrink-0 items-center justify-end gap-1.5">
                    <Badge
                      variant="success"
                      className={
                        isViewed
                          ? 'h-6 gap-1 rounded-full px-2 py-0 text-[11px]'
                          : 'invisible h-6 gap-1 rounded-full px-2 py-0 text-[11px]'
                      }
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Viewed
                    </Badge>
                    <span
                      role={isViewed ? 'button' : undefined}
                      tabIndex={isViewed ? 0 : -1}
                      aria-label={
                        isViewed
                          ? isBookmarked
                            ? 'Remove bookmark'
                            : 'Add bookmark'
                          : undefined
                      }
                      aria-pressed={isViewed ? isBookmarked : undefined}
                      aria-hidden={isViewed ? undefined : true}
                      className={
                        isViewed
                          ? 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-red-500 transition-colors hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:outline-none'
                          : 'invisible inline-flex h-6 w-6 shrink-0 items-center justify-center'
                      }
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!isViewed) return;
                        toggleBookmark(questionId);
                      }}
                      onKeyDown={event => {
                        if (!isViewed) return;
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        event.stopPropagation();
                        toggleBookmark(questionId);
                      }}
                    >
                      <Bookmark
                        className="h-4 w-4"
                        fill={isBookmarked ? 'currentColor' : 'none'}
                      />
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <SelectableText
                  onTextSelect={handleTextSelect}
                  onSelectionClear={handleSelectionClear}
                >
                  <div className="space-y-3 pt-2">
                    {q.answerBlocks.map((block, i) =>
                      renderBlock(block, i, highlightContext)
                    )}
                  </div>
                </SelectableText>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {selectedText && buttonPosition && !modalOpen && (
        <FloatingExplainButton
          position={buttonPosition}
          onClick={handleExplainClick}
          onDismiss={handleButtonDismiss}
          placement={buttonPlacement}
        />
      )}

      <AIWordHelper
        term={selectedText || ''}
        isOpen={modalOpen}
        onClose={handleModalClose}
      />
    </>
  );
}
