'use client';

import type React from 'react';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  type Cart,
  type CartClientItem,
  type CartRehydrateError,
  createCartItemKey,
  capQuantityByStock,
  getStoredCartItems,
  persistCartItems,
  rehydrateCart,
  clearStoredCart,
  emptyCart,
} from '@/lib/cart';
import type { ShopProduct } from '@/lib/shop/data';
import { logWarn } from '@/lib/logging';

interface CartContextType {
  cart: Cart;
  addToCart: (
    product: ShopProduct,
    quantity?: number,
    selectedSize?: string,
    selectedColor?: string
  ) => void;
  updateQuantity: (
    productId: string,
    quantity: number,
    selectedSize?: string,
    selectedColor?: string
  ) => void;
  removeFromCart: (
    productId: string,
    selectedSize?: string,
    selectedColor?: string
  ) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType>({
  cart: emptyCart,
  addToCart: () => {},
  updateQuantity: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
});

function getErrorInfo(error: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  const e = error as Partial<CartRehydrateError> & {
    code?: unknown;
    details?: unknown;
    message?: unknown;
  };

  return {
    code: typeof e?.code === 'string' ? e.code : 'UNKNOWN_ERROR',
    message: typeof e?.message === 'string' ? e.message : 'Cart rehydrate failed',
    details: e?.details,
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart>(emptyCart);

  const syncCartWithServer = useCallback(async (items: CartClientItem[]) => {
    persistCartItems(items);

    try {
      const nextCart = await rehydrateCart(items);
      setCart(nextCart);
      return;
    } catch (error) {
      const info = getErrorInfo(error);

      // Self-heal: missing price for locale currency (e.g., uk => UAH) should not crash UI.
      if (info.code === 'PRICE_CONFIG_ERROR') {
        const productId =
          typeof (info.details as any)?.productId === 'string'
            ? String((info.details as any).productId)
            : '';

        // Best-effort: remove only the problematic product (if identified), retry once.
        if (productId) {
          const filtered = items.filter(i => i.productId !== productId);

          if (filtered.length !== items.length) {
            persistCartItems(filtered);

            try {
              const retriedCart = await rehydrateCart(filtered);
              setCart(retriedCart);

              logWarn('cart_rehydrate_recovered_by_removing_item', {
                code: info.code,
                removedProductId: productId,
              });

              return;
            } catch (retryError) {
              const retryInfo = getErrorInfo(retryError);
              logWarn('cart_rehydrate_retry_failed', {
                code: retryInfo.code,
                message: retryInfo.message,
              });
            }
          }
        }

        // Fallback: clear cart to unblock the user.
        clearStoredCart();
        setCart(emptyCart);

        logWarn('cart_cleared_due_to_rehydrate_error', {
          code: info.code,
          message: info.message,
          details: info.details,
        });

        return;
      }

      // Non-blocking: keep current cart state (avoid crashing the page).
      logWarn('cart_rehydrate_failed_client', {
        code: info.code,
        message: info.message,
      });
    }
  }, []);

  const didHydrate = useRef(false);

  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;

    const stored = getStoredCartItems();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void syncCartWithServer(stored);
  }, [syncCartWithServer]);

  const addToCart = useCallback(
    (
      product: ShopProduct,
      quantity = 1,
      selectedSize?: string,
      selectedColor?: string
    ) => {
      const storedItems = getStoredCartItems();
      const key = createCartItemKey(product.id, selectedSize, selectedColor);
      const existingIndex = storedItems.findIndex(
        item =>
          createCartItemKey(
            item.productId,
            item.selectedSize,
            item.selectedColor
          ) === key
      );
      const knownStock = cart.items.find(
        item =>
          createCartItemKey(
            item.productId,
            item.selectedSize,
            item.selectedColor
          ) === key
      )?.stock;

      const desiredQuantity =
        existingIndex >= 0
          ? storedItems[existingIndex]!.quantity + quantity
          : quantity;
      const cappedQuantity =
        knownStock === undefined
          ? Math.max(0, desiredQuantity)
          : capQuantityByStock(desiredQuantity, knownStock);

      const updatedItems = [...storedItems];

      if (existingIndex >= 0) {
        if (cappedQuantity <= 0) {
          updatedItems.splice(existingIndex, 1);
        } else {
          updatedItems[existingIndex] = {
            ...updatedItems[existingIndex]!,
            quantity: cappedQuantity,
          };
        }
      } else if (cappedQuantity > 0) {
        updatedItems.push({
          productId: product.id,
          quantity: cappedQuantity,
          selectedSize,
          selectedColor,
        });
      }

      void syncCartWithServer(updatedItems);
    },
    [cart.items, syncCartWithServer]
  );

  const updateQuantity = useCallback(
    (
      productId: string,
      quantity: number,
      selectedSize?: string,
      selectedColor?: string
    ) => {
      const storedItems = getStoredCartItems();
      const key = createCartItemKey(productId, selectedSize, selectedColor);
      const index = storedItems.findIndex(
        item =>
          createCartItemKey(
            item.productId,
            item.selectedSize,
            item.selectedColor
          ) === key
      );

      if (index < 0) return;

      const knownStock = cart.items.find(
        item =>
          createCartItemKey(
            item.productId,
            item.selectedSize,
            item.selectedColor
          ) === key
      )?.stock;

      const cappedQuantity =
        knownStock === undefined
          ? Math.max(0, quantity)
          : capQuantityByStock(quantity, knownStock);
      const updatedItems = [...storedItems];

      if (cappedQuantity <= 0) {
        updatedItems.splice(index, 1);
      } else {
        updatedItems[index] = {
          ...updatedItems[index]!,
          quantity: cappedQuantity,
        };
      }

      void syncCartWithServer(updatedItems);
    },
    [cart.items, syncCartWithServer]
  );

  const removeFromCart = useCallback(
    (productId: string, selectedSize?: string, selectedColor?: string) => {
      void updateQuantity(productId, 0, selectedSize, selectedColor);
    },
    [updateQuantity]
  );

  const clearCart = useCallback(() => {
    clearStoredCart();
    setCart(emptyCart);
  }, []);

  return (
    <CartContext.Provider
      value={{ cart, addToCart, updateQuantity, removeFromCart, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
