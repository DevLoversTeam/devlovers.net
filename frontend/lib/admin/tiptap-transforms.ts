import type { JSONContent } from '@tiptap/core';

import type {
  AnswerBlock,
  BulletListBlock,
  CodeBlock,
  ListEntry,
  NumberedListBlock,
  ParagraphBlock,
  TextNode,
} from '@/components/q&a/types';

// ── AnswerBlock[] → TipTap JSONContent ──

function textNodeToTipTap(node: TextNode): JSONContent {
  const marks: { type: string; attrs?: Record<string, any> }[] = [];
  if (node.bold || node.boldItalic) marks.push({ type: 'bold' });
  if (node.italic || node.boldItalic) marks.push({ type: 'italic' });
  if (node.code) marks.push({ type: 'code' });

  return {
    type: 'text',
    text: node.text,
    ...(marks.length > 0 && { marks }),
  };
}

function listEntryToTipTap(entry: ListEntry): JSONContent {
  if ('type' in entry && entry.type === 'listItem') {
    const children = entry.children.map(child => {
      if ('type' in child) {
        if (child.type === 'bulletList') return listBlockToTipTap(child, 'bulletList');
        if (child.type === 'numberedList') return listBlockToTipTap(child, 'orderedList');
        if (child.type === 'code') return codeBlockToTipTap(child);
      }
      return textNodeToTipTap(child as TextNode);
    });

    const textNodes = children.filter(c => c.type === 'text');
    const blockNodes = children.filter(c => c.type !== 'text');

    const content: JSONContent[] = [];
    if (textNodes.length > 0) {
      content.push({ type: 'paragraph', content: textNodes });
    }
    content.push(...blockNodes);

    return { type: 'listItem', content };
  }

  // Plain TextNode as list item
  return {
    type: 'listItem',
    content: [{ type: 'paragraph', content: [textNodeToTipTap(entry as TextNode)] }],
  };
}

function listBlockToTipTap(
  block: BulletListBlock | NumberedListBlock,
  tipTapType: 'bulletList' | 'orderedList'
): JSONContent {
  return {
    type: tipTapType,
    content: block.children.map(listEntryToTipTap),
  };
}

function codeBlockToTipTap(block: CodeBlock): JSONContent {
  return {
    type: 'codeBlock',
    attrs: { language: block.language ?? null },
    content: block.content ? [{ type: 'text', text: block.content }] : [],
  };
}

export function answerBlocksToTipTap(blocks: AnswerBlock[]): JSONContent {
  if (!blocks || blocks.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  const content: JSONContent[] = blocks.map(block => {
    switch (block.type) {
      case 'paragraph':
        return {
          type: 'paragraph',
          content: block.children.map(textNodeToTipTap),
        };

      case 'code':
        return codeBlockToTipTap(block);

      case 'bulletList':
        return listBlockToTipTap(block, 'bulletList');

      case 'numberedList':
        return listBlockToTipTap(block, 'orderedList');

      case 'heading':
        return {
          type: 'heading',
          attrs: { level: block.level },
          content: block.children.map(textNodeToTipTap),
        };

      case 'table':
        // Tables not supported in editor yet — store as-is won't happen
        return { type: 'paragraph' };

      default:
        return { type: 'paragraph' };
    }
  });

  return { type: 'doc', content };
}

// ── TipTap JSONContent → AnswerBlock[] ──

function tipTapToTextNode(node: JSONContent): TextNode {
  const result: TextNode = { text: node.text ?? '' };
  if (node.marks) {
    for (const mark of node.marks) {
      if (mark.type === 'bold') result.bold = true;
      if (mark.type === 'italic') result.italic = true;
      if (mark.type === 'code') result.code = true;
    }
  }
  return result;
}

function tipTapToListEntries(items: JSONContent[]): ListEntry[] {
  return items.map(item => {
    if (item.type !== 'listItem' || !item.content) {
      return { text: '' } as TextNode;
    }

    const children: (TextNode | CodeBlock | BulletListBlock | NumberedListBlock)[] = [];

    for (const child of item.content) {
      if (child.type === 'paragraph' && child.content) {
        children.push(...child.content.map(tipTapToTextNode));
      } else if (child.type === 'codeBlock') {
        children.push({
          type: 'code',
          language: child.attrs?.language ?? null,
          content: child.content?.map(c => c.text ?? '').join('') ?? '',
        });
      } else if (child.type === 'bulletList' && child.content) {
        children.push({
          type: 'bulletList',
          children: tipTapToListEntries(child.content),
        });
      } else if (child.type === 'orderedList' && child.content) {
        children.push({
          type: 'numberedList',
          children: tipTapToListEntries(child.content),
        });
      }
    }

    return { type: 'listItem' as const, children };
  });
}

export function tipTapToAnswerBlocks(doc: JSONContent): AnswerBlock[] {
  if (!doc.content) return [];

  return doc.content.reduce<AnswerBlock[]>((blocks, node) => {
    switch (node.type) {
      case 'paragraph': {
        const children = (node.content ?? []).map(tipTapToTextNode);
        if (children.length > 0) {
          blocks.push({ type: 'paragraph', children } as ParagraphBlock);
        }
        break;
      }

      case 'codeBlock':
        blocks.push({
          type: 'code',
          language: node.attrs?.language ?? null,
          content: node.content?.map(c => c.text ?? '').join('') ?? '',
        } as CodeBlock);
        break;

      case 'bulletList':
        if (node.content) {
          blocks.push({
            type: 'bulletList',
            children: tipTapToListEntries(node.content),
          } as BulletListBlock);
        }
        break;

      case 'orderedList':
        if (node.content) {
          blocks.push({
            type: 'numberedList',
            children: tipTapToListEntries(node.content),
          } as NumberedListBlock);
        }
        break;

      case 'heading': {
        const children = (node.content ?? []).map(tipTapToTextNode);
        blocks.push({ type: 'heading', level: node.attrs?.level ?? 3, children });
        break;
      }

      default:
        break;
    }

    return blocks;
  }, []);
}
