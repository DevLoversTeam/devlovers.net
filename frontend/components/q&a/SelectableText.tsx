'use client';

import { ReactNode, useCallback, useRef } from 'react';

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

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed) {
        onSelectionClear();
        return;
      }

      const selectedText = selection.toString().trim();

      if (selectedText.length < minSelectionLength) {
        onSelectionClear();
        return;
      }

      if (containerRef.current) {
        const range = selection.getRangeAt(0);
        const selectionContainer = range.commonAncestorContainer;

        if (!containerRef.current.contains(selectionContainer)) {
          return;
        }
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      const position = {
        x: rect.left + rect.width / 2,
        y: rect.top,
      };

      onTextSelect(selectedText, position);
    }, 10);
  }, [onTextSelect, onSelectionClear, minSelectionLength]);

  return (
    <div ref={containerRef} onMouseUp={handleMouseUp} className="cursor-text">
      {children}
    </div>
  );
}
