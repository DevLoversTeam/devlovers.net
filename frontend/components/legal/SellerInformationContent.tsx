import { getTranslations } from 'next-intl/server';

import { getPublicSellerInformation } from '@/lib/legal/public-seller-information';

import LegalBlock from './LegalBlock';

export const SELLER_INFORMATION_LAST_UPDATED = '2026-03-27';

const linkClass =
  'underline underline-offset-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors';

function placeholder(text: string) {
  return (
    <span className="text-slate-500 italic dark:text-slate-400">{text}</span>
  );
}

export default async function SellerInformationContent() {
  const t = await getTranslations('legal.seller');
  const seller = getPublicSellerInformation();

  const sellerDetails = [
    {
      key: 'sellerName',
      label: t('fields.sellerName'),
      value: seller.sellerName ?? placeholder(t('placeholders.toBeAdded')),
    },
    {
      key: 'address',
      label: t('fields.address'),
      value: seller.address ?? placeholder(t('placeholders.toBeAdded')),
    },
    {
      key: 'businessDetails',
      label: t('fields.businessDetails'),
      value:
        seller.businessDetails.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5">
            {seller.businessDetails.map(detail => (
              <li key={`${detail.label}:${detail.value}`}>
                <strong>{detail.label}:</strong> {detail.value}
              </li>
            ))}
          </ul>
        ) : (
          placeholder(t('placeholders.toBeAdded'))
        ),
    },
  ];

  const supportContacts = [
    {
      key: 'supportEmail',
      label: t('fields.supportEmail'),
      value: seller.supportEmail ? (
        <a className={linkClass} href={`mailto:${seller.supportEmail}`}>
          {seller.supportEmail}
        </a>
      ) : (
        placeholder(t('placeholders.toBeAdded'))
      ),
    },
    {
      key: 'supportPhone',
      label: t('fields.supportPhone'),
      value: seller.supportPhone ? (
        <a className={linkClass} href={`tel:${seller.supportPhone}`}>
          {seller.supportPhone}
        </a>
      ) : (
        placeholder(t('placeholders.toBeAdded'))
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <LegalBlock id="seller-details" title={t('sellerDetailsTitle')}>
        <p className="mb-5">{t('sellerDetailsBody')}</p>
        <dl className="space-y-5">
          {sellerDetails.map(field => (
            <div
              key={field.key}
              className="grid gap-2 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-4"
            >
              <dt className="font-medium text-slate-900 dark:text-slate-100">
                {field.label}
              </dt>
              <dd className="m-0">{field.value}</dd>
            </div>
          ))}
        </dl>
      </LegalBlock>

      <LegalBlock id="support-contacts" title={t('supportContactsTitle')}>
        <p className="mb-5">{t('supportContactsBody')}</p>
        <dl className="space-y-5">
          {supportContacts.map(field => (
            <div
              key={field.key}
              className="grid gap-2 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-4"
            >
              <dt className="font-medium text-slate-900 dark:text-slate-100">
                {field.label}
              </dt>
              <dd className="m-0">{field.value}</dd>
            </div>
          ))}
        </dl>
      </LegalBlock>
    </div>
  );
}
