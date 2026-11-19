/** AkiTTY browser contracts. WASM layout is defined by akitty-vt, not an upstream engine. */
export enum Key {
  UNIDENTIFIED = 0,
  GRAVE = 96,
  BACKSLASH = 92,
  BRACKET_LEFT = 91,
  BRACKET_RIGHT = 93,
  COMMA = 44,
  EQUAL = 61,
  INTL_BACKSLASH = 60,
  MINUS = 45,
  PERIOD = 46,
  QUOTE = 39,
  SEMICOLON = 59,
  SLASH = 47,
  SPACE = 32,
  ENTER = 13,
  TAB = 9,
  BACKSPACE = 127,
  ESCAPE = 27,
  A = 97,
  B = 98,
  C = 99,
  D = 100,
  E = 101,
  F = 102,
  G = 103,
  H = 104,
  I = 105,
  J = 106,
  K = 107,
  L = 108,
  M = 109,
  N = 110,
  O = 111,
  P = 112,
  Q = 113,
  R = 114,
  S = 115,
  T = 116,
  U = 117,
  V = 118,
  W = 119,
  X = 120,
  Y = 121,
  Z = 122,
  ZERO = 48,
  ONE = 49,
  TWO = 50,
  THREE = 51,
  FOUR = 52,
  FIVE = 53,
  SIX = 54,
  SEVEN = 55,
  EIGHT = 56,
  NINE = 57,
  INSERT = 57348,
  DELETE = 57349,
  LEFT = 57350,
  RIGHT = 57351,
  UP = 57352,
  DOWN = 57353,
  PAGE_UP = 57354,
  PAGE_DOWN = 57355,
  HOME = 57356,
  END = 57357,
  CAPS_LOCK = 57358,
  SCROLL_LOCK = 57359,
  NUM_LOCK = 57360,
  PRINT_SCREEN = 57361,
  PAUSE = 57362,
  CONTEXT_MENU = 57363,
  F1 = 57364,
  F2 = 57365,
  F3 = 57366,
  F4 = 57367,
  F5 = 57368,
  F6 = 57369,
  F7 = 57370,
  F8 = 57371,
  F9 = 57372,
  F10 = 57373,
  F11 = 57374,
  F12 = 57375,
  F13 = 57376,
  F14 = 57377,
  F15 = 57378,
  F16 = 57379,
  F17 = 57380,
  F18 = 57381,
  F19 = 57382,
  F20 = 57383,
  F21 = 57384,
  F22 = 57385,
  F23 = 57386,
  F24 = 57387,
  F25 = 57388,
  F26 = 57389,
  F27 = 57390,
  F28 = 57391,
  F29 = 57392,
  F30 = 57393,
  F31 = 57394,
  F32 = 57395,
  F33 = 57396,
  F34 = 57397,
  F35 = 57398,
  KP_0 = 57399,
  KP_1 = 57400,
  KP_2 = 57401,
  KP_3 = 57402,
  KP_4 = 57403,
  KP_5 = 57404,
  KP_6 = 57405,
  KP_7 = 57406,
  KP_8 = 57407,
  KP_9 = 57408,
  KP_PERIOD = 57409,
  KP_DIVIDE = 57410,
  KP_MULTIPLY = 57411,
  KP_MINUS = 57412,
  KP_PLUS = 57413,
  KP_ENTER = 57414,
  KP_EQUAL = 57415,
  KP_SEPARATOR = 57416,
  LEFT_SHIFT = 57441,
  LEFT_CONTROL = 57442,
  LEFT_ALT = 57443,
  LEFT_SUPER = 57444,
  RIGHT_SHIFT = 57447,
  RIGHT_CONTROL = 57448,
  RIGHT_ALT = 57449,
  RIGHT_SUPER = 57450,
}

export enum Mods { NONE = 0, SHIFT = 1, ALT = 2, CTRL = 4, SUPER = 8, CAPSLOCK = 64, NUMLOCK = 128 }
export enum KeyAction { RELEASE = 0, PRESS = 1, REPEAT = 2 }
export enum KittyKeyFlags { DISABLED = 0, DISAMBIGUATE = 1, REPORT_EVENTS = 2, REPORT_ALTERNATES = 4, REPORT_ALL = 8, REPORT_ASSOCIATED = 16, ALL = 31 }
export enum KeyEncoderOption { CURSOR_KEY_APPLICATION, KEYPAD_KEY_APPLICATION, IGNORE_KEYPAD_WITH_NUMLOCK, ALT_ESC_PREFIX, MODIFY_OTHER_KEYS_STATE_2, KITTY_KEYBOARD_FLAGS }
export interface KeyEvent { action: KeyAction; key: Key; mods: Mods; consumedMods?: Mods; composing?: boolean; utf8?: string; unshiftedCodepoint?: number; shiftedCodepoint?: number; baseLayoutCodepoint?: number }
export enum DirtyState { NONE, PARTIAL, FULL }
export enum CellFlags { BOLD = 1, ITALIC = 2, UNDERLINE = 4, STRIKETHROUGH = 8, INVERSE = 16, INVISIBLE = 32, BLINK = 64, FAINT = 128 }
export interface TerminalCell {
  codepoint: number; fg_r: number; fg_g: number; fg_b: number; bg_r: number; bg_g: number; bg_b: number;
  flags: number; width: number; hyperlink_id: number; grapheme_len: number;
  underline_style?: number; underline_color?: number;
}
export interface RGB { r: number; g: number; b: number }
export type RGBColor = RGB;
export interface Cursor { x: number; y: number; visible: boolean }
export interface RenderStateCursor extends Cursor { viewportX: number; viewportY: number; blinking: boolean; style: 'block' | 'underline' | 'bar' }
export interface RenderStateColors { foreground: RGB; background: RGB; cursor: RGB | null }
export interface TerminalConfig { scrollbackLimit?: number; fgColor?: number; bgColor?: number; cursorColor?: number; palette?: number[] }
export type TerminalHandle = number;
export interface IBufferCellPosition { x: number; y: number }
export interface IBufferRange { start: IBufferCellPosition; end: IBufferCellPosition }
export interface ILink { text: string; range: IBufferRange; activate(event: MouseEvent): void; hover?(isHovered: boolean): void; dispose?(): void }
export interface ILinkProvider { provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void; dispose?(): void }
export interface IBufferCell { getCodepoint(): number; getHyperlinkId(): number; getWidth(): number; isBold(): boolean; isItalic(): boolean; isDim(): boolean }
export interface IBufferLine { length: number; getCell(x: number): IBufferCell; translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string }
export interface IBuffer { length: number; getLine(y: number): IBufferLine }
export interface IBufferManager { active: IBuffer; normal: IBuffer; alternate: IBuffer }
export enum TerminalMode { INSERT = 4, CURSOR_VISIBLE = 25, MOUSE_TRACKING_NORMAL = 1000, MOUSE_TRACKING_BUTTON = 1002, MOUSE_TRACKING_ANY = 1003, FOCUS_EVENTS = 1004, ALT_SCREEN = 1047, ALT_SCREEN_WITH_CURSOR = 1049, BRACKETED_PASTE = 2004 }
export type { IDisposable, IEvent } from './interfaces';
export { EventEmitter } from './event-emitter';

/** ABI 1 exports. Byte buffers are allocated and freed by this module. */
export interface AkittyWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  akitty_vt_abi_version(): number;
  akitty_vt_unicode_version(): number;
  akitty_vt_deadline(id: number): number;
  akitty_vt_alloc(size: number): number;
  akitty_vt_free(pointer: number, length: number): number;
  akitty_vt_create(cols: number, rows: number, history: number): number;
  akitty_vt_destroy(id: number): number;
  akitty_vt_write(id: number, pointer: number, length: number, now: number): number;
  akitty_vt_tick(id: number, now: number): number;
  akitty_vt_resize(id: number, cols: number, rows: number): number;
  akitty_vt_get(id: number, field: number): number;
  akitty_vt_buffer_get(id: number, alternate: number, field: number): number;
  akitty_vt_buffer_line(id: number, alternate: number, row: number, pointer: number, capacity: number): number;
  akitty_vt_buffer_wrapped(id: number, alternate: number, row: number): number;
  akitty_vt_buffer_text(id: number, alternate: number, row: number, col: number, pointer: number, capacity: number): number;
  akitty_vt_mode(id: number, mode: number, ansi: number): number;
  akitty_vt_line(id: number, row: number, pointer: number, capacity: number): number;
  akitty_vt_viewport(id: number, pointer: number, capacity: number): number;
  akitty_vt_dirty(id: number, row: number): number;
  akitty_vt_clean(id: number): void;
  akitty_vt_color(id: number, index: number, rgb: number): number;
  akitty_vt_wrapped(id: number, row: number): number;
  akitty_vt_wrap_padding(id: number, row: number): number;
  akitty_vt_row_id(id: number, row: number): bigint;
  akitty_vt_find_row(id: number, rowId: bigint): number;
  akitty_vt_text(id: number, row: number, col: number, kind: number, pointer: number, capacity: number): number;
  akitty_vt_replies(id: number, pointer: number, capacity: number): number;
  akitty_vt_event(id: number, pointer: number, capacity: number): number;
  akitty_vt_key(code: number, shifted: number, base: number, modifiers: number, action: number, options: number, text: number, textLength: number, output: number, capacity: number): number;
}
