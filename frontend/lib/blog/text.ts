// Extracts plain text from Tiptap JSON nodes
export function extractPlainText(node: any): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(extractPlainText).join(' ');
  }
  return '';
}
