import { z } from 'zod';

import { checkoutShippingSchema } from '@/lib/validation/shop';

export const adminOrderShippingEditSchema = checkoutShippingSchema;

export type AdminOrderShippingEditInput = z.infer<
  typeof adminOrderShippingEditSchema
>;
