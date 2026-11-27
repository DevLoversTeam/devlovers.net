export function parsePage(input?: string): number {
  const n = Number.parseInt(input ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: 3 | 5
): (number | 'ellipsis')[] {
  const pages: (number | 'ellipsis')[] = [];

  if (totalPages <= maxVisible + 2) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    pages.push(1);

    if (currentPage <= 3) {
      for (let i = 2; i <= Math.min(maxVisible, totalPages - 1); i++) {
        pages.push(i);
      }
      if (totalPages > maxVisible) {
        pages.push('ellipsis');
      }
    } else if (currentPage >= totalPages - 2) {
      pages.push('ellipsis');
      for (let i = totalPages - maxVisible + 1; i < totalPages; i++) {
        if (i > 1) pages.push(i);
      }
    } else {
      pages.push('ellipsis');
      for (let i = currentPage - 1; i <= currentPage + 1; i++) {
        pages.push(i);
      }
      pages.push('ellipsis');
    }

    pages.push(totalPages);
  }

  return pages;
}
