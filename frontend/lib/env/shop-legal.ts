import 'server-only';

import { readServerEnv } from './server-env';

const DEFAULT_TERMS_VERSION = 'terms-v1';
const DEFAULT_PRIVACY_VERSION = 'privacy-v1';

function readVersion(raw: string | undefined, fallback: string): string {
  const trimmed = (raw ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export type ShopLegalVersions = {
  termsVersion: string;
  privacyVersion: string;
};

export function getShopLegalVersions(): ShopLegalVersions {
  return {
    termsVersion: readVersion(
      readServerEnv('SHOP_TERMS_VERSION'),
      DEFAULT_TERMS_VERSION
    ),
    privacyVersion: readVersion(
      readServerEnv('SHOP_PRIVACY_VERSION'),
      DEFAULT_PRIVACY_VERSION
    ),
  };
}
