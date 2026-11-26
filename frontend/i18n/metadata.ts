import { getTranslations } from 'next-intl/server';

export async function getLocalizedMetadata(namespace: string, locale?: string) {
  const t =
    locale === undefined
      ? await getTranslations(namespace)
      : await getTranslations({ locale, namespace });

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}
