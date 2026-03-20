'use client';

import 'highlight.js/styles/github-dark.css';

import type { JSONContent } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';

const lowlight = createLowlight(common);

const EXTENSIONS = [
  StarterKit.configure({
    codeBlock: false,
  }),
  CodeBlockLowlight.configure({ lowlight }),
  Image.configure({ inline: false }),
  Link.configure({ openOnClick: false, autolink: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

interface BlogTiptapEditorProps {
  content: JSONContent | null;
  onChange: (json: JSONContent) => void;
  csrfToken: string;
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium transition-colors',
        disabled && 'pointer-events-none opacity-40',
        active
          ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="bg-border mx-1 w-px self-stretch" />;
}

export function BlogTiptapEditor({
  content,
  onChange,
  csrfToken,
}: BlogTiptapEditorProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  function handleLinkClick() {
    if (!editor) return;

    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    const url = window.prompt('URL:');
    if (!url) return;

    editor.chain().focus().setLink({ href: url }).run();
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('csrf_token', csrfToken);

      const res = await fetch('/api/admin/blog/images', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) return;

      editor.chain().focus().setImage({ src: data.url }).run();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (!editor) return null;

  return (
    <div className="border-border rounded-md border">
      <div className="border-border bg-background sticky top-0 z-10 flex flex-wrap gap-0.5 border-b px-2 py-1.5">
        {/* Text formatting */}
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          B
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <span className="line-through">S</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
        >
          {'</>'}
        </ToolbarButton>

        <ToolbarDivider />

        {/* Structure */}
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          title="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          title="Heading 3"
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          &ldquo;&rdquo;
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          &#8213;
        </ToolbarButton>

        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          &bull; List
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="Checklist"
        >
          ✓ List
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
        >
          Code
        </ToolbarButton>

        <ToolbarDivider />

        {/* Media */}
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={handleLinkClick}
          title={editor.isActive('link') ? 'Remove link' : 'Add link'}
        >
          Link
        </ToolbarButton>
        <ToolbarButton
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          title="Insert image"
        >
          {uploading ? 'Uploading...' : 'Image'}
        </ToolbarButton>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>

      <EditorContent
        editor={editor}
        className={cn(
          'text-foreground px-3 py-2 text-sm focus-within:outline-none',
          '[&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:pl-2',
          '[&_.ProseMirror_p]:mb-2',
          '[&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:mt-4 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold',
          '[&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h3]:mt-3 [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold',
          '[&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted-foreground',
          '[&_.ProseMirror_hr]:my-4 [&_.ProseMirror_hr]:border-border',
          '[&_.ProseMirror_ul]:mb-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5',
          '[&_.ProseMirror_ol]:mb-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5',
          '[&_.ProseMirror_li]:mb-1',
          '[&_.ProseMirror_pre]:mb-2 [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:bg-gray-900 [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:text-gray-100',
          '[&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:text-xs',
          '[&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0 [&_.ProseMirror_pre_code]:text-inherit',
          '[&_.ProseMirror_img]:my-2 [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:rounded-lg',
          '[&_.ProseMirror_a]:text-[var(--accent-primary)] [&_.ProseMirror_a]:underline',
          '[&_.ProseMirror_ul[data-type="taskList"]]:pl-0 [&_.ProseMirror_ul[data-type="taskList"]]:space-y-1 [&_.ProseMirror_ul[data-type="taskList"]]:list-none',
          '[&_.ProseMirror_li[data-type="taskItem"]]:flex [&_.ProseMirror_li[data-type="taskItem"]]:items-start [&_.ProseMirror_li[data-type="taskItem"]]:gap-2',
          '[&_.ProseMirror_li[data-type="taskItem"]]:list-none',

        )}
      />
    </div>
  );
}
