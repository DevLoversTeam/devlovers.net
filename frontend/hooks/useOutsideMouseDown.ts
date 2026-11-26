'use client';

import { type RefObject, useEffect, useEffectEvent } from 'react';

export function useOutsideMouseDown(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onOutside: () => void
) {
  const handleOutside = useEffectEvent(onOutside);

  useEffect(() => {
    if (!enabled) return;

    function handleMouseDown(event: MouseEvent) {
      const element = ref.current;
      if (
        element &&
        event.target instanceof Node &&
        !element.contains(event.target)
      ) {
        handleOutside();
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [enabled, ref]);
}
