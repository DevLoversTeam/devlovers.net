export function createCartItemKey(
  productId: string,
  selectedSize?: string,
  selectedColor?: string
): string {
  return [productId, selectedSize ?? '', selectedColor ?? ''].join('::');
}
