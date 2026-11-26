import { describe, expect, it } from 'vitest';

import { hexToRgba } from '@/components/q&a/hexToRgba';

describe('hexToRgba', () => {
  it.each(['#A1a1AA', 'a1a1aa'])('converts a six-digit hex color %s', hex => {
    expect(hexToRgba(hex, 0.22)).toBe('rgba(161, 161, 170, 0.22)');
  });

  it.each(['#abc', '#12g456', '12#3456'])(
    'falls back to black for an unsupported color %s',
    hex => {
      expect(hexToRgba(hex, 0.38)).toBe('rgba(0, 0, 0, 0.38)');
    }
  );
});
