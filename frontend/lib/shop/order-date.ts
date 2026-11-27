const orderDateFormats = {
  dateTime: { dateStyle: 'medium', timeStyle: 'short' },
  date: { day: '2-digit', month: 'short', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export function createOrderDateFormatter(
  locale: string,
  format: keyof typeof orderDateFormats = 'dateTime'
) {
  let formatter: Intl.DateTimeFormat | undefined;
  try {
    formatter = new Intl.DateTimeFormat(locale, orderDateFormats[format]);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }

  return (value: Date | string | null | undefined): string => {
    if (!value) return '-';

    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
      return typeof value === 'string' ? value : '-';
    }

    return formatter ? formatter.format(date) : date.toISOString();
  };
}
