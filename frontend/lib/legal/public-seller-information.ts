import 'server-only';

import { getPublicSupportEmail } from '@/lib/legal/public-contact';

export type SellerBusinessDetail = {
  label: string;
  value: string;
};

export type PublicSellerInformation = {
  sellerName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  address: string | null;
  businessDetails: SellerBusinessDetail[];
};

function nonEmpty(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getPublicSellerInformation(): PublicSellerInformation {
  const sellerName = nonEmpty(process.env.NP_SENDER_NAME);
  const supportPhone = nonEmpty(process.env.NP_SENDER_PHONE);
  const supportEmail = getPublicSupportEmail();
  const address = nonEmpty(process.env.SHOP_SELLER_ADDRESS);
  const edrpou = nonEmpty(process.env.NP_SENDER_EDRPOU);
  const businessDetails = edrpou ? [{ label: 'EDRPOU', value: edrpou }] : [];

  return {
    sellerName,
    supportEmail,
    supportPhone,
    address,
    businessDetails,
  };
}
