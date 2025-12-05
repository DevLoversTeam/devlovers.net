import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

type ListItemChild = TextNode | CodeBlock;

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

type BulletListBlock = {
  type: 'bulletList';
  children: ListItemBlock[];
};

type NumberedListBlock = {
  type: 'numberedList';
  children: ListItemBlock[];
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
  question: string;
  category: string;
  answerBlocks: AnswerBlock[];
};

function extractDetails(md: string): string[] {
  const regex = /<details>([\s\S]*?)<\/details>/g;
  const list: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(md)) !== null) {
    list.push(match[1].trim());
  }

  return list;
}

function extractQuestion(block: string): string {
  const match = block.match(/<summary>([\s\S]*?)<\/summary>/);
  if (!match) return '';

  return match[1].trim();
}

function extractCategory(block: string): string {
  const match = block.match(/^####\s+([A-Za-z]+)\s*$/m);
  return match ? match[1].trim().toLowerCase() : 'general';
}

function parseInlineFormatting(text: string): TextNode[] {
  const nodes: TextNode[] = [];

  const pattern = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain) {
        nodes.push({ text: plain });
      }
    }

    const matched = match[0];

    if (matched.startsWith('`') && matched.endsWith('`')) {
      nodes.push({ text: matched.slice(1, -1), code: true });
    } else if (matched.startsWith('***') && matched.endsWith('***')) {
      nodes.push({ text: matched.slice(3, -3), boldItalic: true });
    } else if (matched.startsWith('**') && matched.endsWith('**')) {
      nodes.push({ text: matched.slice(2, -2), bold: true });
    } else if (matched.startsWith('*') && matched.endsWith('*')) {
      nodes.push({ text: matched.slice(1, -1), italic: true });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) {
      nodes.push({ text: remaining });
    }
  }

  if (nodes.length === 0 && text) {
    nodes.push({ text });
  }

  return nodes;
}

function parseCodeBlock(
  lines: string[],
  startIndex: number
): { block: CodeBlock; nextIndex: number } | null {
  const firstLine = lines[startIndex];
  if (!firstLine.startsWith('```')) return null;

  const language = firstLine.slice(3).trim() || null;
  const codeLines: string[] = [];
  let i = startIndex + 1;

  while (i < lines.length && !lines[i].startsWith('```')) {
    codeLines.push(lines[i]);
    i++;
  }

  if (i < lines.length && lines[i].startsWith('```')) {
    i++;
  }

  return {
    block: {
      type: 'code',
      language,
      content: codeLines.join('\n'),
    },
    nextIndex: i,
  };
}

function parseTable(
  lines: string[],
  startIndex: number
): { block: TableBlock; nextIndex: number } | null {
  if (!lines[startIndex].trim().startsWith('|')) return null;

  const tableLines: string[] = [];
  let i = startIndex;

  while (i < lines.length && lines[i].trim().startsWith('|')) {
    tableLines.push(lines[i]);
    i++;
  }

  if (tableLines.length < 2) return null;

  const parseRow = (line: string): TableCell[] => {
    return line
      .trim()
      .slice(1, -1)
      .split('|')
      .map(cell => parseInlineFormatting(cell.trim()));
  };

  const header = parseRow(tableLines[0]);
  const rows = tableLines.slice(2).map(parseRow);

  return {
    block: {
      type: 'table',
      header,
      rows,
    },
    nextIndex: i,
  };
}

function parseBulletList(
  lines: string[],
  startIndex: number
): { block: BulletListBlock; nextIndex: number } | null {
  const items: ListItemBlock[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const match = trimmedLine.match(/^[-*]\s+(.+)$/);

    if (!match) break;

    let itemText = match[1];
    i++;

    while (i < lines.length) {
      const nextLine = lines[i];
      const nextTrimmed = nextLine.trim();

      if (!nextTrimmed) break;

      if (/^[-*]\s+/.test(nextTrimmed)) break;

      if (nextTrimmed.startsWith('```')) break;

      if (
        nextLine.startsWith('   ') ||
        nextLine.startsWith('\t') ||
        nextLine.startsWith('  ')
      ) {
        itemText += ' ' + nextTrimmed;
        i++;
      } else {
        break;
      }
    }

    const children: ListItemChild[] = parseInlineFormatting(itemText);

    let emptyLineCount = 0;
    let checkIndex = i;

    while (checkIndex < lines.length && !lines[checkIndex].trim()) {
      emptyLineCount++;
      checkIndex++;
    }

    if (
      emptyLineCount <= 1 &&
      checkIndex < lines.length &&
      lines[checkIndex].trim().startsWith('```')
    ) {
      i = checkIndex;
      const codeResult = parseCodeBlock(lines, i);
      if (codeResult) {
        children.push(codeResult.block);
        i = codeResult.nextIndex;
      }
    }

    items.push({
      type: 'listItem',
      children,
    });
  }

  if (items.length === 0) return null;

  return {
    block: {
      type: 'bulletList',
      children: items,
    },
    nextIndex: i,
  };
}

function parseNumberedList(
  lines: string[],
  startIndex: number
): { block: NumberedListBlock; nextIndex: number } | null {
  const items: ListItemBlock[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const match = trimmedLine.match(/^\d+\.\s+(.+)$/);

    if (!match) break;

    let itemText = match[1];
    i++;

    while (i < lines.length) {
      const nextLine = lines[i];
      const nextTrimmed = nextLine.trim();

      if (!nextTrimmed) break;

      if (/^\d+\.\s+/.test(nextTrimmed)) break;

      if (nextTrimmed.startsWith('```')) break;

      if (nextLine.startsWith('   ') || nextLine.startsWith('\t')) {
        itemText += ' ' + nextTrimmed;
        i++;
      } else {
        break;
      }
    }

    const children: ListItemChild[] = parseInlineFormatting(itemText);

    let emptyLineCount = 0;
    let checkIndex = i;

    while (checkIndex < lines.length && !lines[checkIndex].trim()) {
      emptyLineCount++;
      checkIndex++;
    }

    if (
      emptyLineCount <= 1 &&
      checkIndex < lines.length &&
      lines[checkIndex].trim().startsWith('```')
    ) {
      i = checkIndex;
      const codeResult = parseCodeBlock(lines, i);
      if (codeResult) {
        children.push(codeResult.block);
        i = codeResult.nextIndex;
      }
    }

    items.push({
      type: 'listItem',
      children,
    });
  }

  if (items.length === 0) return null;

  return {
    block: {
      type: 'numberedList',
      children: items,
    },
    nextIndex: i,
  };
}

function parseHeading(line: string): HeadingBlock | null {
  const match = line.match(/^(#{3,4})\s+(.+)$/);
  if (!match) return null;

  const level = match[1].length as 3 | 4;
  const text = match[2].trim();

  return {
    type: 'heading',
    level,
    children: parseInlineFormatting(text),
  };
}

function isCategoryMarker(line: string): boolean {
  const match = line.match(/^####\s+([A-Za-z]+)\s*$/);
  return match !== null;
}

function mergeConsecutiveLists(blocks: AnswerBlock[]): AnswerBlock[] {
  const result: AnswerBlock[] = [];

  for (const block of blocks) {
    const prev = result[result.length - 1];

    if (block.type === 'numberedList' && prev?.type === 'numberedList') {
      prev.children.push(...block.children);
      continue;
    }

    if (block.type === 'bulletList' && prev?.type === 'bulletList') {
      prev.children.push(...block.children);
      continue;
    }

    if (block.type === 'paragraph' && prev?.type === 'paragraph') {
      const lastChild = prev.children[prev.children.length - 1];
      const firstChild = block.children[0];

      if (
        lastChild &&
        firstChild &&
        !lastChild.bold &&
        !lastChild.italic &&
        !lastChild.code &&
        !lastChild.boldItalic &&
        !firstChild.bold &&
        !firstChild.italic &&
        !firstChild.code &&
        !firstChild.boldItalic
      ) {
        lastChild.text += ' ' + firstChild.text;
        prev.children.push(...block.children.slice(1));
      } else {
        if (firstChild) {
          firstChild.text = ' ' + firstChild.text;
        }
        prev.children.push(...block.children);
      }
      continue;
    }

    result.push(block);
  }

  return result;
}

function parseBlocks(content: string): AnswerBlock[] {
  const cleaned = content.replace(/<summary>[\s\S]*?<\/summary>/, '').trim();
  const lines = cleaned.split('\n');

  const blocks: AnswerBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      i++;
      continue;
    }

    if (isCategoryMarker(trimmedLine)) {
      i++;
      continue;
    }

    if (trimmedLine.startsWith('```')) {
      const result = parseCodeBlock(lines, i);
      if (result) {
        blocks.push(result.block);
        i = result.nextIndex;
        continue;
      }
    }

    if (trimmedLine.startsWith('|')) {
      const result = parseTable(lines, i);
      if (result) {
        blocks.push(result.block);
        i = result.nextIndex;
        continue;
      }
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const result = parseNumberedList(lines, i);
      if (result) {
        blocks.push(result.block);
        i = result.nextIndex;
        continue;
      }
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      const result = parseBulletList(lines, i);
      if (result) {
        blocks.push(result.block);
        i = result.nextIndex;
        continue;
      }
    }

    if (trimmedLine.startsWith('#')) {
      const heading = parseHeading(trimmedLine);
      if (heading) {
        blocks.push(heading);
        i++;
        continue;
      }
    }

    const children = parseInlineFormatting(trimmedLine);
    if (children.length > 0) {
      blocks.push({
        type: 'paragraph',
        children,
      });
    }

    i++;
  }

  return mergeConsecutiveLists(blocks);
}

function run() {
  const readmePath = path.join(__dirname, 'README.md');
  const outDir = path.join(__dirname, 'data');
  const outPath = path.join(outDir, 'questions.json');

  console.log('Reading:', readmePath);

  if (!fs.existsSync(readmePath)) {
    console.error('README.md not found');
    process.exit(1);
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const md = fs.readFileSync(readmePath, 'utf-8');
  const detailsBlocks = extractDetails(md);

  console.log(`Found ${detailsBlocks.length} questions`);

  const result: QuestionEntry[] = detailsBlocks.map((block, index) => {
    const question = extractQuestion(block);
    const category = extractCategory(block);
    const answerBlocks = parseBlocks(block);

    if (!question) {
      console.warn(`Warning: Question ${index + 1} has no summary`);
    }

    return {
      question,
      category,
      answerBlocks,
    };
  });

  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`Created: ${outPath}`);
  console.log(`Total questions: ${result.length}`);
}

run();
