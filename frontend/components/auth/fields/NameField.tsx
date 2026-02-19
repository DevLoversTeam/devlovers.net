'use client';

import { useTranslations } from 'next-intl';

type NameFieldProps = {
  name?: string;
  minLength?: number;
  maxLength?: number;
  onChange?: (value: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

export function NameField({
  name = 'name',
  minLength,
  maxLength,
  onChange,
  onBlur
}: NameFieldProps) {
  const t = useTranslations('auth.fields');

  const handleInvalid = (e: React.InvalidEvent<HTMLInputElement>) => {
    const input = e.currentTarget;

    if (input.validity.valueMissing) {
      input.setCustomValidity(t('validation.required'));
      return;
    }

    if (input.validity.tooShort && minLength) {
      input.setCustomValidity(`Name must be at least ${minLength} characters.`);
      return;
    }

    if (input.validity.tooLong && maxLength) {
      input.setCustomValidity(`Name must be at most ${maxLength} characters.`);
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
      name={name}
      type="text"
      placeholder={t('name')}
      required
      minLength={minLength}
      maxLength={maxLength}
      className="w-full rounded border px-3 py-2"
      onInvalid={handleInvalid}
      onInput={handleInput}
      onBlur={handleBlur}
      onChange={onChange ? e => onChange(e.currentTarget.value) : undefined}
    />
  );
}