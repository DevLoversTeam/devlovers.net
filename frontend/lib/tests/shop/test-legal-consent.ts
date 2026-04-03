import { getShopLegalVersions } from '@/lib/env/shop-legal';

export function createTestLegalConsent() {
  const canonicalLegalVersions = getShopLegalVersions();

  return {
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: canonicalLegalVersions.termsVersion,
    privacyVersion: canonicalLegalVersions.privacyVersion,
  } as const;
}

export const TEST_LEGAL_CONSENT = createTestLegalConsent();
