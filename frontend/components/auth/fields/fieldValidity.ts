import type { FormEvent } from 'react';

export function setRequiredValidity(
  input: HTMLInputElement,
  getMessage: () => string
): boolean {
  if (!input.validity.valueMissing) return false;

  input.setCustomValidity(getMessage());
  return true;
}

export function clearCustomValidity(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.setCustomValidity('');
}
