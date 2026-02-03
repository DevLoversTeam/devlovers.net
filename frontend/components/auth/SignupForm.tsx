'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { AuthProvidersBlock } from '@/components/auth/AuthProvidersBlock';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthSuccessBanner } from '@/components/auth/AuthSuccessBanner';
import { EmailField } from '@/components/auth/fields/EmailField';
import { NameField } from '@/components/auth/fields/NameField';
import { PasswordField } from '@/components/auth/fields/PasswordField';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';

type SignupFormProps = {
  locale: string;
  returnTo: string;
};

export function SignupForm({ locale, returnTo }: SignupFormProps) {
  const t = useTranslations('auth.signup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [email, setEmail] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const emailValue = String(formData.get('email') || '');
    setEmail(emailValue);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: emailValue,
          password: formData.get('password'),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? t('errors.signupFailed'));
        return;
      }

      if (data?.verificationRequired) {
        setVerificationRequired(true);
        return;
      }

      window.location.href = returnTo || `/${locale}/dashboard`;
    } catch {
      setError(t('errors.networkError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={t('title')}
      footer={
        !verificationRequired && (
          <p className="text-sm text-gray-600">
            {t('hasAccount')}{' '}
            <Link
              href={
                returnTo
                  ? `/login?returnTo=${encodeURIComponent(returnTo)}`
                  : '/login'
              }
              className="underline"
            >
              {t('loginLink')}
            </Link>
          </p>
        )
      }
    >
      {!verificationRequired && <AuthProvidersBlock />}

      {verificationRequired ? (
        <AuthSuccessBanner
          message={
            <>
              <p>
                {t('verificationSent')} <strong>{email}</strong>.
              </p>

              <p className="mt-2">{t('checkInbox')}</p>
            </>
          }
          footer={
            <Link
              href={
                returnTo
                  ? `/login?returnTo=${encodeURIComponent(returnTo)}`
                  : '/login'
              }
              className="inline-block underline"
            >
              {t('goToLogin')}
            </Link>
          }
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <NameField />

          <EmailField />

          <PasswordField minLength={8} />

          {error && <AuthErrorBanner message={error} />}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t('submitting') : t('submit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
