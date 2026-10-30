/**
 * Structured, bounded, read-only access to a terminal's text for programs (agents, tests, tooling).
 *
 * It reads through the public xterm-style buffer API only, so it does not depend on how the terminal is rendered.
 * Everything it returns is plain JSON-serializable data. Terminal text is untrusted: whatever program wrote it controls
 * every character, so callers that pass it to a model must treat it as data, never as instructions.
 */

import type { IBuffer } from '../interfaces';

/** The slice of Terminal the reader needs. Terminal satisfies it. */
export interface ReadableTerminal {
  readonly cols: number;
  readonly rows: number;
  readonly title: string;
  readonly writeRevision: number;
  readonly buffer: { readonly active: IBuffer };
}

export const DEFAULT_OUTPUT_LINES = 200;
export const MAX_OUTPUT_LINES = 1000;
export const DEFAULT_OUTPUT_CHARS = 20_000;
export const MAX_OUTPUT_CHARS = 100_000;

export interface ScreenSnapshot {
  /** Changes whenever the terminal was written to or reset; equal values mean the same content. */
  revision: number;
  cols: number;
  rows: number;
  title: string;
  /** Which buffer is showing. A full-screen program (editor, pager) normally uses the alternate buffer. */
  buffer: 'normal' | 'alternate';
  cursor: { x: number; y: number };
  /** Lines of history above the screen (always 0 for the alternate buffer). */
  scrollbackLines: number;
  /** Exactly `rows` entries, one per screen row with trailing spaces trimmed; blank rows are kept as ''. */
  lines: string[];
}

export interface OutputOptions {
  /** Maximum lines to return (default 200, at most 1000). */
  lines?: number;
  /** Lines to skip from the newest end, to page back through history (default 0). */
  offset?: number;
  /** Character budget across all returned lines (default 20000, at most 100000). */
  maxChars?: number;
}

export interface OutputPage {
  revision: number;
  buffer: 'normal' | 'alternate';
  /** Number of lines of content in the buffer, not counting blank rows below the cursor. */
  totalLines: number;
  /** Index (0 = oldest retained line) of the first returned line in the buffer at this revision. */
  firstLine: number;
  /** Lines oldest to newest; each is one terminal row, so a wrapped command line spans several entries. */
  lines: string[];
  /** True when the character budget stopped the page before `lines` was reached. */
  truncated: boolean;
  /** Pass this as `offset` to get the next older page, or null when the oldest retained line was returned. */
  nextOffset: number | null;
}

function boundedInt(value: unknown, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer`);
  }
  if (value < min || value > max) {
    throw new RangeError(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function lineText(buffer: IBuffer, index: number): string {
  return buffer.getLine(index)?.translateToString(true) ?? '';
}

export class TerminalReader {
  constructor(private readonly terminal: ReadableTerminal) {}

  readScreen(): ScreenSnapshot {
    const { terminal } = this;
    const buffer = terminal.buffer.active;
    const rows = terminal.rows;
    // The screen is always the last `rows` lines, whether or not the viewport is scrolled back.
    const top = Math.max(0, buffer.length - rows);
    const lines: string[] = [];
    for (let y = 0; y < rows; y++) lines.push(lineText(buffer, top + y));

    return {
      revision: terminal.writeRevision,
      cols: terminal.cols,
      rows,
      title: terminal.title,
      buffer: buffer.type,
      cursor: { x: buffer.cursorX, y: buffer.cursorY },
      scrollbackLines: top,
      lines,
    };
  }

  /**
   * Returns a page of text counted back from the newest line. Paging is approximate while output is still arriving,
   * because history shifts; compare `revision` across pages to detect that.
   */
  readOutput(options: OutputOptions = {}): OutputPage {
    const { terminal } = this;
    const maxLines = boundedInt(options.lines, DEFAULT_OUTPUT_LINES, 1, MAX_OUTPUT_LINES, 'lines');
    const offset = boundedInt(options.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'offset');
    const maxChars = boundedInt(options.maxChars, DEFAULT_OUTPUT_CHARS, 1, MAX_OUTPUT_CHARS, 'maxChars');

    const buffer = terminal.buffer.active;
    const revision = terminal.writeRevision;
    const end = this.contentEnd(buffer, terminal.rows);

    const newest = end - offset; // exclusive index of the newest line in this page
    const collected: string[] = [];
    let chars = 0;
    let truncated = false;
    let index = newest - 1;
    while (index >= 0 && collected.length < maxLines) {
      let text = lineText(buffer, index);
      if (chars + text.length > maxChars) {
        // Always return something, but never more than the budget.
        if (collected.length === 0) {
          text = text.slice(-maxChars);
          // Never start on the second half of a surrogate pair.
          if (/^[\udc00-\udfff]/.test(text)) text = text.slice(1);
          truncated = true;
        }
        else {
          truncated = true;
          break;
        }
      }
      chars += text.length;
      collected.push(text);
      index--;
    }
    collected.reverse();

    const firstLine = Math.max(0, index + 1);
    return {
      revision,
      buffer: buffer.type,
      totalLines: end,
      firstLine: newest > 0 ? firstLine : 0,
      lines: collected,
      truncated,
      nextOffset: index >= 0 ? end - (index + 1) : null,
    };
  }

  /** Index just past the last line worth reporting: skips the blank rows under the prompt on a mostly empty screen. */
  private contentEnd(buffer: IBuffer, rows: number): number {
    const length = buffer.length;
    const top = Math.max(0, length - rows);
    let end = length;
    while (end > top && lineText(buffer, end - 1) === '') end--;
    // The cursor row counts as content even when it is empty (a fresh prompt line).
    return Math.max(end, Math.min(length, top + buffer.cursorY + 1));
  }
}
