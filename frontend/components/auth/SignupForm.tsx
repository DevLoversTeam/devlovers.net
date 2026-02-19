'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { AuthProvidersBlock } from '@/components/auth/AuthProvidersBlock';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthSuccessBanner } from '@/components/auth/AuthSuccessBanner';
import { EmailField } from '@/components/auth/fields/EmailField';
import { NameField } from '@/components/auth/fields/NameField';
import { PasswordField } from '@/components/auth/fields/PasswordField';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import {
  EMAIL_MAX_LEN,
  EMAIL_MIN_LEN,
  NAME_MAX_LEN,
  NAME_MIN_LEN,
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
  PASSWORD_POLICY_REGEX,
} from '@/lib/auth/signup-constraints';

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

  // Live values
  const [nameValue, setNameValue] = useState('');
  const [emailValueLive, setEmailValueLive] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('');

  // Touched flags (show messages only after blur)
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

  const nameTrimmed = useMemo(() => nameValue.trim(), [nameValue]);
  const emailTrimmed = useMemo(() => emailValueLive.trim(), [emailValueLive]);

  const nameLooksValid = useMemo(() => {
    return nameTrimmed.length >= NAME_MIN_LEN && nameTrimmed.length <= NAME_MAX_LEN;
  }, [nameTrimmed]);

  const emailFormatOk = useMemo(() => {
    if (!emailTrimmed) return false;
    return z.string().email().safeParse(emailTrimmed).success;
  }, [emailTrimmed]);

  const emailLooksValid = useMemo(() => {
    if (!emailTrimmed) return false;
    if (emailTrimmed.length < EMAIL_MIN_LEN) return false;
    if (emailTrimmed.length > EMAIL_MAX_LEN) return false;
    return emailFormatOk;
  }, [emailTrimmed, emailFormatOk]);

  const passwordPolicyOk = useMemo(() => {
    if (!passwordValue) return false;
    if (passwordValue.length < PASSWORD_MIN_LEN) return false;
    if (passwordValue.length > PASSWORD_MAX_LEN) return false;
    return PASSWORD_POLICY_REGEX.test(passwordValue);
  }, [passwordValue]);

  const confirmPasswordPolicyOk = useMemo(() => {
    if (!confirmPasswordValue) return false;
    if (confirmPasswordValue.length < PASSWORD_MIN_LEN) return false;
    if (confirmPasswordValue.length > PASSWORD_MAX_LEN) return false;
    return PASSWORD_POLICY_REGEX.test(confirmPasswordValue);
  }, [confirmPasswordValue]);

  const passwordsMatch = useMemo(() => {
    if (!passwordValue || !confirmPasswordValue) return false;
    return passwordValue === confirmPasswordValue;
  }, [passwordValue, confirmPasswordValue]);

  const nameErrorText =
    nameTouched && !nameLooksValid
      ? `Name must be at least ${NAME_MIN_LEN} characters and at most ${NAME_MAX_LEN} characters`
      : null;

  const emailErrorText = useMemo(() => {
    if (!emailTouched) return null;

    if (!emailTrimmed) return null;

    if (emailTrimmed.length > EMAIL_MAX_LEN) {
      return `Email must not exceed ${EMAIL_MAX_LEN} characters.`;
    }

    if (!emailFormatOk) {
      return 'Email format is invalid.';
    }

    return null;
  }, [emailTouched, emailTrimmed, emailFormatOk]);

  const passwordRequirementsText =
    '8–128 characters, at least one capital letter, and at least one special character.';

  const passwordErrorText =
    passwordTouched && !passwordPolicyOk
      ? `Password must meet requirements: ${passwordRequirementsText}`
      : null;

  const confirmPolicyErrorText =
    confirmPasswordTouched && !confirmPasswordPolicyOk
      ? `Repeat password must meet requirements: ${passwordRequirementsText}`
      : null;

  const mismatchErrorText =
    confirmPasswordTouched &&
      passwordTouched &&
      passwordValue.length > 0 &&
      confirmPasswordValue.length > 0 &&
      !passwordsMatch
      ? 'Passwords do not match.'
      : null;

  const confirmPasswordErrorText =
    mismatchErrorText ?? confirmPolicyErrorText ?? null;

  const submitDisabled =
    loading ||
    !nameLooksValid ||
    !emailLooksValid ||
    !passwordPolicyOk ||
    !confirmPasswordPolicyOk ||
    !passwordsMatch;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;

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
          confirmPassword: formData.get('confirmPassword'),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          typeof data?.error === 'string' ? data.error : t('errors.signupFailed');
        setError(msg);
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
          <div className="space-y-1">
            <NameField
              minLength={NAME_MIN_LEN}
              maxLength={NAME_MAX_LEN}
              onChange={setNameValue}
              onBlur={() => setNameTouched(true)}
            />
            {nameErrorText && (
              <p className="text-sm text-red-600">{nameErrorText}</p>
            )}
          </div>

          <div className="space-y-1">
            <EmailField
              minLength={EMAIL_MIN_LEN}
              maxLength={EMAIL_MAX_LEN}
              onChange={value => {
                setEmailValueLive(value);
                setEmail(value);

              }}
              onBlur={() => setEmailTouched(true)}
            />
            {emailErrorText && (
              <p className="text-sm text-red-600">{emailErrorText}</p>
            )}
          </div>

          <div className="space-y-1">
            <PasswordField
              id="password"
              name="password"
              placeholder="Password"
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

          <div className="space-y-1">
            <PasswordField
              id="confirmPassword"
              name="confirmPassword"
              placeholder="Repeat password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LEN}
              maxLength={PASSWORD_MAX_LEN}
              pattern={PASSWORD_POLICY_REGEX.source}
              onChange={setConfirmPasswordValue}
              onBlur={() => setConfirmPasswordTouched(true)}
            />
            {confirmPasswordErrorText && (
              <p className="text-sm text-red-600">{confirmPasswordErrorText}</p>
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