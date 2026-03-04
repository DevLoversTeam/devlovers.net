import Image from 'next/image';

// Tiptap JSON node shape
interface TiptapNode {
  type?: string;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
}

interface BlogPostRendererProps {
  content: TiptapNode;
}

function renderMarks(
  text: string,
  marks: { type: string; attrs?: Record<string, any> }[],
  key: string
): React.ReactNode {
  let node: React.ReactNode = text;

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        node = <strong>{node}</strong>;
        break;
      case 'italic':
        node = <em>{node}</em>;
        break;
      case 'code':
        node = (
          <code className="rounded bg-gray-100 px-1 py-0.5 text-[0.9em] text-gray-900 dark:bg-neutral-900 dark:text-gray-100">
            {node}
          </code>
        );
        break;
      case 'link':
        node = (
          <a
            href={mark.attrs?.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-primary)] underline underline-offset-4"
          >
            {node}
          </a>
        );
        break;
      case 'strike':
        node = <s>{node}</s>;
        break;
      case 'underline':
        node = <u>{node}</u>;
        break;
    }
  }

  return <span key={key}>{node}</span>;
}

function renderNode(node: TiptapNode, index: number): React.ReactNode {
  // Text node (leaf)
  if (node.type === 'text') {
    if (node.marks?.length) {
      return renderMarks(node.text ?? '', node.marks, `text-${index}`);
    }
    return <span key={`text-${index}`}>{node.text}</span>;
  }

  const children = node.content?.map((child, i) => renderNode(child, i));
  const key = `node-${index}`;

  switch (node.type) {
    case 'doc':
      return <>{children}</>;

    case 'paragraph':
      return (
        <p
          key={key}
          className="mb-4 text-base leading-relaxed whitespace-pre-line text-gray-700 dark:text-gray-300"
        >
          {children}
        </p>
      );

    case 'heading': {
      const level = node.attrs?.level ?? 2;
      const headingClasses: Record<number, string> = {
        1: 'mt-10 mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100',
        2: 'mt-8 mb-3 text-2xl font-semibold text-gray-900 dark:text-gray-100',
        3: 'mt-7 mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100',
        4: 'mt-6 mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100',
        5: 'mt-6 mb-2 text-base font-semibold text-gray-900 dark:text-gray-100',
        6: 'mt-6 mb-2 text-sm font-semibold tracking-wide text-gray-700 uppercase dark:text-gray-300',
      };
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Tag key={key} className={headingClasses[level] ?? headingClasses[2]}>
          {children}
        </Tag>
      );
    }

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="my-6 border-l-4 border-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)] pl-4 text-gray-600 dark:text-gray-400"
        >
          {children}
        </blockquote>
      );

    case 'bulletList':
      return (
        <ul key={key} className="my-4 list-disc pl-6">
          {children}
        </ul>
      );

    case 'orderedList':
      return (
        <ol key={key} className="my-4 list-decimal pl-6">
          {children}
        </ol>
      );

    case 'listItem':
      return <li key={key}>{children}</li>;

    case 'codeBlock':
      return (
        <pre
          key={key}
          className="my-6 overflow-x-auto rounded-lg bg-gray-900 p-6 text-gray-100"
        >
          <code className="block font-mono text-sm leading-relaxed">
            {node.content?.map(c => c.text).join('') ?? ''}
          </code>
        </pre>
      );

    case 'image':
      return (
        <Image
          key={key}
          src={node.attrs?.src ?? ''}
          alt={node.attrs?.alt ?? 'Post image'}
          width={1200}
          height={800}
          sizes="100vw"
          className="my-6 h-auto w-full rounded-xl border border-gray-200"
        />
      );

    case 'hardBreak':
      return <br key={key} />;

    case 'horizontalRule':
      return (
        <hr
          key={key}
          className="my-8 border-gray-200 dark:border-gray-700"
        />
      );

    default:
      return children ?? null;
  }
}

export default function BlogPostRenderer({ content }: BlogPostRendererProps) {
  if (!content?.content) return null;

  return (
    <div className="space-y-0">
      {content.content.map((node, i) => renderNode(node, i))}
    </div>
  );
}
