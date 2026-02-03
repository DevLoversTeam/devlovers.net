import { describe, expect, it } from 'vitest';

import { qaConstants } from '@/components/q&a/types';

describe('qaConstants', () => {
  it('exposes supported locales', () => {
    expect(qaConstants.supportedLocales).toEqual(['uk', 'en', 'pl']);
  });
});
