'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthSuccessBanner } from '@/components/auth/AuthSuccessBanner';
import { PasswordField } from '@/components/auth/fields/PasswordField';
import { Button } from '@/components/ui/button';

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const t = useTranslations('auth.resetPassword');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password: formData.get('password'),
        }),
      });

      if (!res.ok) {
        setError(t('errors.resetFailed'));
        return;
      }

      setSuccess(true);
    } catch {
      setError(t('errors.networkError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title={t('title')}>
      {success ? (
        <AuthSuccessBanner message={t('success')} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
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
