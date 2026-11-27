import type { Locale } from '@/i18n/config';
import { getAtPath } from '@/lib/tests/helpers/get-at-path';
import en from '@/messages/en.json';
import pl from '@/messages/pl.json';
import uk from '@/messages/uk.json';

const messages = { en, pl, uk };

export function createLocaleTranslator(locale: Locale, namespace: string) {
  const scopedMessages = getAtPath(messages[locale], namespace.split('.'));
  if (
    !scopedMessages ||
    typeof scopedMessages !== 'object' ||
    Array.isArray(scopedMessages)
  ) {
    throw new Error(`MISSING_NAMESPACE:${namespace}`);
  }

  return (key: string, values?: Record<string, string | number | Date>) => {
    const message = getAtPath(
      scopedMessages as Record<string, unknown>,
      key.split('.')
    );
    if (typeof message !== 'string') {
      throw new Error(`MISSING_MESSAGE:${namespace}.${key}`);
    }

    return message.replace(/\{(\w+)\}/g, (match, name: string) =>
      values && name in values ? String(values[name]) : match
    );
  };
}
