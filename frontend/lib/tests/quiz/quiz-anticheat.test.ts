// @vitest-environment jsdom
import { act,renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next-intl before importing the hook
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated:${key}`,
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
  },
}));

import { toast } from 'sonner';

import { useAntiCheat } from '@/hooks/useAntiCheat';

describe('useAntiCheat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('when isActive = true (default)', () => {
    it('starts with zero violations', () => {
      const { result } = renderHook(() => useAntiCheat(true));

      expect(result.current.violations).toHaveLength(0);
      expect(result.current.violationsCount).toBe(0);
    });

    it('detects copy event and adds violation', () => {
      const { result } = renderHook(() => useAntiCheat(true));

      act(() => {
        const event = new Event('copy', { bubbles: true, cancelable: true });
        document.dispatchEvent(event);
      });

      expect(result.current.violationsCount).toBe(1);
      expect(result.current.violations[0].type).toBe('copy');
      expect(toast.warning).toHaveBeenCalledWith('translated:copy', {
        duration: 3000,
      });
    });

    it('detects paste event and adds violation', () => {
      const { result } = renderHook(() => useAntiCheat(true));

      act(() => {
        const event = new Event('paste', { bubbles: true, cancelable: true });
        document.dispatchEvent(event);
      });

      expect(result.current.violationsCount).toBe(1);
      expect(result.current.violations[0].type).toBe('paste');
    });

    it('detects context-menu event and adds violation', () => {
      const { result } = renderHook(() => useAntiCheat(true));

      act(() => {
        const event = new Event('contextmenu', {
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
      });

      expect(result.current.violationsCount).toBe(1);
      expect(result.current.violations[0].type).toBe('context-menu');
    });

    it('detects tab switch (visibilitychange) and adds violation', () => {
      const { result } = renderHook(() => useAntiCheat(true));

      // Mock document.hidden = true (tab became hidden)
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(result.current.violationsCount).toBe(1);
      expect(result.current.violations[0].type).toBe('tab-switch');
      expect(result.current.isTabActive).toBe(false);

      // Restore
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    it('accumulates multiple violations', () => {
      const { result } = renderHook(() => useAntiCheat(true));

      act(() => {
        document.dispatchEvent(new Event('copy'));
        document.dispatchEvent(new Event('paste'));
        document.dispatchEvent(new Event('contextmenu'));
      });

      expect(result.current.violationsCount).toBe(3);
    });

    it('sets showWarning to true when violation occurs', () => {
      const { result } = renderHook(() => useAntiCheat(true));

      expect(result.current.showWarning).toBe(false);

      act(() => {
        document.dispatchEvent(new Event('copy'));
      });

      expect(result.current.showWarning).toBe(true);
    });

    it('resetViolations clears all violations', () => {
      const { result } = renderHook(() => useAntiCheat(true));

      act(() => {
        document.dispatchEvent(new Event('copy'));
        document.dispatchEvent(new Event('paste'));
      });

      expect(result.current.violationsCount).toBe(2);

      act(() => {
        result.current.resetViolations();
      });

      expect(result.current.violationsCount).toBe(0);
      expect(result.current.violations).toHaveLength(0);
    });
  });

  describe('when isActive = false', () => {
    it('does not track violations', () => {
      const { result } = renderHook(() => useAntiCheat(false));

      act(() => {
        document.dispatchEvent(new Event('copy'));
        document.dispatchEvent(new Event('paste'));
        document.dispatchEvent(new Event('contextmenu'));
      });

      expect(result.current.violationsCount).toBe(0);
      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  describe('cleanup on unmount', () => {
    it('removes event listeners on unmount', () => {
      const { unmount } = renderHook(() => useAntiCheat(true));

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'copy',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'paste',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'contextmenu',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });
  });
});
