/** Owned native/WASM terminal engine binding. No upstream engine ABI is used. */
import { CellFlags, DirtyState, KeyAction, KeyEncoderOption } from './types';
import type { AkittyWasmExports, KeyEvent, KittyKeyFlags, RenderStateColors, RenderStateCursor, RGB, TerminalCell, TerminalConfig } from './types';
export { CellFlags, DirtyState, KeyEncoderOption } from './types';
export type { TerminalCell, TerminalConfig } from './types';
export type EngineEvent = { type: 'title'; title: string } | { type: 'bell'; count: number };

const utf8 = new TextEncoder();
const text = new TextDecoder();
const WORDS_PER_CELL = 8;
const CELL_BYTES = WORDS_PER_CELL * 4;
const WRITE_LIMIT = 1 << 20;
const rgb = (color: number): RGB => ({ r: (color >>> 16) & 255, g: (color >>> 8) & 255, b: color & 255 });
const now = (): number => typeof performance === 'undefined' ? Date.now() : performance.now();

export class AkittyEngine {
  private readonly exports: AkittyWasmExports;
  constructor(instance: WebAssembly.Instance) {
    this.exports = instance.exports as AkittyWasmExports;
    if (this.exports.akitty_vt_abi_version?.() !== 1 || ['akitty_vt_buffer_get', 'akitty_vt_buffer_line', 'akitty_vt_buffer_wrapped', 'akitty_vt_buffer_text', 'akitty_vt_wrap_padding', 'akitty_vt_row_id', 'akitty_vt_find_row'].some(name => typeof this.exports[name] !== 'function')) throw new Error('Unsupported AkiTTY VT WASM ABI');
  }
  static async load(path?: string | URL): Promise<AkittyEngine> {
    const url = path === undefined ? new URL('../akitty-vt.wasm', import.meta.url) : path;
    let bytes: Uint8Array;
    const location = String(url);
    if (typeof process !== 'undefined' && process.versions?.node && (path === undefined || !/^https?:/i.test(location))) {
      const { readFile } = await import('node:fs/promises');
      // Vite may rewrite the browser asset URL to localhost during tests. Resolve
      // Node's default relative to the module URL without that asset transform.
      const source = path === undefined ? new URL('../akitty-vt.wasm', new URL(import.meta.url))
        : location.startsWith('file:') ? new URL(location) : location;
      bytes = await readFile(source);
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`AkiTTY VT WASM load failed (${response.status})`);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    const module = await WebAssembly.compile(bytes as BufferSource);
    if (WebAssembly.Module.imports(module).length !== 0) throw new Error('AkiTTY VT WASM unexpectedly requires host imports');
    return new AkittyEngine(await WebAssembly.instantiate(module));
  }
  createTerminal(cols = 80, rows = 24, config?: TerminalConfig): AkittyTerminal {
    return new AkittyTerminal(this.exports, cols, rows, config);
  }
  createKeyEncoder(): KeyEncoder { return new KeyEncoder(this.exports); }
  get unicodeVersion(): string { const version = this.exports.akitty_vt_unicode_version(); return `${version >>> 16}.${(version >>> 8) & 255}`; }
}

/** A reusable WASM allocation. Views are obtained after calls that can grow memory. */
class ByteBuffer {
  pointer = 0;
  capacity = 0;
  constructor(private readonly source: AkittyWasmExports | (() => AkittyWasmExports)) {}
  private get api(): AkittyWasmExports { return typeof this.source === 'function' ? this.source() : this.source; }
  reserve(bytes: number): number {
    if (bytes <= this.capacity) return this.pointer;
    const capacity = Math.max(256, bytes);
    const pointer = this.api.akitty_vt_alloc(capacity);
    if (!pointer) throw new Error('AkiTTY VT buffer allocation failed');
    this.dispose(); this.pointer = pointer; this.capacity = capacity;
    return pointer;
  }
  dispose(): void {
    if (this.pointer) this.api.akitty_vt_free(this.pointer, this.capacity);
    this.pointer = 0; this.capacity = 0;
  }
}

export class KeyEncoder {
  private options = 1 << 10;
  private closed = false;
  private readonly input: ByteBuffer;
  private readonly output: ByteBuffer;
  constructor(private readonly api: AkittyWasmExports) { this.input = new ByteBuffer(api); this.output = new ByteBuffer(api); }
  setOption(option: KeyEncoderOption, value: boolean | number): void {
    if (option === KeyEncoderOption.KITTY_KEYBOARD_FLAGS) { this.options = (this.options & ~31) | (Number(value) & 31); return; }
    const bit = option === KeyEncoderOption.CURSOR_KEY_APPLICATION ? 8 : option === KeyEncoderOption.KEYPAD_KEY_APPLICATION ? 9
      : option === KeyEncoderOption.ALT_ESC_PREFIX ? 10 : option === KeyEncoderOption.MODIFY_OTHER_KEYS_STATE_2 ? 11 : -1;
    if (bit >= 0) this.options = value ? this.options | (1 << bit) : this.options & ~(1 << bit);
  }
  setKittyFlags(flags: KittyKeyFlags): void { this.setOption(KeyEncoderOption.KITTY_KEYBOARD_FLAGS, flags); }
  encode(event: KeyEvent): Uint8Array {
    if (this.closed || event.composing) return new Uint8Array();
    const bytes = utf8.encode(event.utf8 ?? '');
    if (bytes.length > 4096) return new Uint8Array();
    const input = this.input.reserve(Math.max(1, bytes.length));
    const output = this.output.reserve(16384);
    new Uint8Array(this.api.memory.buffer, input, bytes.length).set(bytes);
    const action = event.action === KeyAction.RELEASE ? 3 : event.action === KeyAction.REPEAT ? 2 : 1;
    const written = this.api.akitty_vt_key(event.unshiftedCodepoint || event.key, event.shiftedCodepoint ?? 0, event.baseLayoutCodepoint ?? 0, event.mods, action, this.options,
      input, bytes.length, output, this.output.capacity);
    return new Uint8Array(this.api.memory.buffer, output, written).slice();
  }
  dispose(): void { if (!this.closed) { this.closed = true; this.input.dispose(); this.output.dispose(); } }
}

function emptyCell(): TerminalCell {
  return { codepoint: 32, fg_r: 0, fg_g: 0, fg_b: 0, bg_r: 0, bg_g: 0, bg_b: 0, flags: 0, width: 1, hyperlink_id: 0, grapheme_len: 0 };
}

export class AkittyTerminal {
  static readonly RESPONSE_READ_MAX = 65536;
  static readonly HYPERLINK_URI_MAX = 8192;
  private handle: number;
  private _cols: number;
  private _rows: number;
  private readonly writeBytes: ByteBuffer;
  private readonly viewportBytes: ByteBuffer;
  private readonly historyBytes: ByteBuffer;
  private readonly textBytes: ByteBuffer;
  private readonly replyBytes: ByteBuffer;
  private readonly eventBytes: ByteBuffer;
  private handleEvent?: (event: EngineEvent) => void;
  private readonly pendingEvents: { event: EngineEvent; handler?: (event: EngineEvent) => void }[] = [];
  private dispatchingEvents = false;
  private cellPool: TerminalCell[] = [];
  private rowViews: TerminalCell[][] = [];
  private rowParsed = new Uint8Array();
  private viewportValid = false;
  private full = true;
  private alternate = false;

  constructor(private exports: AkittyWasmExports, cols = 80, rows = 24, config?: TerminalConfig) {
    AkittyTerminal.validate(cols, rows);
    this._cols = cols; this._rows = rows;
    const api = (): AkittyWasmExports => this.exports;
    this.writeBytes = new ByteBuffer(api); this.viewportBytes = new ByteBuffer(api);
    this.historyBytes = new ByteBuffer(api); this.textBytes = new ByteBuffer(api); this.replyBytes = new ByteBuffer(api);
    this.eventBytes = new ByteBuffer(api);
    this.handle = exports.akitty_vt_create(cols, rows, Math.max(0, Math.min(100000, Math.floor(config?.scrollbackLimit ?? 10000))));
    if (!this.handle) throw new Error('AkiTTY VT terminal allocation failed');
    this.setTheme(config ?? {});
    this.initializeRows();
  }
  /** Update the host reset palette while retaining screen content and OSC overrides. */
  setTheme(config: Pick<TerminalConfig, 'fgColor' | 'bgColor' | 'cursorColor' | 'palette'>): void {
    if (!this.handle) return;
    for (const [index, color] of [[256, config.fgColor], [257, config.bgColor], [258, config.cursorColor]] as const) {
      if (color !== undefined) this.exports.akitty_vt_color(this.handle, index, color);
    }
    config.palette?.slice(0, 16).forEach((color, index) => this.exports.akitty_vt_color(this.handle, index, color));
    this.invalidate(); this.full = true;
  }
  private static validate(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 4096 || rows > 4096 || cols * rows > 1048576) {
      throw new RangeError(`Invalid terminal size ${cols}x${rows}`);
    }
  }
  private initializeRows(): void {
    this.cellPool = Array.from({ length: this._cols * this._rows }, emptyCell);
    this.rowViews = Array.from({ length: this._rows }, (_, row) => this.cellPool.slice(row * this._cols, (row + 1) * this._cols));
    this.rowParsed = new Uint8Array(this._rows);
    this.viewportValid = false; this.full = true;
  }
  get cols(): number { return this._cols; }
  get rows(): number { return this._rows; }
  get isFreed(): boolean { return this.handle === 0; }
  private field(field: number): number { return this.handle ? this.exports.akitty_vt_get(this.handle, field) >>> 0 : 0; }
  private invalidate(): void { this.viewportValid = false; this.rowParsed.fill(0); }

  write(data: string | Uint8Array, onEvent?: (event: EngineEvent) => void): void {
    if (!this.handle) return;
    const bytes = typeof data === 'string' ? utf8.encode(data) : data;
    this.handleEvent = onEvent;
    if (!bytes.length) return;
    const pointer = this.writeBytes.reserve(Math.min(WRITE_LIMIT, Math.max(8192, bytes.length)));
    for (let from = 0; from < bytes.length; from += this.writeBytes.capacity) {
      const chunk = bytes.subarray(from, from + this.writeBytes.capacity);
      new Uint8Array(this.exports.memory.buffer, pointer, chunk.length).set(chunk);
      if (!this.exports.akitty_vt_write(this.handle, pointer, chunk.length, now())) throw new Error('AkiTTY VT rejected output');
      // External callbacks may read, resize or dispose the terminal, or throw.
      // Publish the new state before handing control back to them.
      this.invalidate();
      const alternate = this.isAlternateScreen();
      if (alternate !== this.alternate) { this.full = true; this.alternate = alternate; }
      // A nested write can replace the remembered callback. Each subsequent chunk
      // still delivers its event batch to this write's callback.
      this.handleEvent = onEvent;
      this.drainEvents();
      if (!this.handle) return;
    }
  }
  resize(cols: number, rows: number): void {
    if (!this.handle) return;
    AkittyTerminal.validate(cols, rows);
    if (!this.exports.akitty_vt_resize(this.handle, cols, rows)) throw new Error('AkiTTY VT rejected resize');
    this._cols = cols; this._rows = rows; this.initializeRows();
  }
  free(): void {
    if (!this.handle) return;
    this.exports.akitty_vt_destroy(this.handle); this.handle = 0;
    for (const buffer of [this.writeBytes, this.viewportBytes, this.historyBytes, this.textBytes, this.replyBytes, this.eventBytes]) buffer.dispose();
    this.cellPool = []; this.rowViews = []; this.rowParsed = new Uint8Array(); this.viewportValid = false;
    this.pendingEvents.length = 0;
  }
  update(): DirtyState {
    if (!this.handle) return DirtyState.NONE;
    if (this.exports.akitty_vt_tick(this.handle, now())) { this.invalidate(); this.drainEvents(); }
    return this.full ? DirtyState.FULL : this.isDirty() ? DirtyState.PARTIAL : DirtyState.NONE;
  }
  isDirty(): boolean { return !!this.field(14); }
  needsFullRedraw(): boolean { return this.full; }
  isRowDirty(row: number): boolean { return !!this.handle && Number.isInteger(row) && row >= 0 && row < this._rows && !!this.exports.akitty_vt_dirty(this.handle, row); }
  clearDirty(): void { if (this.handle) { this.exports.akitty_vt_clean(this.handle); this.full = false; } }
  markClean(): void { this.clearDirty(); }
  private drainEvents(): void {
    if (!this.handle || !this.field(17)) return;
    const pointer = this.eventBytes.reserve(8192);
    const handler = this.handleEvent;
    // Drain before dispatch: a reentrant write must not consume this write's
    // remaining events through a different callback or reuse its event buffer.
    while (this.handle) {
      const length = this.exports.akitty_vt_event(this.handle, pointer, this.eventBytes.capacity);
      if (!length) break;
      const bytes = new Uint8Array(this.exports.memory.buffer, pointer, length);
      if (bytes[0] === 1) this.pendingEvents.push({ handler, event: { type: 'title', title: text.decode(bytes.subarray(1)) } });
      else if (bytes[0] === 2) this.pendingEvents.push({ handler, event: { type: 'bell', count: new DataView(bytes.buffer, bytes.byteOffset + 1, 4).getUint32(0, true) } });
    }
    if (this.dispatchingEvents) return;
    this.dispatchingEvents = true;
    let consumed = 0, failed = false, failure: unknown;
    try {
      while (this.handle && consumed < this.pendingEvents.length) {
        const next = this.pendingEvents[consumed++];
        try { next.handler?.(next.event); }
        catch (error) { if (!failed) { failed = true; failure = error; } }
      }
    } finally {
      this.pendingEvents.splice(0, consumed);
      this.dispatchingEvents = false;
    }
    if (failed) throw failure;
  }
  getDimensions(): { cols: number; rows: number } { return { cols: this._cols, rows: this._rows }; }
  getCursor(): RenderStateCursor {
    const x = this.field(2), y = this.field(3), shape = this.field(15);
    return { x, y, viewportX: x, viewportY: y, visible: !!this.field(4), blinking: !!this.field(16), style: shape >= 5 ? 'bar' : shape >= 3 ? 'underline' : 'block' };
  }
  getColors(): RenderStateColors { return { foreground: rgb(this.field(9)), background: rgb(this.field(10)), cursor: this.field(18) === 0xffffffff ? null : rgb(this.field(18)) }; }
  getMode(mode: number, ansi = false): boolean {
    return !!this.handle && Number.isInteger(mode) && mode >= 0 && mode <= 65535 && !!this.exports.akitty_vt_mode(this.handle, mode, Number(ansi));
  }
  isAlternateScreen(): boolean { return !!this.field(5); }
  hasBracketedPaste(): boolean { return this.getMode(2004); }
  hasFocusEvents(): boolean { return this.getMode(1004); }
  hasMouseTracking(): boolean { return this.getMode(1000) || this.getMode(1002) || this.getMode(1003); }
  getScrollbackLength(): number { return this.field(6); }
  getKeyboardFlags(): number { return this.field(8); }
  getSyncDeadline(): number | null { const deadline = this.handle ? this.exports.akitty_vt_deadline(this.handle) : -1; return deadline < 0 ? null : deadline; }
  private loadViewport(): boolean {
    if (!this.handle) return false;
    if (this.viewportValid) return true;
    const size = this._cols * this._rows * CELL_BYTES;
    const pointer = this.viewportBytes.reserve(size);
    if (this.exports.akitty_vt_viewport(this.handle, pointer, size) !== size) return false;
    this.viewportValid = true; this.rowParsed.fill(0); return true;
  }
  private decodeCell(view: DataView, offset: number, target: TerminalCell): void {
    const fg = view.getUint32(offset + 4, true), bg = view.getUint32(offset + 8, true), flags = view.getUint32(offset + 12, true);
    const width = view.getUint32(offset + 20, true), underline = (flags >>> 8) & 7;
    target.codepoint = width === 0 ? 0 : view.getUint32(offset, true);
    target.fg_r = fg >>> 16; target.fg_g = (fg >>> 8) & 255; target.fg_b = fg & 255;
    target.bg_r = bg >>> 16; target.bg_g = (bg >>> 8) & 255; target.bg_b = bg & 255;
    target.flags = (flags & 3) | (flags & 4 ? CellFlags.FAINT : 0) | (flags & 8 ? CellFlags.INVERSE : 0)
      | (flags & 16 ? CellFlags.INVISIBLE : 0) | (flags & 32 ? CellFlags.STRIKETHROUGH : 0) | (flags & 64) | (underline ? CellFlags.UNDERLINE : 0);
    target.width = width; target.hyperlink_id = view.getUint32(offset + 24, true); target.grapheme_len = view.getUint32(offset + 28, true);
    target.underline_style = underline;
    const color = view.getUint32(offset + 16, true); target.underline_color = color === 0xffffffff ? undefined : color;
  }
  getLineView(row: number): TerminalCell[] | null {
    if (!this.handle || !Number.isInteger(row) || row < 0 || row >= this._rows) return null;
    if (!this.rowParsed[row] && !this.loadViewport()) return null;
    if (!this.rowParsed[row]) {
      const view = new DataView(this.exports.memory.buffer, this.viewportBytes.pointer, this.viewportBytes.capacity);
      for (let col = 0; col < this._cols; col++) this.decodeCell(view, (row * this._cols + col) * CELL_BYTES, this.cellPool[row * this._cols + col]);
      this.rowParsed[row] = 1;
    }
    return this.rowViews[row];
  }
  /** Fetch sparse render damage without materializing an entire viewport. */
  prepareRows(rows: ReadonlySet<number>): void {
    if (!this.handle || this.viewportValid || rows.size > Math.max(1, Math.floor(this._rows / 4))) return;
    const size = this._cols * CELL_BYTES;
    const pointer = this.historyBytes.reserve(size);
    for (const row of rows) {
      if (!Number.isInteger(row) || row < 0 || row >= this._rows || this.rowParsed[row]) continue;
      if (this.exports.akitty_vt_line(this.handle, row, pointer, size) !== size) continue;
      const view = new DataView(this.exports.memory.buffer, pointer, size);
      for (let col = 0; col < this._cols; col++) this.decodeCell(view, col * CELL_BYTES, this.cellPool[row * this._cols + col]);
      this.rowParsed[row] = 1;
    }
  }
  getBufferField(alternate: boolean, field: number): number {
    return this.handle ? this.exports.akitty_vt_buffer_get(this.handle, Number(alternate), field) >>> 0 : 0;
  }
  /** Rows are relative to the selected screen; negative rows address its history. */
  getBufferLine(alternate: boolean, row: number): TerminalCell[] | null {
    if (!this.handle || !Number.isInteger(row) || row >= this._rows || row < -this.getBufferField(alternate, 6)) return null;
    if (alternate === this.isAlternateScreen()) return row < 0 ? this.getScrollbackLine(row + this.getScrollbackLength()) : this.getLine(row);
    const size = this._cols * CELL_BYTES, pointer = this.historyBytes.reserve(size);
    if (this.exports.akitty_vt_buffer_line(this.handle, Number(alternate), row, pointer, size) !== size) return null;
    const view = new DataView(this.exports.memory.buffer, pointer, size);
    return Array.from({ length: this._cols }, (_, col) => { const cell = emptyCell(); this.decodeCell(view, col * CELL_BYTES, cell); return cell; });
  }
  isBufferRowWrapped(alternate: boolean, row: number): boolean {
    return !!this.handle && Number.isInteger(row) && row < this._rows && row >= -this.getBufferField(alternate, 6)
      && !!this.exports.akitty_vt_buffer_wrapped(this.handle, Number(alternate), row);
  }
  getBufferGrapheme(alternate: boolean, row: number, col: number): number[] | null {
    if (!this.handle || !Number.isInteger(row) || !Number.isInteger(col) || col < 0 || col >= this._cols || row >= this._rows || row < -this.getBufferField(alternate, 6)) return null;
    const pointer = this.textBytes.reserve(8192);
    const count = this.exports.akitty_vt_buffer_text(this.handle, Number(alternate), row, col, pointer, this.textBytes.capacity);
    return count ? Array.from(text.decode(new Uint8Array(this.exports.memory.buffer, pointer, count)), ch => ch.codePointAt(0)!) : null;
  }
  getLine(row: number): TerminalCell[] | null { return this.getLineView(row)?.map(cell => ({ ...cell })) ?? null; }
  getViewport(): TerminalCell[] { for (let row = 0; row < this._rows; row++) this.getLineView(row); return this.cellPool.map(cell => ({ ...cell })); }
  getScrollbackLine(offset: number): TerminalCell[] | null {
    const length = this.getScrollbackLength();
    if (!this.handle || !Number.isInteger(offset) || offset < 0 || offset >= length) return null;
    const size = this._cols * CELL_BYTES, pointer = this.historyBytes.reserve(size);
    if (this.exports.akitty_vt_line(this.handle, offset - length, pointer, size) !== size) return null;
    const view = new DataView(this.exports.memory.buffer, pointer, size);
    return Array.from({ length: this._cols }, (_, col) => { const cell = emptyCell(); this.decodeCell(view, col * CELL_BYTES, cell); return cell; });
  }
  isRowWrapped(row: number): boolean { return !!this.handle && Number.isInteger(row) && row >= 0 && row < this._rows && !!this.exports.akitty_vt_wrapped(this.handle, row); }
  getRevision(): number { return this.field(7); }
  getRowId(row: number): bigint | undefined {
    if (!this.handle || !Number.isInteger(row) || row < -this.getScrollbackLength() || row >= this._rows) return undefined;
    return this.exports.akitty_vt_row_id(this.handle, row) || undefined;
  }
  findRow(rowId: bigint): number | undefined {
    if (!this.handle) return undefined;
    const row = this.exports.akitty_vt_find_row(this.handle, rowId);
    return row ? row - 1 : undefined;
  }
  hasWrapPadding(row: number): boolean {
    return !!this.handle && Number.isInteger(row) && row >= -this.getScrollbackLength() && row < this._rows
      && !!this.exports.akitty_vt_wrap_padding(this.handle, row);
  }
  isScrollbackRowWrapped(offset: number): boolean {
    const length = this.getScrollbackLength();
    return !!this.handle && Number.isInteger(offset) && offset >= 0 && offset < length && !!this.exports.akitty_vt_wrapped(this.handle, offset - length);
  }
  private readText(row: number, col: number, kind: number, limit = 8192): string | null {
    if (!this.handle || !Number.isInteger(row) || !Number.isInteger(col) || col < 0 || col >= this._cols || row < -this.getScrollbackLength() || row >= this._rows || !(limit > 0)) return null;
    const pointer = this.textBytes.reserve(8192);
    const count = this.exports.akitty_vt_text(this.handle, row, col, kind, pointer, Math.min(8192, Math.floor(limit)));
    return count > 0 ? text.decode(new Uint8Array(this.exports.memory.buffer, pointer, count)) : null;
  }
  getHyperlinkUri(row: number, col: number, history = false, maxBytes = AkittyTerminal.HYPERLINK_URI_MAX): string | null {
    return this.readText(history ? row - this.getScrollbackLength() : row, col, 1, maxBytes);
  }
  getGraphemeString(row: number, col: number): string { return this.readText(row, col, 0) ?? ''; }
  getGrapheme(row: number, col: number): number[] | null { const value = this.readText(row, col, 0); return value === null ? null : Array.from(value, ch => ch.codePointAt(0)!); }
  getScrollbackGraphemeString(offset: number, col: number): string { return this.readText(offset - this.getScrollbackLength(), col, 0) ?? ''; }
  getScrollbackGrapheme(offset: number, col: number): number[] | null {
    const value = this.readText(offset - this.getScrollbackLength(), col, 0); return value === null ? null : Array.from(value, ch => ch.codePointAt(0)!);
  }
  hasResponse(): boolean { return this.field(11) > 0; }
  readResponse(maxBytes = AkittyTerminal.RESPONSE_READ_MAX): string | null {
    if (!this.handle || !this.hasResponse()) return null;
    const limit = Math.max(0, Math.min(AkittyTerminal.RESPONSE_READ_MAX, Math.floor(maxBytes)));
    const pointer = this.replyBytes.reserve(AkittyTerminal.RESPONSE_READ_MAX);
    const count = this.exports.akitty_vt_replies(this.handle, pointer, AkittyTerminal.RESPONSE_READ_MAX);
    const bytes = new Uint8Array(this.exports.memory.buffer, pointer, Math.min(limit, count));
    if (bytes.length < count || count === AkittyTerminal.RESPONSE_READ_MAX) {
      // A caller limit or a full core queue can cut a UTF-8 scalar. Return the complete prefix
      // and clear the decoder's pending bytes, since the next read starts a different reply.
      const prefix = text.decode(bytes, { stream: true });
      text.decode();
      return prefix;
    }
    return text.decode(bytes);
  }
}
