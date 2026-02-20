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
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LEN,
  PASSWORD_POLICY_REGEX,
} from '@/lib/auth/signup-constraints';

type SignupFormProps = {
  locale: string;
  returnTo: string;
};

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function SignupForm({ locale, returnTo }: SignupFormProps) {
  const t = useTranslations('auth.signup');
  const tf = useTranslations('auth.fields');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [email, setEmail] = useState('');

  const [nameValue, setNameValue] = useState('');
  const [emailValueLive, setEmailValueLive] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('');

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
    if (!PASSWORD_POLICY_REGEX.test(passwordValue)) return false;
    if (utf8ByteLength(passwordValue) > PASSWORD_MAX_BYTES) return false;
    return true;
  }, [passwordValue]);

  const confirmPasswordPolicyOk = useMemo(() => {
    if (!confirmPasswordValue) return false;
    if (confirmPasswordValue.length < PASSWORD_MIN_LEN) return false;
    if (!PASSWORD_POLICY_REGEX.test(confirmPasswordValue)) return false;
    if (utf8ByteLength(confirmPasswordValue) > PASSWORD_MAX_BYTES) return false;
    return true;
  }, [confirmPasswordValue]);

  const passwordsMatch = useMemo(() => {
    if (!passwordValue || !confirmPasswordValue) return false;
    return passwordValue === confirmPasswordValue;
  }, [passwordValue, confirmPasswordValue]);

  const nameErrorText =
    nameTouched && !nameLooksValid
      ? tf('validation.invalidName', { NAME_MIN_LEN, NAME_MAX_LEN })
      : null;

  const emailErrorText = useMemo(() => {
    if (!emailTouched) return null;
    if (!emailTrimmed) return null;

    if (emailTrimmed.length > EMAIL_MAX_LEN) {
      return tf('validation.emailTooLong', { EMAIL_MAX_LEN });
    }

    if (!emailFormatOk) {
      return tf('validation.invalidEmail');
    }

    return null;
  }, [emailTouched, emailTrimmed, emailFormatOk, tf]);

  const passwordRequirementsText = tf('validation.passwordRequirements', {
    PASSWORD_MIN_LEN,
    PASSWORD_MAX_BYTES,
  });

  const passwordErrorText =
    passwordTouched && !passwordPolicyOk
      ? tf('validation.invalidPassword', { passwordRequirementsText })
      : null;

  const confirmPolicyErrorText =
    confirmPasswordTouched && !confirmPasswordPolicyOk
      ? tf('validation.invalidPassword', { passwordRequirementsText })
      : null;

  const mismatchErrorText =
    confirmPasswordTouched &&
      passwordTouched &&
      passwordValue.length > 0 &&
      confirmPasswordValue.length > 0 &&
      !passwordsMatch
      ? tf('validation.passwordsDontMatch')
      : null;

  const confirmPasswordErrorText = mismatchErrorText ?? confirmPolicyErrorText ?? null;

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
            {nameErrorText && <p className="text-sm text-red-600">{nameErrorText}</p>}
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
            {emailErrorText && <p className="text-sm text-red-600">{emailErrorText}</p>}
          </div>

          <div className="space-y-1">
            <PasswordField
              id="password"
              name="password"
              placeholder={tf('password')}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LEN}
              pattern={PASSWORD_POLICY_REGEX.source}
              onChange={setPasswordValue}
              onBlur={() => setPasswordTouched(true)}
            />
            {passwordErrorText && (
              <p className="text-sm text-red-600">{passwordErrorText}</p>
            )}
            {passwordTouched && utf8ByteLength(passwordValue) > PASSWORD_MAX_BYTES && (
              <p className="text-sm text-red-600">
                {tf('validation.passwordTooLongBytes', { PASSWORD_MAX_BYTES })}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <PasswordField
              id="confirmPassword"
              name="confirmPassword"
              placeholder={tf('confirmPassword')}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LEN}
              pattern={PASSWORD_POLICY_REGEX.source}
              onChange={setConfirmPasswordValue}
              onBlur={() => setConfirmPasswordTouched(true)}
            />
            {confirmPasswordErrorText && (
              <p className="text-sm text-red-600">{confirmPasswordErrorText}</p>
            )}
            {confirmPasswordTouched &&
              utf8ByteLength(confirmPasswordValue) > PASSWORD_MAX_BYTES && (
                <p className="text-sm text-red-600">
                  {tf('validation.passwordTooLongBytes', { PASSWORD_MAX_BYTES })}
                </p>
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