'use client';

interface TextNode {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

interface ListItemNode {
  type: 'listItem';
  children: (TextNode | ListItemNode)[];
}

interface AnswerBlock {
  type: 'paragraph' | 'numberedList' | 'bulletList' | 'code';
  language?: string;
  children: (TextNode | ListItemNode)[];
}

interface ExplanationRendererProps {
  blocks: AnswerBlock[];
}

const renderText = (node: TextNode, index: number) => {
  let text = <span key={index}>{node.text}</span>;

  if (node.code) {
    text = (
      <code
        key={index}
        className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm dark:bg-gray-800"
      >
        {node.text}
      </code>
    );
  }

  if (node.bold) {
    text = <strong key={index}>{text}</strong>;
  }

  if (node.italic) {
    text = <em key={index}>{text}</em>;
  }

  return text;
};

const renderChildren = (children: (TextNode | ListItemNode)[]) => {
  return children.map((child, index) => {
    if ('type' in child && child.type === 'listItem') {
      return <li key={index}>{renderChildren(child.children)}</li>;
    }
    return renderText(child as TextNode, index);
  });
};

export default function ExplanationRenderer({
  blocks,
}: ExplanationRendererProps) {
  return (
    <div className="space-y-4 text-gray-700 dark:text-gray-300">
      {blocks.map((block, blockIndex) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <p key={blockIndex} className="leading-relaxed">
                {block.children.map((child, i) =>
                  renderText(child as TextNode, i)
                )}
              </p>
            );

          case 'code':
            return (
              <pre
                key={blockIndex}
                className="overflow-x-auto rounded-lg bg-gray-900 p-6 text-gray-100"
              >
                <code className="block font-mono text-sm leading-relaxed">
                  {block.children
                    .map(child => (child as TextNode).text)
                    .join('')}
                </code>
              </pre>
            );

          case 'numberedList':
            return (
              <ol
                key={blockIndex}
                className="ml-4 list-inside list-decimal space-y-2"
              >
                {renderChildren(block.children)}
              </ol>
            );

          case 'bulletList':
            return (
              <ul
                key={blockIndex}
                className="ml-4 list-inside list-disc space-y-2"
              >
                {renderChildren(block.children)}
              </ul>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
