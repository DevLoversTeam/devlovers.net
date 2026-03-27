import { describe, expect, it, vi } from 'vitest';

const getTranslationsMock = vi.hoisted(() =>
  vi.fn(
    async (
      input?:
        | string
        | {
            locale?: string;
            namespace?: string;
          }
    ) => {
      const namespace =
        typeof input === 'string' ? input : (input?.namespace ?? '');

      return (key: string) => `${namespace}.${key}`;
    }
  )
);

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

describe('phase 4 public legal pages', () => {
  it('keeps public legal pages guest-accessible and localized through route metadata', async () => {
    const localeParams = { params: Promise.resolve({ locale: 'en' }) };

    const sellerPage = await import('@/app/[locale]/seller-information/page');
    const paymentPage = await import('@/app/[locale]/payment-policy/page');
    const deliveryPage = await import('@/app/[locale]/delivery-policy/page');
    const returnsPage = await import('@/app/[locale]/returns-policy/page');
    const privacyPage = await import('@/app/[locale]/privacy-policy/page');
    const termsPage = await import('@/app/[locale]/terms-of-service/page');

    expect(await sellerPage.default()).toBeTruthy();
    expect(await paymentPage.default()).toBeTruthy();
    expect(await deliveryPage.default()).toBeTruthy();
    expect(await returnsPage.default()).toBeTruthy();
    expect(await privacyPage.default()).toBeTruthy();
    expect(await termsPage.default()).toBeTruthy();

    await expect(sellerPage.generateMetadata(localeParams)).resolves.toEqual({
      title: 'legal.seller.metaTitle',
      description: 'legal.seller.metaDescription',
    });
    await expect(paymentPage.generateMetadata(localeParams)).resolves.toEqual({
      title: 'legal.payment.metaTitle',
      description: 'legal.payment.metaDescription',
    });
    await expect(deliveryPage.generateMetadata(localeParams)).resolves.toEqual({
      title: 'legal.delivery.metaTitle',
      description: 'legal.delivery.metaDescription',
    });
    await expect(returnsPage.generateMetadata(localeParams)).resolves.toEqual({
      title: 'legal.returns.metaTitle',
      description: 'legal.returns.metaDescription',
    });
    await expect(privacyPage.generateMetadata(localeParams)).resolves.toEqual({
      title: 'legal.privacy.metaTitle',
      description: 'legal.privacy.metaDescription',
    });
    await expect(termsPage.generateMetadata(localeParams)).resolves.toEqual({
      title: 'legal.terms.metaTitle',
      description: 'legal.terms.metaDescription',
    });
  });
});
