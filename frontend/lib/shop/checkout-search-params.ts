import { orderIdParamSchema } from '@/lib/validation/shop';

export type CheckoutSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function getCheckoutSearchParam(
  params: CheckoutSearchParams | undefined,
  key: string
): string {
  const value = params?.[key];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function parseCheckoutOrderId(value?: string): string | null {
  const parsed = orderIdParamSchema.safeParse({ id: value ?? '' });
  return parsed.success ? parsed.data.id : null;
}

export function parseStatusToken(params?: CheckoutSearchParams): string | null {
  return getCheckoutSearchParam(params, 'statusToken').trim() || null;
}

export function shouldClearCart(params?: CheckoutSearchParams): boolean {
  const value = getCheckoutSearchParam(params, 'clearCart');
  return value === '1' || value === 'true';
}
