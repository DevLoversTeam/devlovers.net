'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { AuthProvidersBlock } from '@/components/auth/AuthProvidersBlock';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthSuccessBanner } from '@/components/auth/AuthSuccessBanner';
import { EmailField } from '@/components/auth/fields/EmailField';
import { PasswordField } from '@/components/auth/fields/PasswordField';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';

type LoginFormProps = {
  locale: string;
  returnTo: string;
};

export function LoginForm({ locale, returnTo }: LoginFormProps) {
  const t = useTranslations('auth.login');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setErrorCode(null);
    setVerificationSent(false);

    const formData = new FormData(e.currentTarget);
    const emailValue = String(formData.get('email') || '');
    setEmail(emailValue);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailValue,
          password: formData.get('password'),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorCode(data?.code ?? null);

        if (data?.code === 'EMAIL_NOT_VERIFIED') {
          setErrorMessage(t('errors.emailNotVerified'));
        } else {
          setErrorMessage(t('errors.invalidCredentials'));
        }
        return;
      }

      window.location.href = returnTo || `/${locale}/dashboard`;
    } catch (err) {
      console.error('Login request failed:', err);
      setErrorMessage(t('errors.networkError'));
      setErrorCode(null);
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!email) return;

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorCode(data?.code ?? 'RESEND_FAILED');
        setErrorMessage(data?.error ?? t('errors.resendFailed'));
        return;
      }

      setVerificationSent(true);
      setErrorCode(null);
      setErrorMessage(null);
    } catch (err) {
      console.error('Resend verification failed:', err);
      setErrorCode('NETWORK_ERROR');
      setErrorMessage(t('errors.networkError'));
    }
  }

  return (
    <AuthShell
      title={t('title')}
      footer={
        <p className="text-sm text-gray-600">
          {t('noAccount')}{' '}
          <Link
            href={
              returnTo
                ? `/signup?returnTo=${encodeURIComponent(returnTo)}`
                : '/signup'
            }
            className="underline"
          >
            {t('signupLink')}
          </Link>
        </p>
      }
    >
      <AuthProvidersBlock />

      <form onSubmit={onSubmit} className="space-y-4">
        <EmailField onChange={setEmail} />

        <PasswordField />

        <div className="text-right">
          <Link
            href={
              returnTo
                ? `/forgot-password?returnTo=${encodeURIComponent(returnTo)}`
                : '/forgot-password'
            }
            className="text-sm text-gray-600 underline"
          >
            {t('forgotPassword')}
          </Link>
        </div>

        {errorMessage && !verificationSent && (
          <AuthErrorBanner
            message={errorMessage}
            actionLabel={
              errorCode === 'EMAIL_NOT_VERIFIED'
                ? t('resendVerification')
                : undefined
            }
            onAction={
              errorCode === 'EMAIL_NOT_VERIFIED'
                ? resendVerification
                : undefined
            }
          />
        )}

        {verificationSent && (
          <AuthSuccessBanner
            message={
              <>
                {t('verificationSent')} <strong>{email}</strong>
              </>
            }
          />
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? t('submitting') : t('submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
