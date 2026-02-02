import { z } from 'zod';

import {
  checkoutItemSchema,
  dbProductSchema,
  orderSummarySchema,
  paymentProviderSchema,
  paymentStatusSchema,
  productAdminSchema,
  productAdminUpdateSchema,
} from '@/lib/validation/shop';

export type AdminProductPayload = z.infer<typeof productAdminSchema>;

export type ProductInput = AdminProductPayload & { image: File };

export type ProductUpdateInput = z.infer<typeof productAdminUpdateSchema> & {
  image?: File | null;
  prices?: ProductPriceInput[];
};

export type DbProduct = z.infer<typeof dbProductSchema>;

export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

export type OrderSummary = z.infer<typeof orderSummarySchema> & {
  totalCents?: number;
};

export type OrderDetail = OrderSummary;

export type OrderSummaryWithMinor = OrderSummary & {
  totalAmountMinor: number;
};

export type CheckoutResult = {
  order: OrderSummaryWithMinor;
  isNew: boolean;
  totalCents: number;
};

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;
export type ProductPriceInput = {
  currency: 'USD' | 'UAH';
  price: string;
  originalPrice?: string | null;
};
