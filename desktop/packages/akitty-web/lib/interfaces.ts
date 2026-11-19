/** Public host contracts for the AkiTTY canvas terminal. */
import type { AkittyEngine } from './engine';
export interface IDisposable { dispose(): void }
export type IEvent<T> = (listener: (value: T) => void) => IDisposable;
export interface ITheme {
  foreground?: string; background?: string; cursor?: string; cursorAccent?: string;
  selectionBackground?: string; selectionForeground?: string;
  black?: string; red?: string; green?: string; yellow?: string; blue?: string; magenta?: string; cyan?: string; white?: string;
  brightBlack?: string; brightRed?: string; brightGreen?: string; brightYellow?: string;
  brightBlue?: string; brightMagenta?: string; brightCyan?: string; brightWhite?: string;
}
export interface ITerminalOptions {
  cols?: number; rows?: number; fontSize?: number; fontFamily?: string; lineHeight?: number;
  cursorBlink?: boolean; cursorStyle?: 'block' | 'underline' | 'bar'; theme?: ITheme;
  scrollback?: number; allowTransparency?: boolean; convertEol?: boolean; disableStdin?: boolean;
  smoothScrollDuration?: number;
  /** Optional isolated engine; otherwise init() supplies the shared instance. */
  engine?: AkittyEngine;
}
export interface ITerminalCore { cols: number; rows: number; element?: HTMLElement; textarea?: HTMLTextAreaElement }
export interface ITerminalAddon extends IDisposable { activate(terminal: ITerminalCore): void }
export interface IKeyEvent { key: string; domEvent: KeyboardEvent }
export interface IUnicodeVersionProvider { readonly activeVersion: string }
export interface IBufferRange { start: { x: number; y: number }; end: { x: number; y: number } }
export interface IBufferNamespace {
  readonly active: IBuffer; readonly normal: IBuffer; readonly alternate: IBuffer;
  readonly onBufferChange: IEvent<IBuffer>;
}
export interface IBuffer {
  readonly type: 'normal' | 'alternate'; readonly cursorX: number; readonly cursorY: number;
  /** Current scroll distance from the live screen, in whole rows. */
  readonly viewportY: number;
  /** Number of retained history rows preceding the live screen. */
  readonly baseY: number;
  readonly length: number;
  getLine(absoluteRow: number): IBufferLine | undefined;
  getNullCell(): IBufferCell;
}
export interface IBufferLine {
  readonly length: number;
  /** This row continues the preceding row through a soft wrap. */
  readonly isWrapped: boolean;
  getCell(column: number): IBufferCell | undefined;
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
}
export interface IBufferCell {
  getChars(): string; getCode(): number; getCodepoint(): number; getWidth(): number;
  getFgColorMode(): number; getBgColorMode(): number; getFgColor(): number; getBgColor(): number;
  isBold(): number; isItalic(): number; isUnderline(): number; isStrikethrough(): number;
  isBlink(): number; isInverse(): number; isInvisible(): number; isFaint(): number;
  getHyperlinkId(): number; isDim(): boolean;
}
