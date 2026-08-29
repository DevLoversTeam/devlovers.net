type PageFocusListener = () => void;

const listeners = new Set<PageFocusListener>();
const FOCUS_EVENT_DEDUPE_MS = 250;

let lastFocusEventAt = 0;

function notifyPageFocus() {
  if (document.visibilityState !== 'visible') return;

  const now = Date.now();
  if (lastFocusEventAt > 0 && now - lastFocusEventAt < FOCUS_EVENT_DEDUPE_MS) {
    return;
  }
  lastFocusEventAt = now;

  listeners.forEach(listener => listener());
}

function attachGlobalListeners() {
  window.addEventListener('focus', notifyPageFocus);
  document.addEventListener('visibilitychange', notifyPageFocus);
}

function detachGlobalListeners() {
  window.removeEventListener('focus', notifyPageFocus);
  document.removeEventListener('visibilitychange', notifyPageFocus);
  lastFocusEventAt = 0;
}

export function subscribeToPageFocus(listener: PageFocusListener) {
  if (listeners.size === 0) attachGlobalListeners();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detachGlobalListeners();
  };
}
