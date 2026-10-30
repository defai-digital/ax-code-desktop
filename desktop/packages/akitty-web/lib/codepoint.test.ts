import { describe, expect, test } from 'vitest';
import { cellChar, graphemeString, isRenderableCodepoint } from './codepoint';

describe('codepoint guards', () => {
  test('renders valid codepoints unchanged', () => {
    expect(cellChar(0x41)).toBe('A');
    expect(cellChar(0x1f600)).toBe('😀');
    expect(graphemeString([0x1f468, 0x200d, 0x1f4bb])).toBe('👨‍💻');
  });

  test('replaces empty, out-of-range and surrogate codepoints with a space instead of throwing', () => {
    for (const codepoint of [0, -1, 0x110000, 0xd800, 0xdfff, null, undefined]) {
      expect(isRenderableCodepoint(codepoint)).toBe(false);
      expect(cellChar(codepoint)).toBe(' ');
    }
    expect(graphemeString([0x61, 0x110000, 0x62])).toBe('a b');
  });
});
