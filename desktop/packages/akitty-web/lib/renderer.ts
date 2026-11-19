/** Canvas presentation of AkiTTY cells with row damage tracking and scroll reuse. */
import { cellChar } from './codepoint';
import { CellFlags } from './types';
import type { ITheme } from './interfaces';
import type { TerminalCell } from './types';
import type { SelectionCoordinates, SelectionManager } from './selection-manager';
export interface IRenderable {
  getLine(row: number): TerminalCell[] | null; getLineView?(row: number): TerminalCell[] | null;
  prepareRows?(rows: ReadonlySet<number>): void;
  getCursor(): { x: number; y: number; visible: boolean }; getDimensions(): { cols: number; rows: number };
  isRowDirty(row: number): boolean; isDirty?(): boolean; needsFullRedraw?(): boolean; clearDirty(): void;
  getGraphemeString?(row: number, col: number): string;
  getColors?(): { cursor: { r: number; g: number; b: number } | null };
}
export interface IScrollbackProvider { getScrollbackLine(row: number): TerminalCell[] | null; getScrollbackLength(): number;
  getScrollbackGraphemeString?(row: number, col: number): string }
export interface RendererOptions { fontSize?: number; fontFamily?: string; lineHeight?: number; cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean; theme?: ITheme; devicePixelRatio?: number }
export interface FontMetrics { width: number; height: number; baseline: number }
interface Hover { startX: number; startY: number; endX: number; endY: number }
export const DEFAULT_THEME: Required<ITheme> = {
  foreground: '#d4d4d4', background: '#1e1e1e', cursor: '#ffffff', cursorAccent: '#1e1e1e',
  selectionBackground: '#d4d4d4', selectionForeground: '#1e1e1e',
  black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510', blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
  brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#ffffff',
};
const css = (r: number, g: number, b: number): string => `rgb(${r},${g},${b})`;
const inRange = (x: number, y: number, firstX: number, firstY: number, lastX: number, lastY: number): boolean =>
  y >= firstY && y <= lastY && (y !== firstY || x >= firstX) && (y !== lastY || x <= lastX);

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private fontSize: number;
  private fontFamily: string;
  private lineHeight: number;
  private cursorStyle: 'block' | 'underline' | 'bar';
  private theme: Required<ITheme>;
  private readonly dprPinned: boolean;
  private devicePixelRatio: number;
  private metrics: FontMetrics;
  private dimensions?: { cols: number; rows: number; width: number; height: number; dpr: number; pixelWidth: number; pixelHeight: number };
  private cursorVisible = true;
  private blinkTimer?: ReturnType<typeof setInterval>;
  private lastCursor = { x: -1, y: -1, visible: false };
  private lastCursorColor = '';
  private viewport = 0;
  private history = 0;
  private scrollbar = 0;
  private invalid = true;
  private closed = false;
  private selectionManager?: SelectionManager;
  private hoveredId = 0;
  private hoveredRange: Hover | null = null;
  private lastSelection = '';
  private font = '';
  private fill = '';
  private drawnRows: (number | undefined)[] = [];
  private frameLines: (TerminalCell[] | null | undefined)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('AkiTTY canvas rendering is unavailable');
    this.ctx = context;
    this.fontSize = options.fontSize ?? 15; this.fontFamily = options.fontFamily ?? 'monospace'; this.lineHeight = options.lineHeight ?? 1;
    this.cursorStyle = options.cursorStyle ?? 'block'; this.theme = { ...DEFAULT_THEME, ...options.theme };
    this.dprPinned = options.devicePixelRatio !== undefined; this.devicePixelRatio = options.devicePixelRatio ?? window.devicePixelRatio ?? 1;
    this.metrics = this.measure(); this.setCursorBlink(options.cursorBlink ?? false);
  }
  private measure(): FontMetrics {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) throw new Error('AkiTTY font measurement is unavailable');
    context.font = `${this.fontSize}px ${this.fontFamily}`;
    const sample = context.measureText('M');
    const ascent = sample.actualBoundingBoxAscent || this.fontSize * 0.8;
    const descent = sample.actualBoundingBoxDescent || this.fontSize * 0.2;
    const body = Math.ceil(ascent + descent), leading = Math.max(0, Math.round(body * (this.lineHeight - 1)));
    return { width: Math.max(1, Math.ceil(sample.width)), height: body + leading + 2, baseline: Math.ceil(ascent) + 1 + Math.floor(leading / 2) };
  }
  remeasureFont(): void { this.metrics = this.measure(); this.invalid = true; }
  getMetrics(): FontMetrics { return { ...this.metrics }; }
  getCanvas(): HTMLCanvasElement { return this.canvas; }
  get charWidth(): number { return this.metrics.width; }
  get charHeight(): number { return this.metrics.height; }
  resize(cols: number, rows: number): void {
    const width = cols * this.metrics.width, height = rows * this.metrics.height;
    const pixelWidth = Math.round(width * this.devicePixelRatio), pixelHeight = Math.round(height * this.devicePixelRatio);
    this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
    this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    this.ctx.textBaseline = 'alphabetic';
    this.dimensions = { cols, rows, width: this.metrics.width, height: this.metrics.height, dpr: this.devicePixelRatio, pixelWidth, pixelHeight };
    this.font = ''; this.fill = ''; this.drawnRows = []; this.invalid = true;
  }
  private setFill(color: string): void { if (color !== this.fill) { this.fill = color; this.ctx.fillStyle = color; } }
  private fetchLine(buffer: IRenderable, row: number): TerminalCell[] | null {
    if (this.frameLines[row] === undefined) this.frameLines[row] = buffer.getLineView?.(row) ?? buffer.getLine(row);
    return this.frameLines[row] ?? null;
  }
  private rowHash(buffer: IRenderable, row: number): number | undefined {
    const cells = this.fetchLine(buffer, row);
    if (!cells) return undefined;
    let hash = 2166136261;
    for (const cell of cells) {
      // Complex glyphs may overhang a row; a reported write repaints them even
      // when their logical contents are unchanged.
      if (cell.codepoint > 127 || cell.grapheme_len || cell.flags & CellFlags.ITALIC) return undefined;
      for (const value of [cell.codepoint, cell.flags, cell.width, cell.fg_r, cell.fg_g, cell.fg_b, cell.bg_r, cell.bg_g, cell.bg_b, cell.underline_style ?? 0, cell.underline_color ?? 0]) {
        hash = Math.imul(hash ^ value, 16777619);
      }
    }
    return hash >>> 0;
  }
  /** Returns true when the frame painted anything. */
  render(buffer: IRenderable, forceAll = false, viewportY = 0, history?: IScrollbackProvider, scrollbarOpacity = 1): boolean {
    if (this.closed) return false;
    const cursor = buffer.getCursor(), dims = buffer.getDimensions();
    if (!this.dprPinned) this.devicePixelRatio = window.devicePixelRatio || 1;
    const previous = this.dimensions;
    if (!previous || previous.cols !== dims.cols || previous.rows !== dims.rows || previous.width !== this.metrics.width || previous.height !== this.metrics.height
      || previous.dpr !== this.devicePixelRatio || previous.pixelWidth !== this.canvas.width || previous.pixelHeight !== this.canvas.height) {
      this.resize(dims.cols, dims.rows); forceAll = true;
    }
    const historyLength = history?.getScrollbackLength() ?? 0;
    const opacity = history && scrollbarOpacity > 0 ? scrollbarOpacity : 0;
    const anyDirty = buffer.isDirty?.() ?? true;
    const dirtyRows = new Set<number>();
    if (anyDirty) for (let row = 0; row < dims.rows; row++) if (buffer.isRowDirty(row)) dirtyRows.add(row);
    forceAll ||= this.invalid || buffer.needsFullRedraw?.() === true || viewportY !== this.viewport
      || opacity !== this.scrollbar || opacity > 0 && historyLength !== this.history || viewportY > 0 && dirtyRows.size > 0;
    const shownCursor = { ...cursor, visible: viewportY === 0 && cursor.visible && this.cursorVisible };
    const engineCursor = buffer.getColors?.().cursor;
    const cursorColor = engineCursor ? css(engineCursor.r, engineCursor.g, engineCursor.b) : this.theme.cursor;
    const cursorChanged = shownCursor.x !== this.lastCursor.x || shownCursor.y !== this.lastCursor.y || shownCursor.visible !== this.lastCursor.visible
      || cursorColor !== this.lastCursorColor;
    const selection = this.selectionManager?.getSelectionCoords() ?? null;
    const selectionKey = selection ? `${selection.startCol}:${selection.startRow}:${selection.endCol}:${selection.endRow}` : '';
    forceAll ||= selectionKey !== this.lastSelection;
    const selectionRows = this.selectionManager?.getDirtySelectionRows();
    if (!forceAll && !anyDirty && !cursorChanged && !selectionRows?.size) {
      return false;
    }
    this.frameLines.length = 0; this.font = ''; this.fill = '';
    const reusable = viewportY === 0 && !selection && !this.hoveredId && !this.hoveredRange;
    let hashes: (number | undefined)[] | undefined;
    let shift = 0;
    const retainHashes = !forceAll && this.drawnRows.length === dims.rows;
    if (!forceAll) {
      const needed = new Set(dirtyRows);
      if (cursorChanged) { needed.add(this.lastCursor.y); needed.add(shownCursor.y); }
      for (const row of selectionRows ?? []) needed.add(row);
      // A transition back to row reuse needs a complete hash baseline.
      if (!reusable || retainHashes) buffer.prepareRows?.(needed);
    }
    if (reusable) {
      hashes = Array.from({ length: dims.rows }, (_, row) => retainHashes && !dirtyRows.has(row) ? this.drawnRows[row] : this.rowHash(buffer, row));
      const differences = hashes.filter((hash, row) => hash !== this.drawnRows[row]).length;
      const opaque = !/rgba|transparent|hsla/i.test(this.theme.background) && !/^#[a-f0-9]{4}(?:[a-f0-9]{4})?$/i.test(this.theme.background);
      if (!forceAll && differences > dims.rows / 2 && opaque && Number.isInteger(this.metrics.height * this.devicePixelRatio) && this.drawnRows.length === dims.rows) {
        let best = dims.rows - differences;
        for (let amount = 1; amount <= Math.floor(dims.rows / 2); amount++) {
          let matches = 0;
          for (let row = 0; row + amount < dims.rows; row++) if (hashes[row] !== undefined && hashes[row] === this.drawnRows[row + amount]) matches++;
          if (matches >= Math.ceil(dims.rows / 2) && matches > best) { shift = amount; best = matches; }
        }
        if (shift) {
          const pixels = Math.round(shift * this.metrics.height * this.devicePixelRatio);
          const width = this.canvas.width, height = this.canvas.height - pixels;
          this.ctx.save(); this.ctx.setTransform(1, 0, 0, 1, 0, 0);
          this.ctx.drawImage(this.canvas, 0, pixels, width, height, 0, 0, width, height); this.ctx.restore();
          this.fill = ''; this.font = '';
        }
      }
    } else this.drawnRows = [];
    const offset = Math.max(0, Math.floor(viewportY));
    let cursorRowPainted = false;
    for (let row = 0; row < dims.rows; row++) {
      const movedCursorRow = cursorChanged && (row === this.lastCursor.y || row === shownCursor.y);
      const cursorRepair = shift > 0 && (row === this.lastCursor.y - shift || row === shownCursor.y || row === 0);
      const reported = dirtyRows.has(row);
      const changed = hashes ? hashes[row] === undefined ? reported : hashes[row] !== this.drawnRows[row + shift] : reported;
      if (!forceAll && !changed && !movedCursorRow && !cursorRepair && !selectionRows?.has(row)) continue;
      let cells: TerminalCell[] | null;
      let sourceRow = row;
      if (offset > row) { sourceRow = historyLength + row - offset; cells = sourceRow >= 0 ? history?.getScrollbackLine(sourceRow) ?? null : null; }
      else { sourceRow = row - offset; cells = this.fetchLine(buffer, sourceRow); }
      this.paintRow(cells, row, dims.cols, selection,
        col => offset > row ? history?.getScrollbackGraphemeString?.(sourceRow, col) ?? '' : buffer.getGraphemeString?.(sourceRow, col) ?? '');
      if (row === shownCursor.y) cursorRowPainted = true;
    }
    if (hashes) this.drawnRows = hashes;
    if (cursorRowPainted) this.cursor(shownCursor, cursorColor);
    if (opacity > 0 && historyLength > 0) {
      const height = dims.rows * this.metrics.height, thumb = Math.max(20, height * dims.rows / (historyLength + dims.rows));
      this.setFill(`rgba(128,128,128,${0.7 * opacity})`);
      this.ctx.fillRect(dims.cols * this.metrics.width - 8, (height - thumb) * (historyLength - offset) / historyLength, 6, thumb);
    }
    this.lastCursor = shownCursor; this.viewport = viewportY; this.history = historyLength; this.scrollbar = opacity; this.invalid = false;
    this.lastCursorColor = cursorColor;
    this.lastSelection = selectionKey;
    this.selectionManager?.clearDirtySelectionRows(); buffer.clearDirty();
    return true;
  }
  private paintRow(cells: TerminalCell[] | null, row: number, cols: number, selection: SelectionCoordinates | null, grapheme: (col: number) => string): void {
    const { width, height, baseline } = this.metrics;
    this.ctx.clearRect(0, row * height, cols * width, height);
    this.setFill(this.theme.background); this.ctx.fillRect(0, row * height, cols * width, height);
    if (!cells) return;
    const selected = (col: number): boolean => !!selection && inRange(col, row, selection.startCol, selection.startRow, selection.endCol, selection.endRow);
    const backgroundAt = (col: number): string => {
      const cell = cells[col];
      return selected(col) ? this.theme.selectionBackground : cell.flags & CellFlags.INVERSE
        ? css(cell.fg_r, cell.fg_g, cell.fg_b) : css(cell.bg_r, cell.bg_g, cell.bg_b);
    };
    const count = Math.min(cols, cells.length);
    for (let col = 0; col < count;) {
      const start = col, bg = backgroundAt(col++);
      while (col < count && backgroundAt(col) === bg) col++;
      this.setFill(bg); this.ctx.fillRect(start * width, row * height, (col - start) * width, height);
    }
    for (let col = 0; col < Math.min(cols, cells.length); col++) {
      const cell = cells[col];
      if (!cell.width) continue;
      const reversed = !!(cell.flags & CellFlags.INVERSE), isSelected = selected(col);
      const color = isSelected ? this.theme.selectionForeground : reversed ? css(cell.bg_r, cell.bg_g, cell.bg_b) : css(cell.fg_r, cell.fg_g, cell.fg_b);
      const font = `${cell.flags & CellFlags.ITALIC ? 'italic ' : ''}${cell.flags & CellFlags.BOLD ? 'bold ' : ''}${this.fontSize}px ${this.fontFamily}`;
      if (font !== this.font) { this.ctx.font = font; this.font = font; }
      this.setFill(color);
      const glyph = cell.grapheme_len ? grapheme(col) || cellChar(cell.codepoint) : cellChar(cell.codepoint);
      if (glyph !== ' ' && !(cell.flags & CellFlags.INVISIBLE)) {
        if (cell.flags & CellFlags.FAINT) this.ctx.globalAlpha = 0.65;
        this.ctx.fillText(glyph, col * width, row * height + baseline);
        this.ctx.globalAlpha = 1;
      }
      const hover = this.hoveredId !== 0 && cell.hyperlink_id === this.hoveredId
        || this.hoveredRange !== null && inRange(col, row, this.hoveredRange.startX, this.hoveredRange.startY, this.hoveredRange.endX, this.hoveredRange.endY);
      if (cell.flags & CellFlags.UNDERLINE || hover) {
        if (!isSelected && cell.underline_color !== undefined) this.setFill(css(cell.underline_color >>> 16, (cell.underline_color >>> 8) & 255, cell.underline_color & 255));
        const style = cell.underline_style || 1, left = col * width, y = row * height + Math.min(height - 1, baseline + 2), span = cell.width * width;
        if (style === 3 || style === 4 || style === 5) {
          const segment = style === 4 ? 1 : 3;
          for (let x = 0; x < span; x += segment + 1) this.ctx.fillRect(left + x, y + (style === 3 ? x % 2 : 0), Math.min(segment, span - x), 1);
        } else { this.ctx.fillRect(left, y, span, 1); if (style === 2) this.ctx.fillRect(left, y - 2, span, 1); }
      }
      if (cell.flags & CellFlags.STRIKETHROUGH) { this.setFill(color); this.ctx.fillRect(col * width, row * height + Math.round(baseline * 0.65), cell.width * width, 1); }
    }
  }
  private cursor(cursor: { x: number; y: number; visible: boolean }, color: string): void {
    if (!cursor.visible) return;
    const { width, height } = this.metrics;
    this.setFill(color);
    this.ctx.globalAlpha = this.cursorStyle === 'block' ? 0.5 : 1;
    this.ctx.fillRect(cursor.x * width, cursor.y * height + (this.cursorStyle === 'underline' ? height - 2 : 0),
      this.cursorStyle === 'bar' ? 2 : width, this.cursorStyle === 'underline' ? 2 : height);
    this.ctx.globalAlpha = 1;
  }
  setTheme(theme: ITheme): void { this.theme = { ...DEFAULT_THEME, ...theme }; this.invalid = true; this.drawnRows = []; }
  setFontSize(size: number): void { this.fontSize = size; this.remeasureFont(); }
  setFontFamily(family: string): void { this.fontFamily = family; this.remeasureFont(); }
  setLineHeight(height: number): void { this.lineHeight = height; this.remeasureFont(); }
  setCursorStyle(style: 'block' | 'underline' | 'bar'): void { this.cursorStyle = style; this.invalid = true; }
  setCursorBlink(enabled: boolean): void {
    clearInterval(this.blinkTimer); this.blinkTimer = undefined; this.cursorVisible = true;
    if (enabled) this.blinkTimer = setInterval(() => { this.cursorVisible = !this.cursorVisible; }, 530);
  }
  setSelectionManager(manager: SelectionManager): void { this.selectionManager = manager; this.invalid = true; }
  setHoveredHyperlinkId(id: number): void { if (id !== this.hoveredId) { this.hoveredId = id; this.invalid = true; } }
  setHoveredLinkRange(range: Hover | null): void {
    if (JSON.stringify(range) !== JSON.stringify(this.hoveredRange)) { this.hoveredRange = range; this.invalid = true; }
  }
  clear(): void { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.invalid = true; this.drawnRows = []; }
  dispose(): void { if (!this.closed) { this.closed = true; clearInterval(this.blinkTimer); this.blinkTimer = undefined; this.drawnRows = []; this.frameLines = []; } }
}
