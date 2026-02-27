import { z } from 'zod';

export const returnRequestIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createReturnPayloadSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9_.-]+$/),
    reason: z.string().trim().max(500).optional(),
    policyRestock: z.boolean().optional().default(true),
  })
  .strict();

export type ReturnRequestIdParams = z.infer<typeof returnRequestIdParamSchema>;
export type CreateReturnPayload = z.infer<typeof createReturnPayloadSchema>;
