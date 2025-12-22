'use client';

import { ReactNode } from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

import CodeBlock from '@/components/q&a/CodeBlock';

type TextNode = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  boldItalic?: boolean;
};

type CodeBlock = {
  type: 'code';
  language: string | null;
  content: string;
};

type ListEntry = ListItemBlock | ListItemChild;

type BulletListBlock = {
  type: 'bulletList';
  children: ListEntry[];
};

type NumberedListBlock = {
  type: 'numberedList';
  children: ListEntry[];
};

type ListItemChild = TextNode | CodeBlock | BulletListBlock | NumberedListBlock;

type ListItemBlock = {
  type: 'listItem';
  children: ListItemChild[];
};

type ParagraphBlock = {
  type: 'paragraph';
  children: TextNode[];
};

type HeadingBlock = {
  type: 'heading';
  level: 3 | 4;
  children: TextNode[];
};

type TableCell = TextNode[];

type TableBlock = {
  type: 'table';
  header: TableCell[];
  rows: TableCell[][];
};

type AnswerBlock =
  | ParagraphBlock
  | HeadingBlock
  | BulletListBlock
  | NumberedListBlock
  | CodeBlock
  | TableBlock;

type QuestionEntry = {
  id?: number | string;
  question: string;
  category: string;
  answerBlocks: AnswerBlock[];
};

function isListItemBlock(value: ListEntry): value is ListItemBlock {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'listItem'
  );
}

function renderListEntries(entries: ListEntry[]): ReactNode {
  return entries.map((item, i) => {
    if (!item || typeof item !== 'object') {
      return null;
    }

    if (isListItemBlock(item)) {
      return (
        <li key={i} className="leading-relaxed">
          {renderListItemChildren(item.children)}
        </li>
      );
    }

    return (
      <li key={i} className="leading-relaxed">
        {renderListItemChildren([item])}
      </li>
    );
  });
}

function renderTextNode(node: TextNode, index: number): ReactNode {
  const { text, bold, italic, code, boldItalic } = node;

  if (code) {
    return (
      <code
        key={index}
        className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono"
      >
        {text}
      </code>
    );
  }

  if (boldItalic) {
    return (
      <strong key={index} className="italic">
        {text}
      </strong>
    );
  }

  if (bold) {
    return <strong key={index}>{text}</strong>;
  }

  if (italic) {
    return <em key={index}>{text}</em>;
  }

  return <span key={index}>{text}</span>;
}

function renderTextNodes(nodes: TextNode[]): ReactNode {
  return nodes.map((node, i) => renderTextNode(node, i));
}

function renderCodeBlock(block: CodeBlock, index: number): ReactNode {
  return (
    <CodeBlock key={index} code={block.content} language={block.language} />
  );
}

function renderBulletList(block: BulletListBlock, index: number): ReactNode {
  return (
    <ul key={index} className="list-disc list-outside ml-6 space-y-1 my-2">
      {renderListEntries(block.children)}
    </ul>
  );
}

function renderNumberedList(
  block: NumberedListBlock,
  index: number
): ReactNode {
  return (
    <ol key={index} className="list-decimal list-outside ml-6 space-y-1 my-2">
      {renderListEntries(block.children)}
    </ol>
  );
}

function renderListItemChildren(
  children: ListItemChild[] | undefined
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
        <ul key={i} className="list-disc list-outside ml-6 space-y-1 mt-1">
          {renderListEntries(child.children)}
        </ul>
      );
    }

    if ('type' in child && child.type === 'numberedList') {
      if (!Array.isArray(child.children)) {
        return null;
      }
      return (
        <ol key={i} className="list-decimal list-outside ml-6 space-y-1 mt-1">
          {renderListEntries(child.children)}
        </ol>
      );
    }

    return renderTextNode(child as TextNode, i);
  });
}

function renderParagraph(block: ParagraphBlock, index: number): ReactNode {
  return (
    <p key={index} className="leading-relaxed">
      {renderTextNodes(block.children)}
    </p>
  );
}

function renderHeading(block: HeadingBlock, index: number): ReactNode {
  const Tag = block.level === 3 ? 'h3' : 'h4';
  const className =
    block.level === 3
      ? 'text-lg font-semibold mt-4 mb-2'
      : 'text-base font-semibold mt-3 mb-1';

  return (
    <Tag key={index} className={className}>
      {renderTextNodes(block.children)}
    </Tag>
  );
}

function renderTable(block: TableBlock, index: number): ReactNode {
  return (
    <div key={index} className="overflow-x-auto my-2">
      <table className="min-w-full border-collapse border border-gray-300 text-sm">
        <thead>
          <tr className="bg-gray-100">
            {block.header.map((cell, i) => (
              <th
                key={i}
                className="border border-gray-300 px-3 py-2 text-left font-semibold"
              >
                {renderTextNodes(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {row.map((cell, j) => (
                <td key={j} className="border border-gray-300 px-3 py-2">
                  {renderTextNodes(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderBlock(block: AnswerBlock, index: number): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return renderParagraph(block, index);
    case 'heading':
      return renderHeading(block, index);
    case 'bulletList':
      return renderBulletList(block, index);
    case 'numberedList':
      return renderNumberedList(block, index);
    case 'code':
      return renderCodeBlock(block, index);
    case 'table':
      return renderTable(block, index);
    default:
      return null;
  }
}

export default function AccordionList({ items }: { items: QuestionEntry[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map((q, idx) => {
        const key = q.id ?? idx;
        return (
          <AccordionItem key={key} value={String(key)}>
            <AccordionTrigger>{q.question}</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pt-2">
                {q.answerBlocks.map((block, i) => renderBlock(block, i))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
