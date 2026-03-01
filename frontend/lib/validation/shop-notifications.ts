import { z } from 'zod';

export const internalNotificationsRunPayloadSchema = z
  .object({
    dryRun: z.boolean().optional().default(false),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
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
      .default(30),
    projectorLimit: z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .default(100),
  })
  .strict();

export type InternalNotificationsRunPayload = z.infer<
  typeof internalNotificationsRunPayloadSchema
>;
