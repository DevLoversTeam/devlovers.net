'use client';

import { ReactNode, useEffect, useRef } from 'react';

interface SelectableTextProps {
  children: ReactNode;
  onTextSelect: (text: string, position: { x: number; y: number }) => void;
  onSelectionClear: () => void;
  minSelectionLength?: number;
}

export default function SelectableText({
  children,
  onTextSelect,
  onSelectionClear,
  minSelectionLength = 2,
}: SelectableTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTextSelectRef = useRef(onTextSelect);
  const onSelectionClearRef = useRef(onSelectionClear);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onTextSelectRef.current = onTextSelect;
    onSelectionClearRef.current = onSelectionClear;
  });

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed) {
        onSelectionClearRef.current();
        return;
      }

      const selectedText = selection.toString().trim();

      if (selectedText.length < minSelectionLength) {
        onSelectionClearRef.current();
        return;
      }

      // Check if selection is within our container
      if (containerRef.current) {
        const range = selection.getRangeAt(0);
        const selectionContainer = range.commonAncestorContainer;

        if (!containerRef.current.contains(selectionContainer)) {
          return;
        }

        const rect = range.getBoundingClientRect();

        const position = {
          x: rect.left + rect.width / 2,
          y: rect.top,
        };

        onTextSelectRef.current(selectedText, position);
      }
    };

    // Use selectionchange event - works on desktop (mouse/keyboard) and mobile (touch)
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [minSelectionLength]);

  return (
    <div ref={containerRef} className="cursor-text">
      {children}
    </div>
  );
}
