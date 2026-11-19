/** Browser input adaptation; terminal escape encoding lives in the shared Rust core. */
import type { AkittyEngine, KeyEncoder } from './engine';
import type { IKeyEvent } from './interfaces';
import { Key, KeyAction, KeyEncoderOption, Mods } from './types';

const functional: Readonly<Record<string, Key>> = {
  Enter: Key.ENTER, Escape: Key.ESCAPE, Backspace: Key.BACKSPACE, Tab: Key.TAB, Space: Key.SPACE,
  ArrowLeft: Key.LEFT, ArrowRight: Key.RIGHT, ArrowUp: Key.UP, ArrowDown: Key.DOWN,
  Insert: Key.INSERT, Delete: Key.DELETE, Home: Key.HOME, End: Key.END, PageUp: Key.PAGE_UP, PageDown: Key.PAGE_DOWN,
  CapsLock: Key.CAPS_LOCK, NumLock: Key.NUM_LOCK, ScrollLock: Key.SCROLL_LOCK, PrintScreen: Key.PRINT_SCREEN,
  Pause: Key.PAUSE, ContextMenu: Key.CONTEXT_MENU,
  NumpadDecimal: Key.KP_PERIOD, NumpadDivide: Key.KP_DIVIDE, NumpadMultiply: Key.KP_MULTIPLY,
  NumpadSubtract: Key.KP_MINUS, NumpadAdd: Key.KP_PLUS, NumpadEnter: Key.KP_ENTER, NumpadEqual: Key.KP_EQUAL,
  NumpadComma: Key.KP_SEPARATOR,
};
const punctuation: Readonly<Record<string, string>> = {
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
};
const modifierKeys: Readonly<Record<string, Key>> = {
  ShiftLeft: Key.LEFT_SHIFT, ControlLeft: Key.LEFT_CONTROL, AltLeft: Key.LEFT_ALT, MetaLeft: Key.LEFT_SUPER,
  ShiftRight: Key.RIGHT_SHIFT, ControlRight: Key.RIGHT_CONTROL, AltRight: Key.RIGHT_ALT, MetaRight: Key.RIGHT_SUPER,
};
function baseLayout(code: string): number | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.toLowerCase().charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  return punctuation[code]?.codePointAt(0);
}
function identity(event: KeyboardEvent): Key | undefined {
  if (modifierKeys[event.code] !== undefined) return modifierKeys[event.code];
  if (functional[event.code] !== undefined) return functional[event.code];
  if (/^Numpad[0-9]$/.test(event.code)) return (57399 + Number(event.code.slice(6))) as Key;
  const scalar = Array.from(event.key).length === 1 ? event.key.codePointAt(0) as Key : undefined;
  if (scalar !== undefined) {
    if (!event.shiftKey && !event.getModifierState?.('CapsLock')) return scalar;
    const unshifted = event.key.toLowerCase();
    if (unshifted !== event.key && Array.from(unshifted).length === 1) return unshifted.codePointAt(0) as Key;
  }
  if (/^Key[A-Z]$/.test(event.code)) return event.code.toLowerCase().charCodeAt(3) as Key;
  if (/^Digit[0-9]$/.test(event.code)) return event.code.charCodeAt(5) as Key;
  const fn = /^F([1-9]|[12][0-9]|3[0-5])$/.exec(event.code);
  if (fn) return (57363 + Number(fn[1])) as Key;
  return (punctuation[event.code]?.codePointAt(0) ?? scalar) as Key | undefined;
}

export class InputHandler {
  private readonly encoder: KeyEncoder;
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly reportedKeys = new Map<string, Key>();
  private closed = false;
  private composition: 'active' | 'cancelled' | undefined;
  private generation = 0;
  constructor(engine: AkittyEngine, private readonly container: HTMLElement, private readonly onData: (data: string) => void,
    _onBell: () => void, private readonly onKey?: (event: IKeyEvent) => void,
    private customKeyEventHandler?: (event: KeyboardEvent) => boolean, private readonly getMode?: (mode: number) => boolean,
    private readonly onPaste?: (data: string) => void, private readonly getKeyboardFlags?: () => number)
  {
    this.encoder = engine.createKeyEncoder();
    if (container.hasAttribute && !container.hasAttribute('tabindex')) container.setAttribute('tabindex', '0');
    this.listen('keydown', event => this.key(event as KeyboardEvent, false));
    this.listen('keyup', event => this.key(event as KeyboardEvent, true));
    this.listen('paste', event => this.paste(event as ClipboardEvent));
    this.listen('compositionstart', () => { this.composition = 'active'; });
    this.listen('compositionend', event => this.commit(event as CompositionEvent));
  }
  private listen(name: string, callback: EventListener): void {
    const listener: EventListener = event => { if (!this.closed) callback(event); };
    this.container.addEventListener(name, listener); this.listeners.push([name, listener]);
  }
  setCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void { this.customKeyEventHandler = handler; }
  /** A replacement terminal has no pending key presses or composition. */
  reset(): void {
    this.generation++;
    this.reportedKeys.clear();
    if (this.composition === 'active') this.composition = 'cancelled';
  }
  private key(event: KeyboardEvent, release: boolean): void {
    if (this.closed) return;
    const physicalKey = event.code || event.key;
    const reportedKey = release ? this.reportedKeys.get(physicalKey) : undefined;
    if (release) this.reportedKeys.delete(physicalKey);
    if (this.composition === 'active' || event.isComposing || event.keyCode === 229) return;
    if (!release) {
      const generation = this.generation;
      this.onKey?.({ key: event.key, domEvent: event });
      if (this.closed || generation !== this.generation) return;
      if (this.customKeyEventHandler?.(event)) { event.preventDefault(); return; }
      if (this.closed || generation !== this.generation) return;
    }
    const flags = this.getKeyboardFlags?.() ?? 0;
    if (release && (reportedKey === undefined || !(flags & 2))) return;
    if (event.key === 'Dead') return;
    if (modifierKeys[event.code] !== undefined && !(flags & 8)) return;
    const printable = Array.from(event.key).length === 1;
    // AltGraph is a layout modifier; Ctrl+Alt alone remains a terminal chord.
    const altGraph = event.getModifierState?.('AltGraph') ?? false;
    if (!release && !altGraph && !event.altKey
      && ((event.metaKey || event.ctrlKey) && event.code === 'KeyV' || event.metaKey && event.code === 'KeyC')) return;
    const applicationKeypad = this.getMode?.(66) ?? false;
    if (!release && !(flags & 8) && printable && !event.metaKey && ((!event.ctrlKey && !event.altKey) || altGraph)
      && !(applicationKeypad && event.code.startsWith('Numpad'))) {
      event.preventDefault(); this.onData(event.key); return;
    }
    // Layout modifiers may be released first, changing event.key while the physical key is still held.
    const code = release ? reportedKey : identity(event);
    if (code === undefined) return;
    const mods = (event.shiftKey ? Mods.SHIFT : 0) | (event.altKey && !altGraph ? Mods.ALT : 0)
      | (event.ctrlKey && !altGraph ? Mods.CTRL : 0) | (event.metaKey ? Mods.SUPER : 0)
      | (event.getModifierState?.('CapsLock') ? Mods.CAPSLOCK : 0) | (event.getModifierState?.('NumLock') ? Mods.NUMLOCK : 0);
    this.encoder.setOption(KeyEncoderOption.CURSOR_KEY_APPLICATION, this.getMode?.(1) ?? false);
    this.encoder.setOption(KeyEncoderOption.KEYPAD_KEY_APPLICATION, applicationKeypad);
    this.encoder.setOption(KeyEncoderOption.ALT_ESC_PREFIX, this.getMode?.(1036) ?? true);
    this.encoder.setKittyFlags(flags);
    const bytes = this.encoder.encode({ action: release ? KeyAction.RELEASE : event.repeat ? KeyAction.REPEAT : KeyAction.PRESS,
      key: code, mods, utf8: printable ? event.key : undefined,
      shiftedCodepoint: event.shiftKey && printable ? event.key.codePointAt(0) : undefined, baseLayoutCodepoint: baseLayout(event.code) });
    event.preventDefault(); event.stopPropagation();
    if (bytes.length) {
      // Host shortcuts and custom handlers never claimed a terminal key press; their releases stay local too.
      if (!release && flags !== 0) this.reportedKeys.set(physicalKey, code);
      this.onData(new TextDecoder().decode(bytes));
    }
  }
  private paste(event: ClipboardEvent): void {
    event.preventDefault(); event.stopPropagation();
    const data = event.clipboardData?.getData('text/plain');
    if (data) (this.onPaste ?? this.onData)(data);
  }
  private commit(event: CompositionEvent): void {
    const cancelled = this.composition === 'cancelled';
    this.composition = undefined;
    // Contenteditable hosts may leave browser composition text beside the canvas.
    for (const node of Array.from(this.container.childNodes ?? [])) if (node.nodeType === 3) this.container.removeChild(node);
    if (!cancelled && event.data) this.onData(event.data);
  }
  isActive(): boolean { return !this.closed; }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [name, callback] of this.listeners) this.container.removeEventListener(name, callback);
    this.listeners.length = 0; this.reportedKeys.clear(); this.encoder.dispose();
  }
}
