// @vitest-environment jsdom
import { act,renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQuizGuards } from '@/hooks/useQuizGuards';
import { getQuizReloadKey } from '@/lib/quiz/quiz-storage-keys';

vi.mock('@/lib/quiz/quiz-session', () => ({
  clearQuizSession: vi.fn(),
}));

import { clearQuizSession } from '@/lib/quiz/quiz-session';

const createParams = (
  overrides: Partial<{
    quizId: string;
    status: 'rules' | 'in_progress' | 'completed';
    onExit: () => void;
    resetViolations: () => void;
  }> = {}
) => ({
  quizId: 'quiz-1',
  status: 'in_progress' as const,
  onExit: vi.fn(),
  resetViolations: vi.fn(),
  ...overrides,
});

describe('useQuizGuards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pushes history guard when quiz is in progress', () => {
    renderHook(() => useQuizGuards(createParams()));

    expect(window.history.state?.quizGuard).toBe(true);
  });

  it('does not push guard when status is not in_progress', () => {
    renderHook(() => useQuizGuards(createParams({ status: 'rules' })));

    expect(window.history.state?.quizGuard).toBeUndefined();
  });

  it('sets reload flag on beforeunload when in progress', () => {
    const params = createParams();
    const reloadKey = getQuizReloadKey(params.quizId);

    renderHook(() => useQuizGuards(params));

    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(sessionStorage.getItem(reloadKey)).toBe('1');
  });

  it('clears session and resets violations on external link click', () => {
    const params = createParams();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderHook(() => useQuizGuards(params));

    window.history.pushState({}, '', '/en/quizzes');
    const link = document.createElement('a');
    link.setAttribute('href', 'javascript:void(0)');
    document.body.appendChild(link);

    const event = new MouseEvent('click', { bubbles: true });
    link.dispatchEvent(event);

    expect(confirmSpy).toHaveBeenCalled();
    expect(clearQuizSession).toHaveBeenCalledWith(params.quizId);
    expect(params.resetViolations).toHaveBeenCalled();

    link.remove();
  });

  it('prevents navigation when user cancels external link', () => {
    const params = createParams();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderHook(() => useQuizGuards(params));

    const link = document.createElement('a');
    link.setAttribute('href', 'javascript:void(0)');
    document.body.appendChild(link);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    const event = new MouseEvent('click', { bubbles: true }) as MouseEvent & {
      preventDefault: () => void;
      stopPropagation: () => void;
    };
    event.preventDefault = preventDefault;
    event.stopPropagation = stopPropagation;

    link.dispatchEvent(event);

    expect(confirmSpy).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(clearQuizSession).not.toHaveBeenCalled();

    link.remove();
  });

  it('handles back navigation with confirm', () => {
    const params = createParams();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderHook(() => useQuizGuards(params));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(clearQuizSession).toHaveBeenCalledWith(params.quizId);
    expect(params.resetViolations).toHaveBeenCalled();
    expect(params.onExit).toHaveBeenCalled();
  });

  it('cancels back navigation when user declines', () => {
    const params = createParams();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    renderHook(() => useQuizGuards(params));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalled();
    expect(clearQuizSession).not.toHaveBeenCalled();
    expect(params.onExit).not.toHaveBeenCalled();
  });

  it('markQuitting bypasses unload confirmation', () => {
    const params = createParams();
    const reloadKey = getQuizReloadKey(params.quizId);

    const { result } = renderHook(() => useQuizGuards(params));

    act(() => {
      result.current.markQuitting();
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(sessionStorage.getItem(reloadKey)).toBeNull();
  });
});
