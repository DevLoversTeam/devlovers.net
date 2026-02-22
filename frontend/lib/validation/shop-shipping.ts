import { z } from 'zod';

import { currencySchema } from '@/lib/validation/shop';

const localeSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .optional()
  .transform(value => (value ? value.toLowerCase() : undefined));

const countrySchema = z
  .string()
  .trim()
  .length(2)
  .optional()
  .transform(value => (value ? value.toUpperCase() : undefined));

export const shippingMethodsQuerySchema = z
  .object({
    locale: localeSchema,
    country: countrySchema,
    currency: currencySchema.optional(),
  })
  .strict();

export const shippingCitiesQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(80),
    locale: localeSchema,
    country: countrySchema,
    currency: currencySchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

// cityRef in API contract is SettlementRef from NP Address.searchSettlements.
const settlementRefSchema = z
  .string()
  .trim()
  .min(20)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/);

export const shippingWarehousesQuerySchema = z
  .object({
    cityRef: settlementRefSchema,
    q: z.string().trim().min(1).max(80).optional(),
    locale: localeSchema,
    country: countrySchema,
    currency: currencySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  })
  .strict();

export const internalNpSyncPayloadSchema = z
  .object({
    cityRef: settlementRefSchema.optional(),
    q: z.string().trim().min(2).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    minIntervalSeconds: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .optional()
      .default(60),
  })
  .strict()
  .refine(value => !!value.cityRef || !!value.q, {
    message: 'cityRef or q is required',
    path: ['cityRef'],
  });

export const internalShippingShipmentsRunPayloadSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    leaseSeconds: z.coerce
      .number()
      .int()
      .min(30)
      .max(1800)
      .optional()
      .default(120),
    maxAttempts: z.coerce.number().int().min(1).max(10).optional().default(5),
    baseBackoffSeconds: z.coerce
      .number()
      .int()
      .min(5)
      .max(3600)
      .optional()
      .default(60),
    minIntervalSeconds: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .optional()
      .default(1),
  })
  .strict();

export const internalShippingRetentionRunPayloadSchema = z
  .object({
    batchSize: z.coerce.number().int().min(1).max(500).optional().default(100),
    retentionDays: z.coerce.number().int().min(1).max(3650).optional(),
    minIntervalSeconds: z.coerce
      .number()
      .int()
      .min(1)
      .max(86400)
      .optional()
      .default(3600),
  })
  .strict();
