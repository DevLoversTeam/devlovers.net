'use client';

import { useTranslations } from 'next-intl';

type EmailFieldProps = {
  onChange?: (value: string) => void;
  minLength?: number;
  maxLength?: number;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

export function EmailField({
  onChange,
  minLength,
  maxLength,
  onBlur,
}: EmailFieldProps) {
  const t = useTranslations('auth.fields');

  const handleInvalid = (e: React.InvalidEvent<HTMLInputElement>) => {
    const input = e.currentTarget;

    if (input.validity.valueMissing) {
      input.setCustomValidity(t('validation.required'));
      return;
    }

    if (input.validity.tooShort && minLength) {
      input.setCustomValidity(`Email must be at least ${minLength} characters.`);
      return;
    }

    if (input.validity.typeMismatch) {
      input.setCustomValidity(t('validation.invalidEmail'));
      return;
    }

    if (input.validity.tooLong && maxLength) {
      input.setCustomValidity(`Email must be at most ${maxLength} characters.`);
      return;
    }
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    e.currentTarget.setCustomValidity('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const trimmed = input.value.trim();

    if (trimmed !== input.value) {
      input.value = trimmed;
    }

    onChange?.(trimmed);
    onBlur?.(e);
  };

  return (
    <input
      name="email"
      type="email"
      placeholder={t('email')}
      required
      minLength={minLength}
      maxLength={maxLength}
      className="w-full rounded border px-3 py-2"
      onInvalid={handleInvalid}
      onInput={handleInput}
      onChange={onChange ? e => onChange(e.currentTarget.value) : undefined}
      onBlur={handleBlur}
    />
  );
}