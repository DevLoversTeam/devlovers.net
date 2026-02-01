'use client';

import {
  useState,
  useCallback,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { categoryTabStyles } from '@/data/categoryStyles';

import CodeBlock from '@/components/q&a/CodeBlock';
import SelectableText from '@/components/q&a/SelectableText';
import FloatingExplainButton from '@/components/q&a/FloatingExplainButton';
import AIWordHelper from '@/components/q&a/AIWordHelper';
import HighlightCachedTerms from '@/components/q&a/HighlightCachedTerms';
import { getCachedTerms, CACHE_KEY } from '@/lib/ai/explainCache';
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
      <table className="min-w-full border-collapse border border-gray-300 text-sm">
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
  const [modalOpen, setModalOpen] = useState(false);
  const [cachedTerms, setCachedTerms] = useState<Set<string>>(
    () => new Set(getCachedTerms())
  );

  const refreshCachedTerms = useCallback(() => {
    const terms = getCachedTerms();
    setCachedTerms(new Set(terms));
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY) {
        refreshCachedTerms();
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

  return (
    <>
      <Accordion type="single" collapsible className="w-full">
        {items.map((q, idx) => {
          const key = q.id ?? idx;
          const accent =
            categoryTabStyles[q.category as keyof typeof categoryTabStyles]
              ?.accent;
          return (
            <AccordionItem
              key={key}
              value={String(key)}
              className="qa-accordion-item mb-3 rounded-xl border border-black/5 bg-white/90 shadow-sm transition-colors last:mb-0 last:border-b dark:border-white/10 dark:bg-neutral-900/80"
              style={
                accent
                  ? ({ '--qa-accent': accent } as CSSProperties)
                  : undefined
              }
            >
              <AccordionTrigger className="px-4 hover:no-underline">
                {q.question}
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
