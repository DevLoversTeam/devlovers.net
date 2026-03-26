import { z } from 'zod';

import type { PaymentStatus } from '@/lib/shop/payments';
import { paymentStatusSchema } from '@/lib/validation/shop';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const searchParamString = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform<string | undefined>(value => {
    if (Array.isArray(value)) return value[0]?.trim() || undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }
    return undefined;
  });

export const adminOrderStatusParamSchema = searchParamString.pipe(
  paymentStatusSchema.optional()
);

function parseDateOnlyAtUtcMidnight(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day));
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = parseDateOnlyAtUtcMidnight(value);

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month! - 1 &&
    parsed.getUTCDate() === day
  );
}

export const adminOrderDateParamSchema = searchParamString.refine(
  value => value === undefined || isValidDateOnly(value),
  {
    message: 'Expected YYYY-MM-DD',
  }
);

export const adminOrdersFilterInputSchema = z
  .object({
    status: adminOrderStatusParamSchema,
    dateFrom: adminOrderDateParamSchema,
    dateTo: adminOrderDateParamSchema,
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateFrom must be on or before dateTo',
        path: ['dateFrom'],
      });
    }
  });

export type AdminOrdersFilterInput = z.infer<
  typeof adminOrdersFilterInputSchema
>;

export type AdminOrdersFilters = {
  status: PaymentStatus | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  createdAtGte: Date | undefined;
  createdAtLt: Date | undefined;
};

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export const EMPTY_ADMIN_ORDERS_FILTERS: AdminOrdersFilters = {
  status: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  createdAtGte: undefined,
  createdAtLt: undefined,
};

export function normalizeAdminOrdersFilters(
  value: AdminOrdersFilterInput
): AdminOrdersFilters {
  const createdAtGte = value.dateFrom
    ? parseDateOnlyAtUtcMidnight(value.dateFrom)
    : undefined;
  const createdAtLt = value.dateTo
    ? addUtcDays(parseDateOnlyAtUtcMidnight(value.dateTo), 1)
    : undefined;

  return {
    status: value.status,
    dateFrom: value.dateFrom,
    dateTo: value.dateTo,
    createdAtGte,
    createdAtLt,
  };
}
