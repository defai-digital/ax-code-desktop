/**
 * URL Detection Tests
 *
 * Tests for the UrlRegexProvider to ensure plain text URLs
 * are correctly detected and made clickable.
 */

import { describe, expect, test } from 'bun:test';
import { UrlRegexProvider } from './providers/url-regex-provider';
import { createIsolatedTerminal } from './test-helpers';
import type { ILink } from './types';

/**
 * Mock terminal for testing
 */
function createMockTerminal(lineText: string) {
  const cells = Array.from(lineText).map((char) => ({
    getCodepoint: () => char.codePointAt(0) || 0,
  }));

  return {
    buffer: {
      active: {
        getLine: (y: number) => {
          if (y !== 0) return undefined;
          return {
            length: cells.length,
            getCell: (x: number) => cells[x],
          };
        },
      },
    },
  };
}

/**
 * Helper to get links from provider
 */
function getLinks(lineText: string): Promise<ILink[] | undefined> {
  const terminal = createMockTerminal(lineText) as any;
  const provider = new UrlRegexProvider(terminal);

  return new Promise((resolve) => {
    provider.provideLinks(0, resolve);
  });
}

/**
 * Mock terminal from explicit cell codepoints. A zero entry models the spacer
 * cell a wide character leaves behind in a real buffer.
 */
function createCellTerminal(codepoints: number[]) {
  return {
    buffer: {
      active: {
        getLine: (y: number) => {
          if (y !== 0) return undefined;
          return {
            length: codepoints.length,
            getCell: (x: number) => {
              const codepoint = codepoints[x];
              return codepoint === undefined ? undefined : { getCodepoint: () => codepoint };
            },
          };
        },
      },
    },
  };
}

/**
 * Helper to get links from an explicit cell sequence
 */
function getLinksFromCells(codepoints: number[]): Promise<ILink[] | undefined> {
  const terminal = createCellTerminal(codepoints) as any;
  const provider = new UrlRegexProvider(terminal);

  return new Promise((resolve) => {
    provider.provideLinks(0, resolve);
  });
}

describe('URL Detection', () => {
  test('accepts short destinations for every supported protocol', async () => {
    for (const url of ['http://a', 'https://a', 'ftp://a', 'ssh://a', 'git://a', 'tel:123', 'news:x', 'mailto:a', 'magnet:x', 'gemini://a', 'gopher://a']) {
      const links = await getLinks(`See ${url}.`);
      expect(links?.map((link) => link.text)).toEqual([url]);
      expect(links?.[0].range.start.x).toBe(4);
      expect(links?.[0].range.end.x).toBe(4 + url.length - 1);
    }
  });

  test('rejects schemes without a destination after punctuation is removed', async () => {
    for (const scheme of ['http://', 'https://', 'tel:', 'news:', 'mailto:', 'gemini://']) {
      expect(await getLinks(`${scheme}...`)).toBeUndefined();
    }
  });

  test('detects HTTPS URLs', async () => {
    const links = await getLinks('Visit https://github.com for code');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://github.com');
    expect(links?.[0].range.start.x).toBe(6);
    // End is inclusive - last character is at index 23 (https://github.com is 19 chars, starts at 6)
    expect(links?.[0].range.end.x).toBe(23);
  });

  test('detects HTTP URLs', async () => {
    const links = await getLinks('Check http://example.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('http://example.com');
  });

  test('detects mailto: links', async () => {
    const links = await getLinks('Email: mailto:test@example.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('mailto:test@example.com');
  });

  test('detects ssh:// URLs', async () => {
    const links = await getLinks('Connect via ssh://user@server.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('ssh://user@server.com');
  });

  test('detects git:// URLs', async () => {
    const links = await getLinks('Clone git://github.com/repo.git');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('git://github.com/repo.git');
  });

  test('detects ftp:// URLs', async () => {
    const links = await getLinks('Download ftp://files.example.com/file');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('ftp://files.example.com/file');
  });

  test('strips trailing period', async () => {
    const links = await getLinks('Check https://example.com.');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
    // Should NOT include the trailing period
    expect(links?.[0].text.endsWith('.')).toBe(false);
  });

  test('strips trailing comma', async () => {
    const links = await getLinks('See https://example.com, or else');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
  });

  test('strips trailing parenthesis', async () => {
    const links = await getLinks('(see https://example.com)');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
  });

  test('strips trailing exclamation', async () => {
    const links = await getLinks('Visit https://example.com!');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
  });

  test('handles multiple URLs on same line', async () => {
    const links = await getLinks('https://a.com and https://b.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(2);
    expect(links?.[0].text).toBe('https://a.com');
    expect(links?.[1].text).toBe('https://b.com');
  });

  test('returns undefined when no URL present', async () => {
    const links = await getLinks('No URLs here');
    expect(links).toBeUndefined();
  });

  test('handles URLs with query parameters', async () => {
    const links = await getLinks('https://example.com?foo=bar&baz=qux');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com?foo=bar&baz=qux');
  });

  test('handles URLs with fragments', async () => {
    const links = await getLinks('https://example.com/page#section');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com/page#section');
  });

  test('handles URLs with ports', async () => {
    const links = await getLinks('https://example.com:8080/path');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com:8080/path');
  });

  test('does not detect file paths', async () => {
    const links = await getLinks('/tmp/example/file.txt');
    expect(links).toBeUndefined();
  });

  test('does not detect relative paths', async () => {
    const links = await getLinks('./relative/path');
    expect(links).toBeUndefined();
  });

  test('link has activate function', async () => {
    const links = await getLinks('https://example.com');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(typeof links?.[0].activate).toBe('function');
  });

  test('detects tel: URLs', async () => {
    const links = await getLinks('Call tel:+1234567890');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('tel:+1234567890');
  });

  test('detects magnet: URLs', async () => {
    const links = await getLinks('Download magnet:?xt=urn:btih:abc123');
    expect(links).toBeDefined();
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toContain('magnet:?xt=urn:btih:abc123');
  });
});

describe('URL ranges after astral characters', () => {
  test('converts UTF-16 offsets to cell columns after an astral prefix', async () => {
    const links = await getLinks('🚀 https://example.com');
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
    // "🚀" is two UTF-16 code units but one cell; the space is at cell 1.
    expect(links?.[0].range.start.x).toBe(2);
    expect(links?.[0].range.end.x).toBe(20);
  });

  test('keeps exact columns when the URL abuts an astral character', async () => {
    const links = await getLinks('🚀https://example.com');
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
    expect(links?.[0].range.start.x).toBe(1);
    expect(links?.[0].range.end.x).toBe(19);
  });

  test('accumulates the shift across multiple astral characters', async () => {
    const links = await getLinks('😀🚀 https://example.com');
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
    expect(links?.[0].range.start.x).toBe(3);
    expect(links?.[0].range.end.x).toBe(21);
  });

  test('strips trailing punctuation after an astral prefix', async () => {
    const links = await getLinks('🚀 https://example.com.');
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
    // The stripped period occupies cell 21, so the URL must end at cell 20.
    expect(links?.[0].range.start.x).toBe(2);
    expect(links?.[0].range.end.x).toBe(20);
  });

  test('maps around the spacer cell a wide character leaves behind', async () => {
    // U+1F310 occupies cells 0-1; cell 1 is the zero-width spacer cell.
    const codepoints = [0x1f310, 0, 0x20, ...Array.from('https://example.com', (c) => c.codePointAt(0) ?? 0)];
    const links = await getLinksFromCells(codepoints);
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
    expect(links?.[0].range.start.x).toBe(3);
    expect(links?.[0].range.end.x).toBe(21);
  });

  test('maps every match, not just the first, after an astral prefix', async () => {
    const links = await getLinks('🚀 https://a.com and https://b.com');
    expect(links?.length).toBe(2);
    expect(links?.[0].text).toBe('https://a.com');
    expect(links?.[0].range.start.x).toBe(2);
    expect(links?.[0].range.end.x).toBe(14);
    expect(links?.[1].text).toBe('https://b.com');
    expect(links?.[1].range.start.x).toBe(20);
    expect(links?.[1].range.end.x).toBe(32);
  });
});

describe('URL ranges after invalid cells', () => {
  test('keeps a URL resolvable after invalid raw codepoints', async () => {
    // A lone surrogate, a negative u32, and a value past U+10FFFF are all
    // invalid cell codepoints. Each must read as exactly one space, the way an
    // empty cell does, instead of throwing and killing the link callback.
    const codepoints = [
      0xd800,
      -5,
      0x110000,
      0x20,
      ...Array.from('https://example.com', (c) => c.codePointAt(0) ?? 0),
    ];
    const links = await getLinksFromCells(codepoints);
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
    // Three invalid cells plus the space occupy cells 0-3.
    expect(links?.[0].range.start.x).toBe(4);
    expect(links?.[0].range.end.x).toBe(22);
  });

  test('keeps UTF-16 offsets aligned after an invalid and an astral cell', async () => {
    // Cell 0 is invalid (one space), cell 1 is astral (two UTF-16 units in one
    // cell), cell 2 is invalid, and the URL starts at cell 3.
    const codepoints = [
      0xd800,
      0x1f310,
      0x110001,
      ...Array.from('https://example.com', (c) => c.codePointAt(0) ?? 0),
    ];
    const links = await getLinksFromCells(codepoints);
    expect(links?.length).toBe(1);
    expect(links?.[0].text).toBe('https://example.com');
    expect(links?.[0].range.start.x).toBe(3);
    expect(links?.[0].range.end.x).toBe(21);
  });
});


describe('complete terminal URL text', () => {
  test('keeps wide glyphs, combining text and both columns of a final wide glyph', async () => {
    const term = await createIsolatedTerminal({ cols: 80, rows: 2 });
    term.open(document.createElement('div'));
    const uri = 'https://example.test/中é😀';
    try {
      term.write('go ' + uri + ' tail');
      const provider = new UrlRegexProvider(term);
      const links = await new Promise<ILink[] | undefined>(resolve => provider.provideLinks(0, resolve));
      expect(links).toHaveLength(1);
      expect(links![0].text).toBe(uri);
      expect(links![0].range).toEqual({ start: { x: 3, y: 0 }, end: { x: 28, y: 0 } });
    } finally { term.dispose(); }
  });

  test('retains balanced URL delimiters while removing surrounding punctuation', async () => {
    for (const uri of ['https://example.test/a_(b)', 'http://[::1]']) {
      const links = await getLinks('(' + uri + ').');
      expect(links).toHaveLength(1);
      expect(links![0].text).toBe(uri);
    }
  });
});
