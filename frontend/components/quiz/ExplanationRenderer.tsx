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
        className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm
  font-mono"
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
                className="bg-gray-900 text-gray-100 p-6 rounded-lg overflow-x-auto"
              >
                <code className="text-sm font-mono block leading-relaxed">
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
                className="list-decimal list-inside space-y-2 ml-4"
              >
                {renderChildren(block.children)}
              </ol>
            );

          case 'bulletList':
            return (
              <ul
                key={blockIndex}
                className="list-disc list-inside space-y-2 ml-4"
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
