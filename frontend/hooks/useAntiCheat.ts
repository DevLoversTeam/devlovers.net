'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export type AntiCheatViolation = {
  type: 'copy' | 'context-menu' | 'tab-switch' | 'paste';
  timestamp: Date;
};

export function useAntiCheat(isActive: boolean = true) {
  const t = useTranslations('quiz.antiCheat');
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  const [isTabActive, setIsTabActive] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const addViolation = (type: AntiCheatViolation['type']) => {
    if (!isActive) return;

    const violation: AntiCheatViolation = {
      type,
      timestamp: new Date(),
    };

    setViolations(prev => [...prev, violation]);
    setShowWarning(true);

    const messageKey: Record<AntiCheatViolation['type'], string> = {
      copy: 'copy',
      paste: 'paste',
      'context-menu': 'contextMenu',
      'tab-switch': 'tabSwitch',
    };

    toast.warning(t(messageKey[type]), {
      duration: 3000,
    });

    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    warningTimeoutRef.current = setTimeout(() => {
      setShowWarning(false);
    }, 3000);
  };

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
      addViolation('context-menu');
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        addViolation('tab-switch');
        setIsTabActive(false);
      } else {
        setIsTabActive(true);
      }
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [isActive]);

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
