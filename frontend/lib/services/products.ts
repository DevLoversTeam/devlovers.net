// frontend/lib/services/products.ts
// Facade: keep legacy import path stable (no index.ts required)

export { createProduct } from './products/mutations/create';
export { updateProduct } from './products/mutations/update';
export { deleteProduct } from './products/mutations/delete';
export { toggleProductStatus } from './products/mutations/toggle';

export {
  getAdminProductById,
  getAdminProductPrices,
  getAdminProductByIdWithPrices,
  getAdminProductsList,
} from './products/admin/queries';

export { rehydrateCartItems } from './products/cart/rehydrate';

export type {
  AdminProductPriceRow,
  AdminProductsFilter,
} from './products/types';
