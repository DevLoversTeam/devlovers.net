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
  createCartItemKey,
  capQuantityByStock,
  getStoredCartItems,
  persistCartItems,
  rehydrateCart,
  clearStoredCart,
  emptyCart,
} from '@/lib/cart';
import type { ShopProduct } from '@/lib/shop/data';

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

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart>(emptyCart);

  const syncCartWithServer = useCallback(async (items: CartClientItem[]) => {
    persistCartItems(items);
    try {
      const nextCart = await rehydrateCart(items);
      setCart(nextCart);
    } catch (error) {
      console.error('Failed to rehydrate cart', error);
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
