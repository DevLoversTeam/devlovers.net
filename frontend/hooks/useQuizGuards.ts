import { useEffect, useRef } from 'react';
import { clearQuizSession } from '@/lib/quiz/quiz-session';
import { getQuizReloadKey } from '@/lib/quiz/quiz-storage-keys';

type UseQuizGuardsParams = {
  quizId: string;
  status: 'rules' | 'in_progress' | 'completed';
  onExit: () => void;
  resetViolations: () => void;
};

export function useQuizGuards({ quizId, status, onExit, resetViolations }: UseQuizGuardsParams): { markQuitting: () => void } {
  const isReloadingRef = useRef(false);
  const statusRef = useRef(status);
  const reloadKey = getQuizReloadKey(quizId);
  const isQuittingRef = useRef(false);
  const markQuitting = () => {
  isQuittingRef.current = true;
};

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    isQuittingRef.current = false;
    isReloadingRef.current = false;
  }, []);

  useEffect(() => {
    if (status !== 'in_progress') return;

    const hasGuard = window.history.state?.quizGuard;
    if (!hasGuard) {
      window.history.pushState({ quizGuard: true }, '');
    }
  }, [status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'f5' || ((e.ctrlKey || e.metaKey) && key === 'r')) {
        isReloadingRef.current = true;
        window.setTimeout(() => {
          isReloadingRef.current = false;
        }, 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current === 'in_progress' && !isQuittingRef.current) {
        sessionStorage.setItem(reloadKey, '1');
        if (isReloadingRef.current) return;
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [reloadKey]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (statusRef.current !== 'in_progress') return;

      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (!link?.href) return;

      if (link.href.includes(window.location.pathname.replace(/^\/(uk|en|pl)/, ''))) {
        return;
      }

      if (!window.confirm('Exit quiz? Your progress will not be saved.')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      isQuittingRef.current = true;
      clearQuizSession(quizId);
      resetViolations();
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [quizId, resetViolations]);

  useEffect(() => {
    const handlePopState = () => {
      if (statusRef.current !== 'in_progress') return;
      if (isQuittingRef.current) return;

      if (!window.confirm('Exit quiz? Your progress will not be saved.')) {
        window.history.pushState({ quizGuard: true }, '');
        return;
      }

      isQuittingRef.current = true;
      clearQuizSession(quizId);
      resetViolations();
      onExit();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [quizId, resetViolations, onExit]);
  return { markQuitting };
}
