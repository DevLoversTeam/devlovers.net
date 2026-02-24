'use client';

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';

import type { AnswerBlock } from '@/components/q&a/types';
import {
  answerBlocksToTipTap,
  tipTapToAnswerBlocks,
} from '@/lib/admin/tiptap-transforms';
import { cn } from '@/lib/utils';

const lowlight = createLowlight(common);

const EXTENSIONS = [
  StarterKit.configure({
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    strike: false,
  }),
  CodeBlockLowlight.configure({ lowlight }),
];

interface ExplanationEditorProps {
  blocks: AnswerBlock[];
  onChange: (blocks: AnswerBlock[]) => void;
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

export function ExplanationEditor({
  blocks,
  onChange,
}: ExplanationEditorProps) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: answerBlocksToTipTap(blocks),
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(tipTapToAnswerBlocks(editor.getJSON()));
    },
  });

  if (!editor) return null;

  return (
    <div className="border-border rounded-md border">
      <div className="border-border flex flex-wrap gap-0.5 border-b px-2 py-1.5">
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
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
        >
          {'</>'}
        </ToolbarButton>

        <span className="bg-border mx-1 w-px self-stretch" />

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
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
        >
          Code Block
        </ToolbarButton>
      </div>

      <EditorContent
        editor={editor}
        className={cn(
          'text-foreground px-3 py-2 text-sm focus-within:outline-none',
          '[&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:outline-none',
          '[&_.ProseMirror_p]:mb-2',
          '[&_.ProseMirror_ul]:mb-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5',
          '[&_.ProseMirror_ol]:mb-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5',
          '[&_.ProseMirror_li]:mb-1',
          '[&_.ProseMirror_pre]:mb-2 [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:bg-gray-900 [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:text-gray-100',
          '[&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:text-xs',
          '[&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0 [&_.ProseMirror_pre_code]:text-inherit'
        )}
      />
    </div>
  );
}
