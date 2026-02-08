const TERM_ORDER_KEY = 'ai-term-order';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function getTermOrder(): string[] {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw = localStorage.getItem(TERM_ORDER_KEY);
    if (!raw) {
      return [];
    }

    const order: string[] = JSON.parse(raw);
    return Array.isArray(order) ? order : [];
  } catch {
    return [];
  }
}

export function saveTermOrder(terms: string[]): void {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(TERM_ORDER_KEY, JSON.stringify(terms));
  } catch (error) {
    console.warn('Failed to save term order:', error);
  }
}

export function sortTermsByOrder(terms: string[]): string[] {
  const savedOrder = getTermOrder();

  if (savedOrder.length === 0) {
    return terms;
  }

  const orderMap = new Map(
    savedOrder.map((term, index) => [term.toLowerCase().trim(), index])
  );

  return [...terms].sort((a, b) => {
    const aIndex = orderMap.get(a.toLowerCase().trim());
    const bIndex = orderMap.get(b.toLowerCase().trim());

    if (aIndex !== undefined && bIndex !== undefined) {
      return aIndex - bIndex;
    }

    if (aIndex !== undefined) {
      return -1;
    }

    if (bIndex !== undefined) {
      return 1;
    }

    return 0;
  });
}
