'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

type PasswordFieldProps = {
  name?: string;
  id?: string;
  minLength?: number;
  pattern?: string;
  onChange?: (value: string) => void;

  placeholder?: string;
  autoComplete?: string;
  ariaLabel?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

export function PasswordField({
  name = 'password',
  id,
  minLength,
  pattern,
  onChange,
  placeholder,
  autoComplete = 'new-password',
  ariaLabel,
  onBlur,
}: PasswordFieldProps) {
  const t = useTranslations('auth.fields');
  const [visible, setVisible] = useState(false);

  const handleInvalid = (e: React.InvalidEvent<HTMLInputElement>) => {
    const input = e.currentTarget;

    if (input.validity.valueMissing) {
      input.setCustomValidity(t('validation.required'));
      return;
    }

    if (input.validity.tooShort && minLength) {
      input.setCustomValidity(t('validation.passwordTooShort', { minLength }));
      return;
    }

    if (input.validity.patternMismatch) {
      input.setCustomValidity(
        'Password must include at least one capital letter and one special character.'
      );
      return;
    }
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    e.currentTarget.setCustomValidity('');
  };

  const resolvedPlaceholder = placeholder ?? t('password');

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        placeholder={resolvedPlaceholder}
        aria-label={ariaLabel ?? resolvedPlaceholder}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        pattern={pattern}
        className="w-full rounded border px-3 py-2 pr-10"
        onInvalid={handleInvalid}
        onInput={handleInput}
        onBlur={onBlur}
        onChange={onChange ? e => onChange(e.currentTarget.value) : undefined}
      />

      <button
        type="button"
        aria-label={visible ? t('hidePassword') : t('showPassword')}
        onClick={() => setVisible(v => !v)}
        className="absolute inset-y-0 right-2 flex items-center text-sm text-gray-500"
      >
        {visible ? t('hide') : t('show')}
      </button>
    </div>
  );
}