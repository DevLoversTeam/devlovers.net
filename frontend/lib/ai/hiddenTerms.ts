const HIDDEN_TERMS_KEY = 'ai-hidden-terms';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function getHiddenTerms(): Set<string> {
  if (!isBrowser()) {
    return new Set();
  }

  try {
    const raw = localStorage.getItem(HIDDEN_TERMS_KEY);
    if (!raw) {
      return new Set();
    }

    const terms: string[] = JSON.parse(raw);
    return new Set(terms);
  } catch {
    return new Set();
  }
}

export function hideTermFromDashboard(term: string): void {
  if (!isBrowser()) return;

  try {
    const hiddenTerms = getHiddenTerms();
    hiddenTerms.add(term.toLowerCase().trim());
    localStorage.setItem(
      HIDDEN_TERMS_KEY,
      JSON.stringify(Array.from(hiddenTerms))
    );
  } catch (error) {
    console.warn('Failed to hide term:', error);
  }
}

export function unhideTermFromDashboard(term: string): void {
  if (!isBrowser()) return;

  try {
    const hiddenTerms = getHiddenTerms();
    hiddenTerms.delete(term.toLowerCase().trim());
    localStorage.setItem(
      HIDDEN_TERMS_KEY,
      JSON.stringify(Array.from(hiddenTerms))
    );
  } catch (error) {
    console.warn('Failed to unhide term:', error);
  }
}

export function isTermHidden(term: string): boolean {
  const hiddenTerms = getHiddenTerms();
  return hiddenTerms.has(term.toLowerCase().trim());
}
