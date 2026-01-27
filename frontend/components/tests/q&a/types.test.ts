import { describe, it, expect } from 'vitest';

import { qaConstants } from '@/components/q&a/types';

describe('qaConstants', () => {
  it('exposes supported locales', () => {
    expect(qaConstants.supportedLocales).toEqual(['uk', 'en', 'pl']);
  });
});
