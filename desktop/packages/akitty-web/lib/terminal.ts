/** Browser lifecycle and host policy around the shared AkiTTY terminal engine. */
import { AkittyEngine, AkittyTerminal, DirtyState } from './engine';
import type { EngineEvent } from './engine';
import { getEngine } from './runtime';
import { BufferNamespace } from './buffer';
import { EventEmitter } from './event-emitter';
import { CanvasRenderer, DEFAULT_THEME } from './renderer';
import { InputHandler } from './input-handler';
import { SelectionManager } from './selection-manager';
import { LinkDetector } from './link-detector';
import { OSC8LinkProvider } from './providers/osc8-link-provider';
import { UrlRegexProvider } from './providers/url-regex-provider';
import { mouseReport } from './mouse';
import { OutputQueue } from './output-queue';
import type { IBufferRange, IDisposable, IEvent, IKeyEvent, ITerminalAddon, ITerminalCore, ITerminalOptions, ITheme, IUnicodeVersionProvider } from './interfaces';
import type { ILink, ILinkProvider, TerminalCell, TerminalConfig } from './types';

type Listener = [EventTarget, string, EventListener, AddEventListenerOptions | boolean | undefined];
/** Scroll offsets captured before a write/update, with row anchors that survive index shifts. */
interface ViewportAnchors { scrollIntent: number; history: number; viewportY: number; targetViewportY: number; viewportAnchor: bigint | undefined; targetAnchor: bigint | undefined; }
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const timestamp = (): number => typeof performance === 'undefined' ? Date.now() : performance.now();
const themeKeys: (keyof ITheme)[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'];
function color(value?: string): number | undefined {
  if (!value) return undefined;
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) return Number.parseInt(Array.from(short[1], ch => ch + ch).join(''), 16);
  if (/^#[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value);
  return rgb ? clamp(Number(rgb[1]), 0, 255) * 65536 + clamp(Number(rgb[2]), 0, 255) * 256 + clamp(Number(rgb[3]), 0, 255) : undefined;
}

export class Terminal implements ITerminalCore {
  static readonly MAX_DIMENSION = 4096;
  static readonly MAX_CELLS = 1048576;
  /** Retained compatibility helper; the engine now receives an exact line limit. */
  static scrollbackBytes(lines: number | undefined, cols: number): number {
    const count = Number.isFinite(lines) && (lines ?? 0) > 0 ? Math.floor(lines!) : 0;
    return clamp(count * Math.max(1, cols) * 13, 1, 512 * 1024 * 1024);
  }
  private static validate(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > this.MAX_DIMENSION || rows > this.MAX_DIMENSION || cols * rows > this.MAX_CELLS) {
      throw new RangeError(`Invalid terminal size ${cols}x${rows}`);
    }
  }
  cols: number;
  rows: number;
  element?: HTMLElement;
  textarea?: HTMLTextAreaElement;
  renderer?: CanvasRenderer;
  wasmTerm?: AkittyTerminal;
  readonly buffer: BufferNamespace;
  readonly unicode: IUnicodeVersionProvider;
  readonly options: Required<ITerminalOptions>;
  private readonly settings: Required<ITerminalOptions>;
  private engine?: AkittyEngine;
  private canvas?: HTMLCanvasElement;
  private inputHandler?: InputHandler;
  private selectionManager?: SelectionManager;
  private linkDetector?: LinkDetector;
  private readonly listeners: Listener[] = [];
  private readonly attributes = new Map<string, string | null>();
  private parentPosition = '';
  private parentCursor = '';
  private addons: ITerminalAddon[] = [];
  private isOpen = false;
  private isDisposed = false;
  private resizePaintPending = false;
  private resizeRevision = 0
  private revision = 0;
  private currentTitle = '';
  private animationFrameId?: number;
  private onScreen = true;
  private redrawOnShow = false;
  private renderFailed = false;
  private visibilityObserver?: IntersectionObserver;
  private lastCursor = { x: 0, y: 0 };
  private syncTimer?: ReturnType<typeof setTimeout>;
  private readonly outputQueue = new OutputQueue(bytes => this.writeNow(bytes));
  viewportY = 0;
  private targetViewportY = 0;
  private scrollIntent = 0;
  private chosenViewport?: ViewportAnchors;
  private alternateWheelRemainder = 0;
  private scrollAnimationFrame?: number;
  private scrollbarAnimationFrame?: number;
  private scrollbarHideTimeout?: ReturnType<typeof setTimeout>;
  private scrollbarVisible = false;
  private scrollbarTransition = 0;
  private scrollbarOpacity = 0;
  private dragging?: { y: number; viewport: number };
  private mouseButton?: number;
  private customKeyEventHandler?: (event: KeyboardEvent) => boolean;
  private customWheelEventHandler?: (event: WheelEvent) => boolean;
  private currentHoveredLink?: ILink;
  private hoverRequest = 0;
  private mouseMoveThrottleTimeout?: ReturnType<typeof setTimeout>;
  private pendingMouseMove?: MouseEvent;
  private readonly dataEmitter = new EventEmitter<string>();
  private readonly resizeEmitter = new EventEmitter<{ cols: number; rows: number }>();
  private readonly bellEmitter = new EventEmitter<void>();
  private readonly selectionChangeEmitter = new EventEmitter<void>();
  private readonly keyEmitter = new EventEmitter<IKeyEvent>();
  private readonly titleChangeEmitter = new EventEmitter<string>();
  private readonly scrollEmitter = new EventEmitter<number>();
  private readonly renderEmitter = new EventEmitter<{ start: number; end: number }>();
  private readonly cursorMoveEmitter = new EventEmitter<void>();
  readonly onData: IEvent<string> = this.dataEmitter.event;
  readonly onResize = this.resizeEmitter.event;
  readonly onBell = this.bellEmitter.event;
  readonly onSelectionChange = this.selectionChangeEmitter.event;
  readonly onKey = this.keyEmitter.event;
  readonly onTitleChange = this.titleChangeEmitter.event;
  readonly onScroll = this.scrollEmitter.event;
  readonly onRender = this.renderEmitter.event;
  readonly onCursorMove = this.cursorMoveEmitter.event;

  constructor(options: ITerminalOptions = {}) {
    Terminal.validate(options.cols ?? 80, options.rows ?? 24);
    this.engine = options.engine ?? getEngine();
    this.settings = { cols: 80, rows: 24, cursorBlink: false, cursorStyle: 'block', theme: {}, scrollback: 10000,
      fontSize: 15, fontFamily: 'monospace', lineHeight: 1, allowTransparency: false, convertEol: false, disableStdin: false,
      smoothScrollDuration: 100, ...options, engine: this.engine };
    this.cols = this.settings.cols; this.rows = this.settings.rows;
    const version = this.engine.unicodeVersion;
    this.unicode = Object.freeze({ get activeVersion(): string { return version; } });
    this.options = new Proxy(this.settings, { set: (target, property: string, value: unknown) => {
      const key = property as keyof ITerminalOptions;
      if (key === 'cols' || key === 'rows') Terminal.validate(key === 'cols' ? value as number : target.cols, key === 'rows' ? value as number : target.rows);
      const record = target as unknown as Record<string, unknown>, old = record[property];
      record[property] = value;
      try {
        if (this.isOpen) this.handleOptionChange(key);
        else if (key === 'cols' || key === 'rows') { this.cols = target.cols; this.rows = target.rows; }
      } catch (error) {
        if (!(key === 'cols' || key === 'rows') || this.cols !== target.cols || this.rows !== target.rows) record[property] = old;
        throw error;
      }
      return true;
    } });
    this.buffer = new BufferNamespace(this);
  }
  get title(): string { return this.currentTitle; }
  get writeRevision(): number { return this.revision; }
  private config(): TerminalConfig {
    const theme = { ...DEFAULT_THEME, ...this.options.theme };
    return { scrollbackLimit: Number.isFinite(this.options.scrollback) ? clamp(Math.floor(this.options.scrollback), 0, 100000) : 0,
      fgColor: color(theme.foreground), bgColor: color(theme.background), cursorColor: color(theme.cursor),
      palette: themeKeys.map(key => color(theme[key]) ?? 0) };
  }
  private handleOptionChange(key: keyof ITerminalOptions): void {
    if (key === 'cols' || key === 'rows') { this.resize(this.options.cols, this.options.rows); return; }
    const renderer = this.renderer; if (!renderer) return;
    if (key === 'cursorStyle') renderer.setCursorStyle(this.options.cursorStyle);
    else if (key === 'cursorBlink') renderer.setCursorBlink(this.options.cursorBlink);
    else if (key === 'theme') {
      this.wasmTerm!.setTheme(this.config());
      renderer.setTheme(this.options.theme);
    }
    else if (key === 'fontSize' || key === 'fontFamily' || key === 'lineHeight') {
      if (key === 'fontSize') renderer.setFontSize(this.options.fontSize);
      if (key === 'fontFamily') renderer.setFontFamily(this.options.fontFamily);
      if (key === 'lineHeight') renderer.setLineHeight(this.options.lineHeight);
      renderer.resize(this.cols, this.rows);
      const terminal = this.wasmTerm;
      this.selectionManager?.clearSelection();
      if (!terminal || !this.isCurrentTerminal(terminal)) return;
      renderer.render(terminal, true, this.viewportY, this, this.scrollbarOpacity);
    }
  }
  private listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions | boolean): void {
    target.addEventListener(type, listener, options); this.listeners.push([target, type, listener, options]);
  }
  open(parent: HTMLElement): void {
    if (this.isDisposed) throw new Error('Terminal has been disposed');
    if (this.isOpen) throw new Error('Terminal is already open');
    this.element = parent;
    this.parentPosition = parent.style.position; this.parentCursor = parent.style.cursor;
    for (const name of ['tabindex', 'contenteditable', 'role', 'aria-label', 'aria-multiline']) this.attributes.set(name, parent.getAttribute(name));
    this.isOpen = true;
    try {
      if (!parent.hasAttribute('tabindex')) parent.tabIndex = 0;
      parent.setAttribute('contenteditable', 'true'); parent.setAttribute('role', 'textbox');
      parent.setAttribute('aria-label', 'Terminal input'); parent.setAttribute('aria-multiline', 'true');
      this.listen(parent, 'beforeinput', this.handleBeforeInput);
      this.wasmTerm = this.engine!.createTerminal(this.cols, this.rows, this.config());
      this.canvas = document.createElement('canvas'); this.canvas.style.display = 'block'; parent.appendChild(this.canvas);
      this.textarea = document.createElement('textarea');
      this.textarea.setAttribute('autocorrect', 'off'); this.textarea.setAttribute('autocapitalize', 'off');
      this.textarea.spellcheck = false; this.textarea.setAttribute('aria-label', 'Terminal input');
      this.textarea.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;padding:0;border:0;margin:0;opacity:0;clip-path:inset(50%);overflow:hidden;resize:none';
      parent.appendChild(this.textarea);
      this.listen(this.canvas, 'mousedown', event => { event.preventDefault(); this.textarea?.focus(); });
      this.listen(this.canvas, 'touchend', event => { event.preventDefault(); this.textarea?.focus(); });
      this.renderer = new CanvasRenderer(this.canvas, this.options); this.renderer.resize(this.cols, this.rows);
      this.inputHandler = new InputHandler(this.engine!, parent, data => this.emitInput(data), () => this.bellEmitter.fire(),
        event => this.keyEmitter.fire(event), this.customKeyEventHandler, mode => this.wasmTerm?.getMode(mode) ?? false,
        data => this.paste(data), () => this.wasmTerm?.getKeyboardFlags() ?? 0);
      this.selectionManager = new SelectionManager(this, this.renderer, this.wasmTerm, this.textarea);
      this.renderer.setSelectionManager(this.selectionManager);
      this.selectionManager.onSelectionChange(() => this.selectionChangeEmitter.fire());
      this.listen(this.textarea, 'paste', event => {
        event.preventDefault(); event.stopPropagation();
        const data = (event as ClipboardEvent).clipboardData;
        const value = data?.getData('text/plain') || data?.getData('text'); if (value) this.paste(value);
      });
      this.linkDetector = new LinkDetector(this);
      this.linkDetector.registerProvider(new OSC8LinkProvider(this)); this.linkDetector.registerProvider(new UrlRegexProvider(this));
      this.listen(parent, 'wheel', this.handleWheel as EventListener, { passive: false, capture: true });
      this.listen(parent, 'mousedown', this.handleMouseDown as EventListener, { capture: true });
      this.listen(parent, 'mousemove', this.handleMouseMove as EventListener);
      this.listen(parent, 'mouseleave', this.handleMouseLeave);
      this.listen(parent, 'click', event => { void this.handleClick(event as MouseEvent); });
      this.listen(document, 'mouseup', this.handleMouseUp as EventListener);
      this.listen(this.textarea, 'focus', () => { if (this.wasmTerm?.hasFocusEvents()) this.emitInput('\x1b[I'); });
      this.listen(this.textarea, 'blur', () => { if (this.wasmTerm?.hasFocusEvents()) this.emitInput('\x1b[O'); });
      this.renderer.render(this.wasmTerm, true, 0, this, 0);
      this.observeVisibility(parent); this.startRenderLoop(); this.focus();
    } catch (error) {
      this.isOpen = false; const failures = this.cleanupComponents();
      throw new Error(`Failed to open terminal: ${String(error)}${failures.length ? `; cleanup failed: ${failures.map(String).join('; ')}` : ''}`);
    }
  }
  private assertOpen(): void {
    if (this.isDisposed) throw new Error('Terminal has been disposed');
    if (!this.isOpen) throw new Error('Terminal must be opened before use. Call terminal.open(parent) first.');
  }
  private isCurrentTerminal(terminal: AkittyTerminal): boolean {
    return this.isOpen && this.wasmTerm === terminal;
  }
  private emitInput(data: string): void {
    const terminal = this.wasmTerm;
    if (!terminal || !this.isCurrentTerminal(terminal) || this.options.disableStdin) return;
    this.selectionManager?.clearSelection();
    if (this.isCurrentTerminal(terminal) && !this.options.disableStdin) this.dataEmitter.fire(data);
  }
  write(data: string | Uint8Array, callback?: () => void): void {
    this.assertOpen();
    if (this.outputQueue.pending) throw new Error('Asynchronous output is pending; await writeAsync() before calling write()');
    this.writeNow(data);
    if (callback) setTimeout(callback, 0);
  }
  /** Bounded FIFO output that yields between parsing turns. Resolves after parsing. */
  writeAsync(data: string | Uint8Array): Promise<void> {
    try { this.assertOpen(); return this.outputQueue.enqueue(data); }
    catch (error) { return Promise.reject(error); }
  }
  private writeNow(data: string | Uint8Array): void {
    this.assertOpen();
    if (this.options.convertEol) {
      if (typeof data === 'string') data = data.replace(/\n/g, '\r\n');
      else {
        const output: number[] = [];
        for (const byte of data) { if (byte === 10) output.push(13); output.push(byte); }
        data = new Uint8Array(output);
      }
    }
    const terminal = this.wasmTerm!, alternate = terminal.isAlternateScreen(), viewport = this.captureViewport(terminal);
    terminal.write(data, this.engineEvent);
    // Each event boundary can reset or dispose the terminal. An old write must
    // never publish buffer changes, replies or viewport updates for its replacement.
    if (!this.isCurrentTerminal(terminal)) return;
    this.revision++;
    this.notifyBufferChangeIfSwitched(alternate);
    if (!this.isCurrentTerminal(terminal)) return;
    this.processTerminalResponses(terminal);
    if (!this.isCurrentTerminal(terminal)) return;
    this.scheduleSync(); this.linkDetector?.invalidateCache();
    this.preserveViewportOnOutput(terminal, viewport);
  }
  /** Capture scroll offsets plus row anchors before output can shift either. */
  private captureViewport(terminal: AkittyTerminal): ViewportAnchors {
    const viewportY = this.viewportY, targetViewportY = this.targetViewportY;
    // Row ids locate the same content after a write, even when a full scrollback keeps its length.
    const anchor = (offset: number): bigint | undefined => Math.floor(offset) === 0 ? undefined : terminal.getRowId(-Math.floor(offset));
    return { scrollIntent: this.scrollIntent, history: terminal.getScrollbackLength(), viewportY, targetViewportY, viewportAnchor: anchor(viewportY), targetAnchor: anchor(targetViewportY) };
  }
  /** Flush held output (synchronized-update expiry or a render tick) without losing a reader's scroll position. */
  private updateAndPreserve(terminal: AkittyTerminal): boolean {
    const viewport = this.captureViewport(terminal);
    const dirty = terminal.update();
    // A tick can fire title/bell events, and their listeners can reset or dispose the terminal.
    if (!this.isCurrentTerminal(terminal)) return false;
    // A synchronized-update expiry flushes held output, so cached links for those rows are
    // stale. Skip clean frames to avoid discarding the detector cache on every render tick.
    if (dirty !== DirtyState.NONE) this.linkDetector?.invalidateCache();
    this.processTerminalResponses(terminal);
    if (!this.isCurrentTerminal(terminal)) return false;
    this.preserveViewportOnOutput(terminal, viewport);
    return this.isCurrentTerminal(terminal);
  }
  /** New output shifts every bottom-relative offset, so a reader scrolled up must move with it.
   *  Row anchors follow the same content past eviction, offset 0 tracks the live bottom and stays put,
   *  and an evicted anchor falls back to shifting the current offset by the history delta. */
  private preserveViewportOnOutput(terminal: AkittyTerminal, viewport: ViewportAnchors): void {
    // A callback may deliberately scroll between output chunks. Follow its chosen row anchors
    // through any remaining output instead of restoring the position from before the callback.
    if (viewport.scrollIntent !== this.scrollIntent) {
      if (!this.chosenViewport) return;
      viewport = this.chosenViewport;
    }
    const scrollback = terminal.getScrollbackLength(), delta = scrollback - viewport.history;
    const place = (current: number, captured: number, rowId: bigint | undefined): number => {
      if (current === 0) return 0;
      const absolute = rowId === undefined ? undefined : terminal.findRow(rowId);
      // A retained anchor resolves to the same content exactly once. Re-resolving it (rather than
      // shifting current) keeps a nested write from applying the same new row a second time.
      if (absolute !== undefined) return clamp(scrollback - absolute + (captured - Math.floor(captured)), 0, scrollback);
      // The anchor was evicted or never captured: shift the offset the host last chose.
      return clamp(current + delta, 0, scrollback);
    };
    this.targetViewportY = place(this.targetViewportY, viewport.targetViewportY, viewport.targetAnchor);
    this.setViewport(place(this.viewportY, viewport.viewportY, viewport.viewportAnchor));
  }
  private readonly engineEvent = (event: EngineEvent): void => {
    if (event.type === 'title') this.applyTitle(event.title);
    else {
      const terminal = this.wasmTerm;
      for (let i = 0; terminal && i < event.count && this.isCurrentTerminal(terminal); i++) this.bellEmitter.fire();
    }
  };
  private scheduleSync(): void {
    clearTimeout(this.syncTimer); this.syncTimer = undefined;
    const deadline = this.wasmTerm?.getSyncDeadline();
    if (deadline === null || deadline === undefined || this.isDisposed) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = undefined;
      if (!this.isOpen || this.isDisposed) return;
      const terminal = this.wasmTerm; if (terminal) this.updateAndPreserve(terminal);
      this.scheduleSync();
    }, Math.max(0, deadline - timestamp()));
  }
  writeln(data: string | Uint8Array, callback?: () => void): void {
    if (typeof data === 'string') this.write(data + '\r\n', callback);
    else { const bytes = new Uint8Array(data.length + 2); bytes.set(data); bytes.set([13, 10], data.length); this.write(bytes, callback); }
  }
  paste(data: string): void {
    this.assertOpen();
    this.emitInput(this.wasmTerm!.hasBracketedPaste() ? '\x1b[200~' + data.replace(/\x1b/g, '') + '\x1b[201~' : data);
  }
  input(data: string, wasUserInput = false): void {
    this.assertOpen(); if (this.options.disableStdin) return;
    if (wasUserInput) this.emitInput(data); else this.write(data);
  }
  resize(cols: number, rows: number): void {
    this.assertOpen(); Terminal.validate(cols, rows);
    if (cols === this.cols && rows === this.rows) { if (this.resizePaintPending) this.finishResize(); return; }
    const previous = { cols: this.cols, rows: this.rows };
    const terminal = this.wasmTerm!;
    terminal.resize(cols, rows); this.cols = cols; this.rows = rows; this.revision++;
    try { this.renderer!.resize(cols, rows); }
    catch (error) { this.wasmTerm!.resize(previous.cols, previous.rows); this.cols = previous.cols; this.rows = previous.rows; throw error; }
    // Mark the announcement before selection listeners run: a nested reset keeps it pending
    // (the grid size is unchanged), and a nested resize that completes clears it.
    this.resizeRevision++
    this.resizePaintPending = true;
    this.selectionManager?.clearSelection();
    if (this.isOpen && this.resizePaintPending) this.finishResize(terminal);
  }
  private finishResize(reflowed: AkittyTerminal = this.wasmTerm!): void {
    this.settings.cols = this.cols; this.settings.rows = this.rows;
    this.linkDetector?.invalidateCache();
    // Reflow can consume history. Clamp before painting and discard any wheel
    // animation whose target belonged to the previous grid.
    this.jumpViewport(this.viewportY);
    // Listeners can finish another resize (which announces itself) or reset the terminal,
    // so read the grid only now.
    if (!this.isOpen || !this.resizePaintPending) return;
    const { cols, rows, resizeRevision } = this
    const currentSize = () => this.isOpen && this.resizeRevision === resizeRevision && this.cols === cols && this.rows === rows
    // A reset paints its own frames, but the host still needs the new size for its PTY.
    const painted = this.wasmTerm === reflowed
    // A failed paint leaves the announcement pending; an identical resize retries it.
    if (painted) this.renderer!.render(reflowed, true, this.viewportY, this, this.scrollbarOpacity)
    this.resizePaintPending = false
    // A listener can complete a different resize before the rest of this dispatch.
    this.resizeEmitter.fire({ cols, rows }, currentSize)
    const currentFrame = () => currentSize() && this.isCurrentTerminal(reflowed)
    if (painted && currentFrame()) this.renderEmitter.fire({ start: 0, end: rows - 1 }, currentFrame)
  }
  clear(): void { this.write('\x1b[2J\x1b[H'); }
  reset(): void {
    this.assertOpen();
    const previous = this.wasmTerm!, alternate = previous.isAlternateScreen();
    const replacement = this.engine!.createTerminal(this.cols, this.rows, this.config());
    // Commit ownership before selection notifications can reenter reset/dispose.
    this.wasmTerm = replacement; previous.free();
    this.outputQueue.cancel(new Error('Terminal was reset before queued output completed'));
    this.inputHandler?.reset();
    this.mouseButton = undefined; this.dragging = undefined; this.alternateWheelRemainder = 0;
    this.cancelScrolling(); clearTimeout(this.syncTimer); this.syncTimer = undefined;
    this.viewportY = this.targetViewportY = 0; this.scrollbarOpacity = 0; this.scrollbarVisible = false;
    this.linkDetector?.invalidateCache(); this.renderer?.clear(); this.revision++;
    this.selectionManager?.setTerminal(replacement);
    if (!this.isCurrentTerminal(replacement)) return;
    this.handleMouseLeave();
    if (!this.isCurrentTerminal(replacement)) return;
    this.notifyBufferChangeIfSwitched(alternate);
    if (!this.isCurrentTerminal(replacement)) return;
    this.scrollEmitter.fire(0);
    if (this.isCurrentTerminal(replacement)) this.applyTitle('');
  }
  private notifyBufferChangeIfSwitched(previous: boolean): void {
    if (this.wasmTerm && previous !== this.wasmTerm.isAlternateScreen()) {
      this.alternateWheelRemainder = 0; this.mouseButton = undefined;
      this.buffer._fireBufferChange(this.buffer.active);
    }
  }
  private applyTitle(title: string): void { if (title !== this.currentTitle) { this.currentTitle = title; this.titleChangeEmitter.fire(title); } }
  focus(): void { if (this.isOpen && !this.isDisposed) (this.textarea ?? this.element)?.focus(); }
  blur(): void { this.textarea?.blur(); this.element?.blur(); }
  loadAddon(addon: ITerminalAddon): void {
    if (this.isDisposed) throw new Error('Terminal has been disposed');
    addon.activate(this);
    // Activation is host code and can close the terminal before ownership transfers.
    if (this.isDisposed) addon.dispose();
    else this.addons.push(addon);
  }
  getSelection(): string { return this.selectionManager?.getSelection() ?? ''; }
  hasSelection(): boolean { return this.selectionManager?.hasSelection() ?? false; }
  getSelectionPosition(): IBufferRange | undefined { return this.selectionManager?.getSelectionPosition(); }
  clearSelection(): void { this.selectionManager?.clearSelection(); }
  selectAll(): void { this.selectionManager?.selectAll(); }
  select(column: number, row: number, length: number): void { this.selectionManager?.select(column, row, length); }
  selectLines(first: number, last: number): void { this.selectionManager?.selectLines(first, last); }
  attachCustomKeyEventHandler(handler?: (event: KeyboardEvent) => boolean): void {
    this.customKeyEventHandler = handler; this.inputHandler?.setCustomKeyEventHandler(handler ?? (() => false));
  }
  attachCustomWheelEventHandler(handler?: (event: WheelEvent) => boolean): void { this.customWheelEventHandler = handler; }
  registerLinkProvider(provider: ILinkProvider): void { this.assertOpen(); this.linkDetector!.registerProvider(provider); }
  getViewportY(): number { return this.viewportY; }
  getScrollbackLength(): number { return this.wasmTerm?.getScrollbackLength() ?? 0; }
  getScrollbackLine(row: number): TerminalCell[] | null { return this.wasmTerm?.getScrollbackLine(row) ?? null; }
  getScrollbackGraphemeString(row: number, col: number): string { return this.wasmTerm?.getScrollbackGraphemeString(row, col) ?? ''; }
  getMode(mode: number, ansi = false): boolean { this.assertOpen(); return this.wasmTerm!.getMode(mode, ansi); }
  hasBracketedPaste(): boolean { this.assertOpen(); return this.wasmTerm!.hasBracketedPaste(); }
  hasFocusEvents(): boolean { this.assertOpen(); return this.wasmTerm!.hasFocusEvents(); }
  hasMouseTracking(): boolean { this.assertOpen(); return this.wasmTerm!.hasMouseTracking(); }
  scrollLines(amount: number): void {
    if (!Number.isFinite(amount)) throw new RangeError('scrollLines amount must be finite'); this.assertOpen(); this.jumpViewport(this.viewportY - amount);
  }
  scrollPages(amount: number): void {
    if (!Number.isFinite(amount)) throw new RangeError('scrollPages amount must be finite');
    this.scrollLines(clamp(amount * this.rows, -Number.MAX_VALUE, Number.MAX_VALUE));
  }
  scrollToTop(): void { this.jumpViewport(this.getScrollbackLength()); }
  scrollToBottom(): void { this.jumpViewport(0); }
  scrollToLine(line: number): void { if (!Number.isFinite(line)) throw new RangeError('scrollToLine line must be finite'); this.jumpViewport(this.getScrollbackLength() - line); }
  /** A direct scroll replaces any smooth scroll in flight, so the animation cannot pull the viewport back. */
  private jumpViewport(value: number): void {
    this.scrollIntent++;
    if (this.scrollAnimationFrame !== undefined) { cancelAnimationFrame(this.scrollAnimationFrame); this.scrollAnimationFrame = undefined; }
    this.targetViewportY = clamp(value, 0, this.getScrollbackLength());
    this.setViewport(this.targetViewportY);
    if (this.wasmTerm) this.chosenViewport = this.captureViewport(this.wasmTerm);
  }
  private setViewport(value: number): void {
    const target = clamp(value, 0, this.getScrollbackLength());
    if (target === this.viewportY) return;
    const terminal = this.wasmTerm;
    this.viewportY = target; this.scrollEmitter.fire(target);
    if (terminal && this.isCurrentTerminal(terminal) && terminal.getScrollbackLength()) this.showScrollbar();
  }
  private smoothScrollTo(value: number): void {
    const terminal = this.wasmTerm;
    if (!terminal) return;
    this.scrollIntent++;
    this.targetViewportY = clamp(value, 0, this.getScrollbackLength());
    if (this.options.smoothScrollDuration <= 0 || !this.onScreen) this.setViewport(this.targetViewportY);
    else if (this.scrollAnimationFrame === undefined) {
      const animate = (): void => {
        this.scrollAnimationFrame = undefined;
        if (!this.isCurrentTerminal(terminal)) return;
        const intent = this.scrollIntent;
        const distance = this.targetViewportY - this.viewportY;
        if (!this.onScreen || Math.abs(distance) < 0.01) { this.setViewport(this.targetViewportY); return; }
        this.setViewport(this.viewportY + distance * clamp(16 / Math.max(1, this.options.smoothScrollDuration), 0.05, 1));
        if (this.isCurrentTerminal(terminal) && intent === this.scrollIntent) this.scrollAnimationFrame = requestAnimationFrame(animate);
      };
      animate();
    }
    if (this.wasmTerm) this.chosenViewport = this.captureViewport(this.wasmTerm);
  }
  private showScrollbar(): void {
    if (this.isDisposed) return;
    const visible = this.scrollbarVisible;
    this.scrollbarVisible = true;
    clearTimeout(this.scrollbarHideTimeout);
    if (this.scrollbarAnimationFrame !== undefined) { cancelAnimationFrame(this.scrollbarAnimationFrame); this.scrollbarAnimationFrame = undefined; }
    this.scrollbarTransition++;
    if (visible) this.scrollbarOpacity = 1;
    else { this.scrollbarOpacity = 0; this.fadeInScrollbar(); }
    this.scrollbarHideTimeout = setTimeout(() => this.hideScrollbar(), 1500);
  }
  private hideScrollbar(): void {
    if (this.isDisposed || this.dragging) return;
    this.fadeOutScrollbar();
  }
  private fadeInScrollbar(): void { this.transitionScrollbar(1); }
  private fadeOutScrollbar(): void { this.transitionScrollbar(0); }
  private transitionScrollbar(target: number): void {
    if (this.scrollbarAnimationFrame !== undefined) cancelAnimationFrame(this.scrollbarAnimationFrame);
    const transition = ++this.scrollbarTransition, start = Date.now(), from = this.scrollbarOpacity;
    const fade = (): void => {
      if (transition !== this.scrollbarTransition) return;
      this.scrollbarAnimationFrame = undefined;
      if (!this.isOpen || this.isDisposed) return;
      const progress = this.onScreen ? clamp((Date.now() - start) / 200, 0, 1) : 1;
      this.scrollbarOpacity = from + (target - from) * progress;
      if (progress < 1) this.scrollbarAnimationFrame = requestAnimationFrame(fade);
      else this.scrollbarVisible = target > 0;
    };
    fade();
  }
  private cancelScrolling(): void {
    this.scrollbarTransition++;
    if (this.scrollAnimationFrame !== undefined) cancelAnimationFrame(this.scrollAnimationFrame);
    if (this.scrollbarAnimationFrame !== undefined) cancelAnimationFrame(this.scrollbarAnimationFrame);
    this.scrollAnimationFrame = this.scrollbarAnimationFrame = undefined;
    clearTimeout(this.scrollbarHideTimeout); this.scrollbarHideTimeout = undefined;
  }
  private readonly handleBeforeInput: EventListener = event => event.preventDefault();
  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.isOpen || this.isDisposed) return;
    event.preventDefault(); event.stopPropagation();
    const engine = this.wasmTerm!;
    if (this.customWheelEventHandler?.(event)) return;
    // Host handlers can reset or dispose the terminal before the gesture resumes.
    if (!this.isCurrentTerminal(engine) || !event.deltaY) return;
    if (engine.hasMouseTracking() && !event.shiftKey) {
      const { x, y } = this.pointer(event); const button = (event.deltaY < 0 ? 64 : 65) | this.mouseModifiers(event);
      this.emitInput(mouseReport(button, x, y, false, engine.getMode(1006), engine.getMode(1005))); return;
    }
    if (engine.isAlternateScreen()) {
      if (!engine.getMode(1007)) { this.alternateWheelRemainder = 0; return; }
      const delta = event.deltaMode === 1 ? event.deltaY : event.deltaMode === 2 ? event.deltaY * this.rows : event.deltaY / 33;
      this.alternateWheelRemainder += delta;
      const steps = Math.trunc(this.alternateWheelRemainder);
      this.alternateWheelRemainder -= steps;
      const prefix = engine.getMode(1) ? '\x1bO' : '\x1b[';
      for (let i = 0; i < Math.min(5, Math.abs(steps)) && this.isCurrentTerminal(engine); i++) this.emitInput(prefix + (steps > 0 ? 'B' : 'A'));
      return;
    }
    const lines = event.deltaMode === 1 ? event.deltaY : event.deltaMode === 2 ? event.deltaY * this.rows : event.deltaY / (this.renderer?.getMetrics().height ?? 20);
    // Ticks that arrive mid-animation extend the pending target, so none of their distance is lost.
    const from = this.scrollAnimationFrame !== undefined ? this.targetViewportY : this.viewportY;
    if (lines) this.smoothScrollTo(from - lines);
  };
  private mouseModifiers(event: MouseEvent): number { return (event.shiftKey ? 4 : 0) | (event.altKey ? 8 : 0) | (event.ctrlKey ? 16 : 0); }
  private pointer(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas!.getBoundingClientRect(), metrics = this.renderer!.getMetrics();
    return { x: clamp(Math.floor((event.clientX - rect.left) / metrics.width), 0, this.cols - 1),
      y: clamp(Math.floor((event.clientY - rect.top) / metrics.height), 0, this.rows - 1) };
  }
  private readonly handleMouseDown = (event: MouseEvent): void => {
    const terminal = this.wasmTerm;
    if (!this.canvas || !this.renderer || !terminal) return;
    const rect = this.canvas.getBoundingClientRect(), history = this.getScrollbackLength();
    if (event.button === 0 && history > 0 && event.clientX - rect.left >= rect.width - 12 && rect.width > 0) {
      event.preventDefault(); event.stopImmediatePropagation();
      this.dragging = { y: event.clientY, viewport: this.viewportY }; this.showScrollbar(); return;
    }
    if (terminal.hasMouseTracking() && !event.shiftKey) {
      event.preventDefault(); event.stopImmediatePropagation(); this.focus();
      if (!this.isCurrentTerminal(terminal) || !terminal.hasMouseTracking()) return;
      this.mouseButton = event.button === 1 ? 1 : event.button === 2 ? 2 : 0;
      const { x, y } = this.pointer(event);
      this.emitInput(mouseReport(this.mouseButton | this.mouseModifiers(event), x, y, false, terminal.getMode(1006), terminal.getMode(1005)));
    }
  };
  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (this.mouseButton !== undefined && this.canvas && this.renderer && this.wasmTerm?.hasMouseTracking()) {
      const { x, y } = this.pointer(event);
      this.emitInput(mouseReport(this.mouseButton | this.mouseModifiers(event), x, y, true, this.wasmTerm.getMode(1006), this.wasmTerm.getMode(1005)));
    }
    this.mouseButton = undefined; this.dragging = undefined;
  };
  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.canvas || !this.renderer || !this.wasmTerm || this.isDisposed) return;
    this.hoverRequest++;
    if (this.dragging) {
      const rect = this.canvas.getBoundingClientRect();
      this.jumpViewport(this.dragging.viewport - (event.clientY - this.dragging.y) * this.getScrollbackLength() / Math.max(1, rect.height)); return;
    }
    if (this.wasmTerm.hasMouseTracking() && !event.shiftKey && (this.wasmTerm.getMode(1003) || this.wasmTerm.getMode(1002) && event.buttons)) {
      const { x, y } = this.pointer(event);
      this.emitInput(mouseReport((this.mouseButton ?? 3) | 32 | this.mouseModifiers(event), x, y, false, this.wasmTerm.getMode(1006), this.wasmTerm.getMode(1005))); return;
    }
    if (this.mouseMoveThrottleTimeout !== undefined) { this.pendingMouseMove = event; return; }
    this.processMouseMove(event);
    this.mouseMoveThrottleTimeout = setTimeout(() => {
      this.mouseMoveThrottleTimeout = undefined;
      const pending = this.pendingMouseMove; this.pendingMouseMove = undefined;
      if (pending) this.processMouseMove(pending);
    }, 16);
  };
  private processMouseMove(event: MouseEvent): void {
    if (!this.canvas || !this.renderer || !this.wasmTerm || !this.linkDetector) return;
    const request = ++this.hoverRequest, terminal = this.wasmTerm, { x, y } = this.pointer(event);
    const current = (): boolean => this.isCurrentTerminal(terminal) && request === this.hoverRequest;
    const row = this.getScrollbackLength() + y - Math.floor(this.viewportY);
    void this.linkDetector.getLinkAt(x, row).then(link => {
      if (!current()) return;
      if (link === this.currentHoveredLink) return;
      const previous = this.currentHoveredLink; this.currentHoveredLink = undefined;
      // Provider callbacks can reset/dispose the terminal or start another hover.
      previous?.hover?.(false);
      if (!current()) return;
      this.currentHoveredLink = link; link?.hover?.(true);
      if (!current()) return;
      if (this.element) this.element.style.cursor = link ? 'pointer' : 'text';
      const base = this.getScrollbackLength() - Math.floor(this.viewportY);
      this.renderer?.setHoveredLinkRange(link ? { startX: link.range.start.x, startY: link.range.start.y - base,
        endX: link.range.end.x, endY: link.range.end.y - base } : null);
    }).catch(error => console.warn('AkiTTY link lookup failed', error));
  }
  private readonly handleMouseLeave = (_event?: Event): void => {
    this.hoverRequest++; clearTimeout(this.mouseMoveThrottleTimeout); this.mouseMoveThrottleTimeout = undefined; this.pendingMouseMove = undefined;
    const previous = this.currentHoveredLink; this.currentHoveredLink = undefined;
    this.renderer?.setHoveredHyperlinkId(0); this.renderer?.setHoveredLinkRange(null);
    if (this.element) this.element.style.cursor = 'text'; previous?.hover?.(false);
  };
  private readonly handleClick = async (event: MouseEvent): Promise<void> => {
    if (!this.canvas || !this.renderer || !this.wasmTerm || !this.linkDetector) return;
    const { x, y } = this.pointer(event), detector = this.linkDetector, terminal = this.wasmTerm;
    try {
      const link = await detector.getLinkAt(x, this.getScrollbackLength() + y - Math.floor(this.viewportY));
      if (!this.isCurrentTerminal(terminal)) return;
      if (link) { link.activate(event); if (event.ctrlKey || event.metaKey) event.preventDefault(); }
    } catch (error) { console.warn('AkiTTY link activation failed', error); }
  };
  private processTerminalResponses(terminal: AkittyTerminal): void {
    const response = terminal.readResponse(); if (response) this.dataEmitter.fire(response);
  }
  private startRenderLoop(): void {
    const frame = (): void => {
      this.animationFrameId = undefined;
      if (!this.isOpen || this.isDisposed || !this.onScreen) return;
      try {
        if (this.updateAndPreserve(this.wasmTerm!)) {
          const painted = this.renderer!.render(this.wasmTerm!, this.renderFailed || this.redrawOnShow, this.viewportY, this, this.scrollbarOpacity);
          const cursor = this.wasmTerm!.getCursor();
          if (cursor.x !== this.lastCursor.x || cursor.y !== this.lastCursor.y) { this.lastCursor = cursor; this.cursorMoveEmitter.fire(); }
          this.renderFailed = false; this.redrawOnShow = false;
          // Only painted frames are announced, so idle frames cost nothing.
          if (painted) this.renderEmitter.fire({ start: 0, end: this.rows - 1 });
        }
      } catch (error) { if (!this.renderFailed) console.error('akitty-web: render failed, retrying next frame', error); this.renderFailed = true; }
      if (this.isOpen && !this.isDisposed && this.onScreen) this.animationFrameId = requestAnimationFrame(frame);
    };
    frame();
  }
  private observeVisibility(parent: HTMLElement): void {
    if (typeof IntersectionObserver === 'undefined') return;
    this.visibilityObserver = new IntersectionObserver(entries => {
      if (this.isDisposed || !entries.length) return;
      const visible = entries[entries.length - 1].isIntersecting;
      if (visible && !this.onScreen) this.redrawOnShow = true;
      this.onScreen = visible;
      if (visible && this.isOpen && this.animationFrameId === undefined) this.startRenderLoop();
    });
    this.visibilityObserver.observe(parent);
  }
  private cleanupComponents(): unknown[] {
    const failures: unknown[] = [], release = (action: () => void): void => { try { action(); } catch (error) { failures.push(error); } };
    release(() => this.isDisposed ? this.outputQueue.close() : this.outputQueue.cancel(new Error('Terminal is not open')));
    if (this.animationFrameId !== undefined) cancelAnimationFrame(this.animationFrameId); this.animationFrameId = undefined;
    this.cancelScrolling(); clearTimeout(this.syncTimer); this.syncTimer = undefined;
    release(() => this.handleMouseLeave(new Event('mouseleave')));
    this.visibilityObserver?.disconnect(); this.visibilityObserver = undefined;
    for (const [target, type, callback, options] of this.listeners) release(() => target.removeEventListener(type, callback, options));
    this.listeners.length = 0;
    const components = [this.selectionManager, this.inputHandler, this.renderer, this.linkDetector];
    this.selectionManager = undefined; this.inputHandler = undefined; this.renderer = undefined; this.linkDetector = undefined;
    for (const component of components) if (component) release(() => component.dispose());
    const engine = this.wasmTerm; this.wasmTerm = undefined; if (engine) release(() => engine.free());
    this.canvas?.remove(); this.textarea?.remove(); this.canvas = undefined; this.textarea = undefined;
    if (this.element) {
      for (const [name, value] of this.attributes) { if (value === null) this.element.removeAttribute(name); else this.element.setAttribute(name, value); }
      this.element.style.position = this.parentPosition; this.element.style.cursor = this.parentCursor;
    }
    this.attributes.clear(); this.element = undefined; this.mouseButton = undefined; this.dragging = undefined;
    return failures;
  }
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true; this.isOpen = false;
    const failures: unknown[] = [];
    for (const addon of this.addons) { try { addon.dispose(); } catch (error) { failures.push(error); } }
    this.addons = []; failures.push(...this.cleanupComponents()); this.engine = undefined; this.buffer.dispose();
    for (const emitter of [this.dataEmitter, this.resizeEmitter, this.bellEmitter, this.selectionChangeEmitter, this.keyEmitter,
      this.titleChangeEmitter, this.scrollEmitter, this.renderEmitter, this.cursorMoveEmitter]) emitter.dispose();
    if (failures.length) throw failures[0];
  }
}
