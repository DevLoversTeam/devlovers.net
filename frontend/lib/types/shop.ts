import { z } from 'zod';

import {
  adminProductPhotoPlanSchema,
  checkoutItemSchema,
  checkoutLegalConsentSchema,
  checkoutShippingSchema,
  dbProductSchema,
  orderSummarySchema,
  paymentProviderSchema,
  paymentStatusSchema,
  productAdminSchema,
  productAdminUpdateSchema,
  productImageSchema,
} from '@/lib/validation/shop';

export type AdminProductPayload = z.infer<typeof productAdminSchema>;

export type AdminProductPhotoPlan = z.infer<typeof adminProductPhotoPlanSchema>;
export type ProductImageUploadInput = {
  uploadId: string;
  file: File;
};

export type ProductInput = AdminProductPayload & {
  image?: File | null;
  images?: ProductImageUploadInput[];
  imagePlan?: AdminProductPhotoPlan;
};

export type ProductUpdateInput = z.infer<typeof productAdminUpdateSchema> & {
  image?: File | null;
  images?: ProductImageUploadInput[];
  imagePlan?: AdminProductPhotoPlan;
  prices?: ProductPriceInput[];
};

export type ProductImage = z.infer<typeof productImageSchema>;
export type DbProduct = z.infer<typeof dbProductSchema>;

export type CheckoutItem = z.infer<typeof checkoutItemSchema>;
export type CheckoutShippingInput = z.infer<typeof checkoutShippingSchema>;
export type CheckoutLegalConsentInput = z.infer<
  typeof checkoutLegalConsentSchema
>;

export type OrderSummary = z.infer<typeof orderSummarySchema> & {
  totalCents?: number;
  shipmentStatus?: string | null;
  trackingNumber?: string | null;
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
