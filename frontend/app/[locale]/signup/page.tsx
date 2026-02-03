'use client';

import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';

import { SignupForm } from '@/components/auth/SignupForm';
import { getSafeRedirect } from '@/lib/auth/safe-redirect';

export default function SignupPage() {
  const locale = useLocale();
  const searchParams = useSearchParams();

  const returnTo = getSafeRedirect(searchParams.get('returnTo'));

  return <SignupForm locale={locale} returnTo={returnTo} />;
}
