// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { EmailField } from '@/components/auth/fields/EmailField';
import { NameField } from '@/components/auth/fields/NameField';
import { PasswordField } from '@/components/auth/fields/PasswordField';
import { PASSWORD_MAX_BYTES } from '@/lib/auth/signup-constraints';
import messages from '@/messages/uk.json';

const fields = messages.auth.fields;

function renderFields() {
  render(
    <NextIntlClientProvider
      locale="uk"
      messages={{ auth: { fields } }}
      timeZone="UTC"
    >
      <NameField />
      <EmailField />
      <PasswordField pattern="[A-Z].{7,}" />
    </NextIntlClientProvider>
  );
}

describe('auth field validity messages', () => {
  it.each([
    [fields.name, 'Анна'],
    [fields.email, 'anna@example.com'],
    [fields.password, 'Abcdefg!'],
  ])(
    'sets and clears the localized required message for %s',
    (label, value) => {
      renderFields();
      const input = screen.getByPlaceholderText<HTMLInputElement>(label);

      expect(input.checkValidity()).toBe(false);
      expect(input.validationMessage).toBe(fields.validation.required);

      fireEvent.input(input, { target: { value } });

      expect(input.checkValidity()).toBe(true);
      expect(input.validationMessage).toBe('');
    }
  );

  it('uses the email format message for a nonempty invalid address', () => {
    renderFields();
    const input = screen.getByPlaceholderText<HTMLInputElement>(fields.email);

    fireEvent.input(input, { target: { value: 'invalid-address' } });
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).toBe(fields.validation.invalidEmail);
  });

  it('enforces the password byte limit on input and restores native pattern validation after correction', () => {
    renderFields();
    const input = screen.getByPlaceholderText<HTMLInputElement>(
      fields.password
    );

    fireEvent.input(input, { target: { value: `A${'я'.repeat(36)}` } });
    expect(input.validationMessage).toBe(
      fields.validation.passwordTooLongBytes.replace(
        '{PASSWORD_MAX_BYTES}',
        String(PASSWORD_MAX_BYTES)
      )
    );

    fireEvent.input(input, { target: { value: 'abcdefg!' } });
    expect(input.validity.customError).toBe(false);
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).toMatch(/^Пароль має відповідати вимогам/);
  });
});
