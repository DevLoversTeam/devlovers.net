import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import pl from '@/messages/pl.json';
import uk from '@/messages/uk.json';

describe('shared translations', () => {
  it.each([
    {
      locale: 'en',
      messages: en,
      pagination: ['Previous page', 'Next page', 'Page 3'],
      shop: ['Continue shopping', 'Order summary', 'Total', 'Items'],
      orders: ['Order A-17', 'Order details', 'Payment status', 'Order'],
      security: 'Security check failed. Refresh the page and try again.',
      productFields: ['Category', 'Type'],
      dismissActions: ['Close', 'Cancel'],
      products: 'Products',
      mastered: 'Mastered',
      checkoutStatus: 'Status',
      orderCreated: 'Created',
    },
    {
      locale: 'uk',
      messages: uk,
      pagination: ['Попередня сторінка', 'Наступна сторінка', 'Сторінка 3'],
      shop: ['Продовжити покупки', 'Підсумок замовлення', 'Всього', 'Товари'],
      orders: [
        'Замовлення A-17',
        'Деталі замовлення',
        'Статус оплати',
        'Замовлення',
      ],
      security:
        'Перевірка безпеки не пройдена. Оновіть сторінку й спробуйте ще раз.',
      productFields: ['Категорія', 'Тип'],
      dismissActions: ['Закрити', 'Скасувати'],
      products: 'Товари',
      mastered: 'Засвоєно',
      checkoutStatus: 'Статус',
      orderCreated: 'Створено',
    },
    {
      locale: 'pl',
      messages: pl,
      pagination: ['Poprzednia strona', 'Następna strona', 'Strona 3'],
      shop: [
        'Kontynuuj zakupy',
        'Podsumowanie zamówienia',
        'Razem',
        'Produkty',
      ],
      orders: [
        'Zamówienie A-17',
        'Szczegóły zamówienia',
        'Status płatności',
        'Zamówienie',
      ],
      security:
        'Weryfikacja bezpieczeństwa nie powiodła się. Odśwież stronę i spróbuj ponownie.',
      productFields: ['Kategoria', 'Typ'],
      dismissActions: ['Zamknij', 'Anuluj'],
      products: 'Produkty',
      mastered: 'Opanowane',
      checkoutStatus: 'Status',
      orderCreated: 'Utworzono',
    },
  ])('resolves the shared pagination and Shop labels in $locale', fixture => {
    const t = createTranslator({
      locale: fixture.locale,
      messages: fixture.messages,
      onError: error => {
        throw error;
      },
    });

    expect([
      t('common.pagination.previousPage'),
      t('common.pagination.nextPage'),
      t('common.pagination.page', { page: 3 }),
    ]).toEqual(fixture.pagination);

    expect([
      t('shop.checkout.actions.continueShopping'),
      t('shop.orderSummary'),
      t('shop.total'),
      t('shop.items'),
    ]).toEqual(fixture.shop);

    expect([
      t('shop.orders.orderNumber', { id: 'A-17' }),
      t('shop.orders.orderDetails'),
      t('shop.orders.paymentStatusLabel'),
      t('shop.orders.orderLabel'),
    ]).toEqual(fixture.orders);
    expect(t('shop.orders.detail.actionSecurityError')).toBe(fixture.security);
    expect([t('shop.product.category'), t('shop.product.type')]).toEqual(
      fixture.productFields
    );
    expect([t('common.close'), t('common.cancel')]).toEqual(
      fixture.dismissActions
    );
    expect(t('shop.products.label')).toBe(fixture.products);
    expect(t('quiz.status.mastered')).toBe(fixture.mastered);
    expect(t('shop.checkout.paymentStatusLabel')).toBe(fixture.checkoutStatus);
    expect(t('shop.orders.created')).toBe(fixture.orderCreated);
  });
});
