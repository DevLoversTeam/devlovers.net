'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthSuccessBanner } from '@/components/auth/AuthSuccessBanner';
import { PasswordField } from '@/components/auth/fields/PasswordField';
import { Button } from '@/components/ui/button';
import {
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
  PASSWORD_POLICY_REGEX,
} from '@/lib/auth/signup-constraints';

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const t = useTranslations('auth.resetPassword');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [passwordValue, setPasswordValue] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);

  const passwordPolicyOk = useMemo(() => {
    if (!passwordValue) return false;
    if (passwordValue.length < PASSWORD_MIN_LEN) return false;
    if (passwordValue.length > PASSWORD_MAX_LEN) return false;
    return PASSWORD_POLICY_REGEX.test(passwordValue);
  }, [passwordValue]);

  const passwordRequirementsText =
    '8–128 characters, at least one capital letter, and at least one special character.';

  const passwordErrorText =
    passwordTouched && !passwordPolicyOk
      ? `Password must meet requirements: ${passwordRequirementsText}`
      : null;

  const submitDisabled = loading || !passwordPolicyOk;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submitDisabled) return;

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

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          typeof data?.error === 'string' ? data.error : t('errors.resetFailed');
        setError(msg);
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
          <div className="space-y-1">
            <PasswordField
              id="password"
              name="password"
              placeholder="New password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LEN}
              maxLength={PASSWORD_MAX_LEN}
              pattern={PASSWORD_POLICY_REGEX.source}
              onChange={setPasswordValue}
              onBlur={() => setPasswordTouched(true)}
            />
            {passwordErrorText && (
              <p className="text-sm text-red-600">{passwordErrorText}</p>
            )}
          </div>

          {error && <AuthErrorBanner message={error} />}

          <Button type="submit" disabled={submitDisabled} className="w-full">
            {loading ? t('submitting') : t('submit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}