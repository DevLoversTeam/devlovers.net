import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ TYPES ============

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

// ============ EXTRACT FUNCTIONS ============

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

// ============ INLINE PARSING ============

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

// ============ LINE TYPE DETECTION ============

function isSpecialLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true; // пустая строка
  if (trimmed.startsWith('```')) return true; // код
  if (trimmed.startsWith('|')) return true; // таблица
  if (/^\d+\.\s+/.test(trimmed)) return true; // нумерованный список
  if (/^[-*]\s+/.test(trimmed)) return true; // маркированный список
  if (/^#{1,6}\s+/.test(trimmed)) return true; // заголовок
  return false;
}

function isCategoryMarker(line: string): boolean {
  const match = line.match(/^####\s+([A-Za-z]+)\s*$/);
  return match !== null;
}

// ============ BLOCK PARSERS ============

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
      if (/^\d+\.\s+/.test(nextTrimmed)) break;

      if (nextLine.startsWith('   ') || nextLine.startsWith('\t') || nextLine.startsWith('  ')) {
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
      if (/^[-*]\s+/.test(nextTrimmed)) break;

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

/**
 * Парсит абзац, объединяя последовательные строки текста
 */
function parseParagraph(
  lines: string[],
  startIndex: number
): { block: ParagraphBlock; nextIndex: number } | null {
  const trimmedFirst = lines[startIndex].trim();
  if (!trimmedFirst || isSpecialLine(lines[startIndex])) return null;

  const textLines: string[] = [trimmedFirst];
  let i = startIndex + 1;

  // Собираем последовательные строки обычного текста
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Пустая строка — конец абзаца
    if (!trimmed) break;

    // Специальная строка — конец абзаца
    if (isSpecialLine(line)) break;

    // Маркер категории — пропускаем
    if (isCategoryMarker(trimmed)) {
      i++;
      continue;
    }

    textLines.push(trimmed);
    i++;
  }

  const fullText = textLines.join(' ');
  const children = parseInlineFormatting(fullText);

  return {
    block: {
      type: 'paragraph',
      children,
    },
    nextIndex: i,
  };
}

// ============ MERGE LOGIC ============

function startsWithBold(item: ListItemBlock): boolean {
  if (item.children.length === 0) return false;
  const first = item.children[0];
  if ('bold' in first && first.bold) return true;
  if ('boldItalic' in first && first.boldItalic) return true;
  return false;
}

function getLastNumberedList(result: AnswerBlock[]): NumberedListBlock | null {
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].type === 'numberedList') {
      return result[i] as NumberedListBlock;
    }
    if (result[i].type === 'heading' || result[i].type === 'table') {
      return null;
    }
  }
  return null;
}

function extractBlocksAfterLastNumberedList(result: AnswerBlock[]): AnswerBlock[] {
  const extracted: AnswerBlock[] = [];

  while (result.length > 0) {
    const last = result[result.length - 1];
    if (last.type === 'numberedList') {
      break;
    }
    extracted.unshift(result.pop()!);
  }

  return extracted;
}

function mergeConsecutiveLists(blocks: AnswerBlock[]): AnswerBlock[] {
  const result: AnswerBlock[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (
      block.type === 'numberedList' &&
      block.children.length === 1 &&
      startsWithBold(block.children[0])
    ) {
      const prevList = getLastNumberedList(result);

      if (prevList) {
        const between = extractBlocksAfterLastNumberedList(result);
        const lastItem = prevList.children[prevList.children.length - 1];

        for (const b of between) {
          if (b.type === 'paragraph') {
            lastItem.children.push(...b.children);
          } else if (b.type === 'code') {
            lastItem.children.push(b);
          } else if (b.type === 'bulletList') {
            lastItem.children.push(b);
          }
        }

        prevList.children.push(...block.children);
        continue;
      }
    }

    if (block.type === 'bulletList') {
      const prev = result[result.length - 1];
      if (prev?.type === 'bulletList') {
        prev.children.push(...block.children);
        continue;
      }
    }

    result.push(block);
  }

  return result;
}

// ============ MAIN PARSER ============

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

    // Обычный текст — парсим как абзац с объединением строк
    const paragraphResult = parseParagraph(lines, i);
    if (paragraphResult) {
      blocks.push(paragraphResult.block);
      i = paragraphResult.nextIndex;
      continue;
    }

    i++;
  }

  return mergeConsecutiveLists(blocks);
}

// ============ RUN ============

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

// =============================================================
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // ============ TYPES ============

// type TextNode = {
//   text: string;
//   bold?: boolean;
//   italic?: boolean;
//   code?: boolean;
//   boldItalic?: boolean;
// };

// type CodeBlock = {
//   type: 'code';
//   language: string | null;
//   content: string;
// };

// type ListItemChild = TextNode | CodeBlock | BulletListBlock | NumberedListBlock;

// type ListItemBlock = {
//   type: 'listItem';
//   children: ListItemChild[];
// };

// type ParagraphBlock = {
//   type: 'paragraph';
//   children: TextNode[];
// };

// type HeadingBlock = {
//   type: 'heading';
//   level: 3 | 4;
//   children: TextNode[];
// };

// type BulletListBlock = {
//   type: 'bulletList';
//   children: ListItemBlock[];
// };

// type NumberedListBlock = {
//   type: 'numberedList';
//   children: ListItemBlock[];
// };

// type TableCell = TextNode[];

// type TableBlock = {
//   type: 'table';
//   header: TableCell[];
//   rows: TableCell[][];
// };

// type AnswerBlock =
//   | ParagraphBlock
//   | HeadingBlock
//   | BulletListBlock
//   | NumberedListBlock
//   | CodeBlock
//   | TableBlock;

// type QuestionEntry = {
//   question: string;
//   category: string;
//   answerBlocks: AnswerBlock[];
// };

// // ============ EXTRACT FUNCTIONS ============

// function extractDetails(md: string): string[] {
//   const regex = /<details>([\s\S]*?)<\/details>/g;
//   const list: string[] = [];
//   let match: RegExpExecArray | null;

//   while ((match = regex.exec(md)) !== null) {
//     list.push(match[1].trim());
//   }

//   return list;
// }

// function extractQuestion(block: string): string {
//   const match = block.match(/<summary>([\s\S]*?)<\/summary>/);
//   if (!match) return '';

//   return match[1].trim();
// }

// function extractCategory(block: string): string {
//   const match = block.match(/^####\s+([A-Za-z]+)\s*$/m);
//   return match ? match[1].trim().toLowerCase() : 'general';
// }

// // ============ INLINE PARSING ============

// function parseInlineFormatting(text: string): TextNode[] {
//   const nodes: TextNode[] = [];
//   const pattern = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g;

//   let lastIndex = 0;
//   let match: RegExpExecArray | null;

//   while ((match = pattern.exec(text)) !== null) {
//     if (match.index > lastIndex) {
//       const plain = text.slice(lastIndex, match.index);
//       if (plain) {
//         nodes.push({ text: plain });
//       }
//     }

//     const matched = match[0];

//     if (matched.startsWith('`') && matched.endsWith('`')) {
//       nodes.push({ text: matched.slice(1, -1), code: true });
//     } else if (matched.startsWith('***') && matched.endsWith('***')) {
//       nodes.push({ text: matched.slice(3, -3), boldItalic: true });
//     } else if (matched.startsWith('**') && matched.endsWith('**')) {
//       nodes.push({ text: matched.slice(2, -2), bold: true });
//     } else if (matched.startsWith('*') && matched.endsWith('*')) {
//       nodes.push({ text: matched.slice(1, -1), italic: true });
//     }

//     lastIndex = pattern.lastIndex;
//   }

//   if (lastIndex < text.length) {
//     const remaining = text.slice(lastIndex);
//     if (remaining) {
//       nodes.push({ text: remaining });
//     }
//   }

//   if (nodes.length === 0 && text) {
//     nodes.push({ text });
//   }

//   return nodes;
// }

// // ============ BLOCK PARSERS ============

// function parseCodeBlock(
//   lines: string[],
//   startIndex: number
// ): { block: CodeBlock; nextIndex: number } | null {
//   const firstLine = lines[startIndex];
//   if (!firstLine.startsWith('```')) return null;

//   const language = firstLine.slice(3).trim() || null;
//   const codeLines: string[] = [];
//   let i = startIndex + 1;

//   while (i < lines.length && !lines[i].startsWith('```')) {
//     codeLines.push(lines[i]);
//     i++;
//   }

//   if (i < lines.length && lines[i].startsWith('```')) {
//     i++;
//   }

//   return {
//     block: {
//       type: 'code',
//       language,
//       content: codeLines.join('\n'),
//     },
//     nextIndex: i,
//   };
// }

// function parseTable(
//   lines: string[],
//   startIndex: number
// ): { block: TableBlock; nextIndex: number } | null {
//   if (!lines[startIndex].trim().startsWith('|')) return null;

//   const tableLines: string[] = [];
//   let i = startIndex;

//   while (i < lines.length && lines[i].trim().startsWith('|')) {
//     tableLines.push(lines[i]);
//     i++;
//   }

//   if (tableLines.length < 2) return null;

//   const parseRow = (line: string): TableCell[] => {
//     return line
//       .trim()
//       .slice(1, -1)
//       .split('|')
//       .map(cell => parseInlineFormatting(cell.trim()));
//   };

//   const header = parseRow(tableLines[0]);
//   const rows = tableLines.slice(2).map(parseRow);

//   return {
//     block: {
//       type: 'table',
//       header,
//       rows,
//     },
//     nextIndex: i,
//   };
// }

// function parseBulletList(
//   lines: string[],
//   startIndex: number
// ): { block: BulletListBlock; nextIndex: number } | null {
//   const items: ListItemBlock[] = [];
//   let i = startIndex;

//   while (i < lines.length) {
//     const line = lines[i];
//     const trimmedLine = line.trim();
//     const match = trimmedLine.match(/^[-*]\s+(.+)$/);

//     if (!match) break;

//     let itemText = match[1];
//     i++;

//     while (i < lines.length) {
//       const nextLine = lines[i];
//       const nextTrimmed = nextLine.trim();

//       if (!nextTrimmed) break;
//       if (/^[-*]\s+/.test(nextTrimmed)) break;
//       if (nextTrimmed.startsWith('```')) break;
//       if (/^\d+\.\s+/.test(nextTrimmed)) break;

//       if (
//         nextLine.startsWith('   ') ||
//         nextLine.startsWith('\t') ||
//         nextLine.startsWith('  ')
//       ) {
//         itemText += ' ' + nextTrimmed;
//         i++;
//       } else {
//         break;
//       }
//     }

//     const children: ListItemChild[] = parseInlineFormatting(itemText);

//     let emptyLineCount = 0;
//     let checkIndex = i;

//     while (checkIndex < lines.length && !lines[checkIndex].trim()) {
//       emptyLineCount++;
//       checkIndex++;
//     }

//     if (
//       emptyLineCount <= 1 &&
//       checkIndex < lines.length &&
//       lines[checkIndex].trim().startsWith('```')
//     ) {
//       i = checkIndex;
//       const codeResult = parseCodeBlock(lines, i);
//       if (codeResult) {
//         children.push(codeResult.block);
//         i = codeResult.nextIndex;
//       }
//     }

//     items.push({
//       type: 'listItem',
//       children,
//     });
//   }

//   if (items.length === 0) return null;

//   return {
//     block: {
//       type: 'bulletList',
//       children: items,
//     },
//     nextIndex: i,
//   };
// }

// function parseNumberedList(
//   lines: string[],
//   startIndex: number
// ): { block: NumberedListBlock; nextIndex: number } | null {
//   const items: ListItemBlock[] = [];
//   let i = startIndex;

//   while (i < lines.length) {
//     const line = lines[i];
//     const trimmedLine = line.trim();
//     const match = trimmedLine.match(/^\d+\.\s+(.+)$/);

//     if (!match) break;

//     let itemText = match[1];
//     i++;

//     while (i < lines.length) {
//       const nextLine = lines[i];
//       const nextTrimmed = nextLine.trim();

//       if (!nextTrimmed) break;
//       if (/^\d+\.\s+/.test(nextTrimmed)) break;
//       if (nextTrimmed.startsWith('```')) break;
//       if (/^[-*]\s+/.test(nextTrimmed)) break;

//       if (nextLine.startsWith('   ') || nextLine.startsWith('\t')) {
//         itemText += ' ' + nextTrimmed;
//         i++;
//       } else {
//         break;
//       }
//     }

//     const children: ListItemChild[] = parseInlineFormatting(itemText);

//     let emptyLineCount = 0;
//     let checkIndex = i;

//     while (checkIndex < lines.length && !lines[checkIndex].trim()) {
//       emptyLineCount++;
//       checkIndex++;
//     }

//     if (
//       emptyLineCount <= 1 &&
//       checkIndex < lines.length &&
//       lines[checkIndex].trim().startsWith('```')
//     ) {
//       i = checkIndex;
//       const codeResult = parseCodeBlock(lines, i);
//       if (codeResult) {
//         children.push(codeResult.block);
//         i = codeResult.nextIndex;
//       }
//     }

//     items.push({
//       type: 'listItem',
//       children,
//     });
//   }

//   if (items.length === 0) return null;

//   return {
//     block: {
//       type: 'numberedList',
//       children: items,
//     },
//     nextIndex: i,
//   };
// }

// function parseHeading(line: string): HeadingBlock | null {
//   const match = line.match(/^(#{3,4})\s+(.+)$/);
//   if (!match) return null;

//   const level = match[1].length as 3 | 4;
//   const text = match[2].trim();

//   return {
//     type: 'heading',
//     level,
//     children: parseInlineFormatting(text),
//   };
// }

// function isCategoryMarker(line: string): boolean {
//   const match = line.match(/^####\s+([A-Za-z]+)\s*$/);
//   return match !== null;
// }

// // ============ MERGE LOGIC ============

// /**
//  * Проверяет, начинается ли listItem с bold текста
//  */
// function startsWithBold(item: ListItemBlock): boolean {
//   if (item.children.length === 0) return false;
//   const first = item.children[0];
//   if ('bold' in first && first.bold) return true;
//   if ('boldItalic' in first && first.boldItalic) return true;
//   return false;
// }

// /**
//  * Получает последний numberedList из result, если он есть
//  */
// function getLastNumberedList(result: AnswerBlock[]): NumberedListBlock | null {
//   for (let i = result.length - 1; i >= 0; i--) {
//     if (result[i].type === 'numberedList') {
//       return result[i] as NumberedListBlock;
//     }
//     // Прерываем если встретили heading или table — это явный разделитель
//     if (result[i].type === 'heading' || result[i].type === 'table') {
//       return null;
//     }
//   }
//   return null;
// }

// /**
//  * Удаляет блоки после последнего numberedList и возвращает их
//  */
// function extractBlocksAfterLastNumberedList(
//   result: AnswerBlock[]
// ): AnswerBlock[] {
//   const extracted: AnswerBlock[] = [];

//   while (result.length > 0) {
//     const last = result[result.length - 1];
//     if (last.type === 'numberedList') {
//       break;
//     }
//     extracted.unshift(result.pop()!);
//   }

//   return extracted;
// }

// /**
//  * Объединяет разрозненные numberedList в один.
//  *
//  * Паттерн в MD:
//  *   1. **Заголовок:**
//  *   Текст параграфа
//  *   1. **Следующий:**
//  *
//  * Результат: один numberedList, где параграф — child первого listItem
//  */
// function mergeConsecutiveLists(blocks: AnswerBlock[]): AnswerBlock[] {
//   const result: AnswerBlock[] = [];

//   for (let i = 0; i < blocks.length; i++) {
//     const block = blocks[i];

//     // numberedList с одним пунктом, начинающимся с bold — кандидат на объединение
//     if (
//       block.type === 'numberedList' &&
//       block.children.length === 1 &&
//       startsWithBold(block.children[0])
//     ) {
//       const prevList = getLastNumberedList(result);

//       if (prevList) {
//         // Есть предыдущий numberedList — объединяем
//         // Сначала забираем блоки между ними и вкладываем в последний listItem предыдущего списка
//         const between = extractBlocksAfterLastNumberedList(result);
//         const lastItem = prevList.children[prevList.children.length - 1];

//         for (const b of between) {
//           if (b.type === 'paragraph') {
//             lastItem.children.push(...b.children);
//           } else if (b.type === 'code') {
//             lastItem.children.push(b);
//           } else if (b.type === 'bulletList') {
//             lastItem.children.push(b);
//           }
//           // heading и table не вкладываем — они разделители
//         }

//         // Добавляем новый пункт в предыдущий список
//         prevList.children.push(...block.children);
//         continue;
//       }
//     }

//     // Объединяем последовательные bulletList
//     if (block.type === 'bulletList') {
//       const prev = result[result.length - 1];
//       if (prev?.type === 'bulletList') {
//         prev.children.push(...block.children);
//         continue;
//       }
//     }

//     result.push(block);
//   }

//   return result;
// }

// // ============ MAIN PARSER ============

// function parseBlocks(content: string): AnswerBlock[] {
//   const cleaned = content.replace(/<summary>[\s\S]*?<\/summary>/, '').trim();
//   const lines = cleaned.split('\n');

//   const blocks: AnswerBlock[] = [];
//   let i = 0;

//   while (i < lines.length) {
//     const line = lines[i];
//     const trimmedLine = line.trim();

//     if (!trimmedLine) {
//       i++;
//       continue;
//     }

//     if (isCategoryMarker(trimmedLine)) {
//       i++;
//       continue;
//     }

//     if (trimmedLine.startsWith('```')) {
//       const result = parseCodeBlock(lines, i);
//       if (result) {
//         blocks.push(result.block);
//         i = result.nextIndex;
//         continue;
//       }
//     }

//     if (trimmedLine.startsWith('|')) {
//       const result = parseTable(lines, i);
//       if (result) {
//         blocks.push(result.block);
//         i = result.nextIndex;
//         continue;
//       }
//     }

//     if (/^\d+\.\s+/.test(trimmedLine)) {
//       const result = parseNumberedList(lines, i);
//       if (result) {
//         blocks.push(result.block);
//         i = result.nextIndex;
//         continue;
//       }
//     }

//     if (/^[-*]\s+/.test(trimmedLine)) {
//       const result = parseBulletList(lines, i);
//       if (result) {
//         blocks.push(result.block);
//         i = result.nextIndex;
//         continue;
//       }
//     }

//     if (trimmedLine.startsWith('#')) {
//       const heading = parseHeading(trimmedLine);
//       if (heading) {
//         blocks.push(heading);
//         i++;
//         continue;
//       }
//     }

//     const children = parseInlineFormatting(trimmedLine);
//     if (children.length > 0) {
//       blocks.push({
//         type: 'paragraph',
//         children,
//       });
//     }

//     i++;
//   }

//   return mergeConsecutiveLists(blocks);
// }

// // ============ RUN ============

// function run() {
//   const readmePath = path.join(__dirname, 'README.md');
//   const outDir = path.join(__dirname, 'data');
//   const outPath = path.join(outDir, 'questions.json');

//   console.log('Reading:', readmePath);

//   if (!fs.existsSync(readmePath)) {
//     console.error('README.md not found');
//     process.exit(1);
//   }

//   if (!fs.existsSync(outDir)) {
//     fs.mkdirSync(outDir, { recursive: true });
//   }

//   const md = fs.readFileSync(readmePath, 'utf-8');
//   const detailsBlocks = extractDetails(md);

//   console.log(`Found ${detailsBlocks.length} questions`);

//   const result: QuestionEntry[] = detailsBlocks.map((block, index) => {
//     const question = extractQuestion(block);
//     const category = extractCategory(block);
//     const answerBlocks = parseBlocks(block);

//     if (!question) {
//       console.warn(`Warning: Question ${index + 1} has no summary`);
//     }

//     return {
//       question,
//       category,
//       answerBlocks,
//     };
//   });

//   fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');

//   console.log(`Created: ${outPath}`);
//   console.log(`Total questions: ${result.length}`);
// }

// run();
