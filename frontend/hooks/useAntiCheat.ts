'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export type AntiCheatViolation = {
  type: 'copy' | 'context-menu' | 'tab-switch' | 'paste';
  timestamp: Date;
};

const messageKey: Record<AntiCheatViolation['type'], string> = {
  copy: 'copy',
  paste: 'paste',
  'context-menu': 'contextMenu',
  'tab-switch': 'tabSwitch',
};

export function useAntiCheat(isActive: boolean = true) {
  const t = useTranslations('quiz.antiCheat');
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  const [isTabActive, setIsTabActive] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInteractionWasTouch = useRef(false);

  const addViolation = useCallback(
    (type: AntiCheatViolation['type']) => {
      if (!isActive) return;

      const violation: AntiCheatViolation = {
        type,
        timestamp: new Date(),
      };

      setViolations(prev => [...prev, violation]);
      setShowWarning(true);

      toast.warning(t(messageKey[type]), {
        duration: 3000,
      });

      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      warningTimeoutRef.current = setTimeout(() => {
        setShowWarning(false);
      }, 3000);
    },
    [isActive, t]
  );

  useEffect(() => {
    if (!isActive) return;

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      addViolation('copy');
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      addViolation('paste');
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      
      if (!lastInteractionWasTouch.current) {
        addViolation('context-menu');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        addViolation('tab-switch');
        setIsTabActive(false);
      } else {
        setIsTabActive(true);
      }
    };

    const handleTouchStart = () => {
      lastInteractionWasTouch.current = true;
    };

    const handleMouseDown = () => {
      lastInteractionWasTouch.current = false;
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('mousedown', handleMouseDown);


    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('mousedown', handleMouseDown);

      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [isActive, addViolation]);

  const resetViolations = () => {
    setViolations([]);
  };

  return {
    violations,
    violationsCount: violations.length,
    isTabActive,
    showWarning,
    resetViolations,
  };
}
