/**
 * Canvas Renderer for Terminal Display
 *
 * High-performance canvas-based renderer that draws the terminal using
 * Ghostty's WASM terminal emulator. Features:
 * - Font metrics measurement with DPI scaling
 * - Full color support (256-color palette + RGB)
 * - All text styles (bold, italic, underline, strikethrough, etc.)
 * - Multiple cursor styles (block, underline, bar)
 * - Dirty line optimization for 60 FPS
 */

import { cellChar } from './codepoint';
import type { ITheme } from './interfaces';
import type { SelectionManager } from './selection-manager';
import type { GhosttyCell, ILink } from './types';
import { CellFlags } from './types';

// Interface for objects that can be rendered
export interface IRenderable {
  getLine(y: number): GhosttyCell[] | null;
  /**
   * Optional cheaper variant of getLine() that may return shared cell objects, valid only until the buffer is next
   * written. The renderer reads lines synchronously, so it prefers this when present.
   */
  getLineView?(y: number): GhosttyCell[] | null;
  getCursor(): { x: number; y: number; visible: boolean };
  getDimensions(): { cols: number; rows: number };
  isRowDirty(y: number): boolean;
  /**
   * Optional cheap check that any row at all changed since clearDirty(). When it returns false the renderer skips
   * polling every row, so a frame with no output costs a few wasm calls instead of one per row.
   */
  isDirty?(): boolean;
  /** Returns true if a full redraw is needed (e.g., screen change) */
  needsFullRedraw?(): boolean;
  clearDirty(): void;
  /**
   * Get the full grapheme string for a cell at (row, col).
   * For cells with grapheme_len > 0, this returns all codepoints combined.
   * For simple cells, returns the single character.
   */
  getGraphemeString?(row: number, col: number): string;
}

export interface IScrollbackProvider {
  getScrollbackLine(offset: number): GhosttyCell[] | null;
  getScrollbackLength(): number;
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface RendererOptions {
  fontSize?: number; // Default: 15
  fontFamily?: string; // Default: 'monospace'
  lineHeight?: number; // Row height as a multiple of the font's height. Default: 1
  cursorStyle?: 'block' | 'underline' | 'bar'; // Default: 'block'
  cursorBlink?: boolean; // Default: false
  theme?: ITheme;
  devicePixelRatio?: number; // Default: window.devicePixelRatio
}

export interface FontMetrics {
  width: number; // Character cell width in CSS pixels
  height: number; // Character cell height in CSS pixels
  baseline: number; // Distance from top to text baseline
}

// ============================================================================
// Default Theme
// ============================================================================

export const DEFAULT_THEME: Required<ITheme> = {
  foreground: '#d4d4d4',
  background: '#1e1e1e',
  cursor: '#ffffff',
  cursorAccent: '#1e1e1e',
  // Selection colors: solid colors that replace cell bg/fg when selected
  // Using Ghostty's approach: selection bg = default fg, selection fg = default bg
  selectionBackground: '#d4d4d4',
  selectionForeground: '#1e1e1e',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

// ============================================================================
// CanvasRenderer Class
// ============================================================================

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fontSize: number;
  private fontFamily: string;
  private lineHeight: number;
  private cursorStyle: 'block' | 'underline' | 'bar';
  private cursorBlink: boolean;
  private theme: Required<ITheme>;
  private devicePixelRatio: number;
  private metrics: FontMetrics;
  private palette: string[];

  // Cursor blinking state
  private cursorVisible: boolean = true;
  private cursorBlinkInterval?: number;
  private lastCursorPosition: { x: number; y: number } = { x: 0, y: 0 };

  // Viewport tracking (for scrolling)
  private lastViewportY: number = 0;
  private lastScrollbackLength: number = 0;
  private lastScrollbarOpacity: number = 0;
  private lastCursorDrawnVisible: boolean = true;
  // Canvas state shadows, valid within one render(): skip redundant font/fill assignments (each one re-parses a CSS
  // string). -1 means unknown.
  private fontStyleBits: number = -1;
  private fillKey: number = -1;
  /**
   * Content hash of what each screen row currently shows on the canvas, or undefined when unknown. Kept only for the
   * live view without selection, link hover or scrollbar, where a row's pixels depend on its cells alone; it lets a
   * frame skip dirty rows that did not really change and move a scrolled screen with one canvas copy.
   */
  private drawnRows: (number | undefined)[] = [];
  /** Screen lines already fetched this frame (by hashing), so drawing them does not fetch again. */
  private frameLines: (GhosttyCell[] | null | undefined)[] = [];
  /** Rows hashed this frame that hold anything but plain ASCII, whose glyphs may overflow into neighbouring rows. */
  private frameOverflow: boolean[] = [];

  // Current buffer being rendered (for grapheme lookups)
  private currentBuffer: IRenderable | null = null;

  // Selection manager (for rendering selection)
  private selectionManager?: SelectionManager;
  // Cached selection coordinates for current render pass (viewport-relative)
  private currentSelectionCoords: {
    startCol: number;
    startRow: number;
    endCol: number;
    endRow: number;
  } | null = null;

  // Link rendering state
  private hoveredHyperlinkId: number = 0;
  private previousHoveredHyperlinkId: number = 0;

  // Regex link hover tracking (for links without hyperlink_id)
  private hoveredLinkRange: { startX: number; startY: number; endX: number; endY: number } | null =
    null;
  private previousHoveredLinkRange: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null = null;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;

    // Apply options
    this.fontSize = options.fontSize ?? 15;
    this.fontFamily = options.fontFamily ?? 'monospace';
    this.lineHeight = options.lineHeight ?? 1;
    this.cursorStyle = options.cursorStyle ?? 'block';
    this.cursorBlink = options.cursorBlink ?? false;
    this.theme = { ...DEFAULT_THEME, ...options.theme };
    this.devicePixelRatio = options.devicePixelRatio ?? window.devicePixelRatio ?? 1;

    // Build color palette (16 ANSI colors)
    this.palette = [
      this.theme.black,
      this.theme.red,
      this.theme.green,
      this.theme.yellow,
      this.theme.blue,
      this.theme.magenta,
      this.theme.cyan,
      this.theme.white,
      this.theme.brightBlack,
      this.theme.brightRed,
      this.theme.brightGreen,
      this.theme.brightYellow,
      this.theme.brightBlue,
      this.theme.brightMagenta,
      this.theme.brightCyan,
      this.theme.brightWhite,
    ];

    // Measure font metrics
    this.metrics = this.measureFont();

    // Setup cursor blinking if enabled
    if (this.cursorBlink) {
      this.startCursorBlink();
    }
  }

  // ==========================================================================
  // Font Metrics Measurement
  // ==========================================================================

  private measureFont(): FontMetrics {
    // Use an offscreen canvas for measurement
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Set font (use actual pixel size for accurate measurement)
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;

    // Measure width using 'M' (typically widest character)
    const widthMetrics = ctx.measureText('M');
    const width = Math.ceil(widthMetrics.width);

    // Measure height using ascent + descent with padding for glyph overflow
    const ascent = widthMetrics.actualBoundingBoxAscent || this.fontSize * 0.8;
    const descent = widthMetrics.actualBoundingBoxDescent || this.fontSize * 0.2;

    // Add 2px padding to height to account for glyphs that overflow (like 'f', 'd', 'g', 'p')
    // and anti-aliasing pixels
    const glyphHeight = Math.ceil(ascent + descent);
    // lineHeight > 1 adds leading split above and below the glyphs, as CSS line-height does
    const leading = Math.max(0, Math.round((this.lineHeight - 1) * glyphHeight));
    const height = glyphHeight + 2 + leading;
    const baseline = Math.ceil(ascent) + 1 + Math.floor(leading / 2); // Offset baseline by half the padding

    return { width, height, baseline };
  }

  /**
   * Remeasure font metrics (call after font loads or changes)
   */
  public remeasureFont(): void {
    this.metrics = this.measureFont();
  }

  // ==========================================================================
  // Color Conversion
  // ==========================================================================

  private rgbToCSS(r: number, g: number, b: number): string {
    return `rgb(${r}, ${g}, ${b})`;
  }

  // ==========================================================================
  // Canvas Sizing
  // ==========================================================================

  /**
   * Resize canvas to fit terminal dimensions
   */
  public resize(cols: number, rows: number): void {
    const cssWidth = cols * this.metrics.width;
    const cssHeight = rows * this.metrics.height;

    // Set CSS size (what user sees)
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    // Set actual canvas size (scaled for DPI)
    this.canvas.width = cssWidth * this.devicePixelRatio;
    this.canvas.height = cssHeight * this.devicePixelRatio;

    this.drawnRows = [];

    // Scale context to match DPI (setting canvas.width/height resets the context)
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);

    // Set text rendering properties for crisp text
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.textAlign = 'left';

    // Fill background after resize
    this.ctx.fillStyle = this.theme.background;
    this.ctx.fillRect(0, 0, cssWidth, cssHeight);
  }

  // ==========================================================================
  // Main Rendering
  // ==========================================================================

  /**
   * Render the terminal buffer to canvas
   */
  public render(
    buffer: IRenderable,
    forceAll: boolean = false,
    viewportY: number = 0,
    scrollbackProvider?: IScrollbackProvider,
    scrollbarOpacity: number = 1
  ): void {
    // Store buffer reference for grapheme lookups in renderCell
    this.currentBuffer = buffer;
    this.frameLines = [];
    this.frameOverflow = [];
    this.fontStyleBits = -1;
    this.fillKey = -1;

    // getCursor() calls update() internally to ensure fresh state.
    // Multiple update() calls are safe - dirty state persists until clearDirty().
    const cursor = buffer.getCursor();
    const dims = buffer.getDimensions();
    const scrollbackLength = scrollbackProvider ? scrollbackProvider.getScrollbackLength() : 0;

    // Nothing changed since the last clearDirty() means no row can be dirty, so row polling below is skipped.
    const anyDirty = buffer.isDirty ? buffer.isDirty() : true;
    const isRowDirty = (y: number): boolean => anyDirty && buffer.isRowDirty(y);

    // Every row changed (a scroll, a screen switch between normal and alternate). With row reuse below that only
    // means every row is dirty, since isRowDirty() then reports them all; without it, repaint everything.
    const allDirty = anyDirty && buffer.needsFullRedraw?.() === true;

    // Resize canvas if dimensions changed
    const needsResize =
      this.canvas.width !== dims.cols * this.metrics.width * this.devicePixelRatio ||
      this.canvas.height !== dims.rows * this.metrics.height * this.devicePixelRatio;

    if (needsResize) {
      this.resize(dims.cols, dims.rows);
      forceAll = true; // Force full render after resize
    }

    // Force re-render when viewport changes (scrolling)
    if (viewportY !== this.lastViewportY) {
      forceAll = true;
      this.lastViewportY = viewportY;
    }

    // The scrollbar paints over (and clears) a strip of the cell area, so any change to it, or to the history it
    // describes, needs the rows underneath repainted.
    // A hidden scrollbar paints nothing, so growing history alone (every line of streaming output) repaints nothing.
    const scrollbarShown = scrollbackProvider && scrollbarOpacity > 0 ? scrollbarOpacity : 0;
    if (
      scrollbarShown !== this.lastScrollbarOpacity ||
      (scrollbarShown > 0 && scrollbackLength !== this.lastScrollbackLength)
    ) {
      forceAll = true;
    }
    this.lastScrollbarOpacity = scrollbarShown;
    this.lastScrollbackLength = scrollbackLength;

    // Row reuse (see drawnRows). Rows are hashed only when dirty; a clean row keeps its drawn hash. Rows that are not a
    // whole number of device pixels tall share antialiased edge pixels with their neighbours, so there a row's pixels
    // do not depend on its cells alone and nothing is reused.
    const reuse =
      Number.isInteger(this.metrics.height * this.devicePixelRatio) &&
      viewportY === 0 &&
      scrollbarShown === 0 &&
      !this.selectionManager?.hasSelection() &&
      this.hoveredHyperlinkId === 0 &&
      !this.hoveredLinkRange;
    let hashes: (number | undefined)[] | null = null;
    let shifted = false;
    if (!reuse) {
      if (allDirty) forceAll = true;
      this.drawnRows = [];
    } else {
      if (forceAll || this.drawnRows.length !== dims.rows) {
        this.drawnRows = new Array<number | undefined>(dims.rows).fill(undefined);
      }
      const drawn = this.drawnRows;
      hashes = new Array<number | undefined>(dims.rows);
      for (let y = 0; y < dims.rows; y++) {
        hashes[y] = forceAll || isRowDirty(y) ? this.rowHash(buffer, y) : drawn[y];
      }
      const shift = forceAll || !anyDirty ? 0 : this.scrollShift(hashes, drawn);
      if (shift > 0) {
        this.copyRowsUp(shift, dims.rows);
        shifted = true;
        // The canvas now shows each drawn row k rows higher, the old cursor included.
        drawn.copyWithin(0, shift);
        drawn.fill(undefined, dims.rows - shift);
        // Row 0's band may hold overflow copied from the row above it, which scrolled away.
        drawn[0] = undefined;
        this.lastCursorPosition = { x: this.lastCursorPosition.x, y: this.lastCursorPosition.y - shift };
        for (let y = 0; y < dims.rows; y++) if (hashes[y] === undefined) hashes[y] = this.rowHash(buffer, y);
      }
    }
    // A row needs drawing when its content differs from what the canvas shows there. Without reuse that is the
    // terminal's dirty flag; with it, a dirty row that hashes the same as its drawn pixels is skipped.
    // A dirty row that may overflow is always redrawn, as before: its overflow and its neighbours' repaint interact, so
    // skipping it would move where stray antialiasing collects. After a copy its overflow moved with it exactly.
    const rowChanged = (y: number): boolean => {
      if (!hashes) return isRowDirty(y);
      if (!shifted && !isRowDirty(y)) return false;
      if (!shifted && this.frameOverflow[y]) return true;
      const drawn = this.drawnRows[y];
      return drawn === undefined || hashes[y] === undefined || drawn !== hashes[y];
    };

    // Check if cursor position changed or if blinking (need to redraw cursor line)
    const cursorMoved =
      cursor.x !== this.lastCursorPosition.x || cursor.y !== this.lastCursorPosition.y;
    const cursorDrawnVisible = cursor.visible && this.cursorVisible;
    const cursorBlinkChanged = this.cursorBlink && cursorDrawnVisible !== this.lastCursorDrawnVisible;
    this.lastCursorDrawnVisible = cursorDrawnVisible;
    // The rows the cursor left or reached are redrawn with the other rows below, so they get the same neighbour
    // repaint: drawing one alone would paint its glyph overflow a second time into the rows around it.
    const cursorRows = new Set<number>();
    if (cursorMoved || cursorBlinkChanged) {
      cursorRows.add(cursor.y);
      if (cursorMoved) cursorRows.add(this.lastCursorPosition.y);
    }

    // Check if we need to redraw selection-related lines
    const hasSelection = this.selectionManager && this.selectionManager.hasSelection();
    const selectionRows = new Set<number>();

    // Cache selection coordinates for use during cell rendering
    // This is used by isInSelection() to determine if a cell needs selection colors
    this.currentSelectionCoords = hasSelection ? this.selectionManager!.getSelectionCoords() : null;

    // Mark current selection rows for redraw (includes programmatic selections)
    if (this.currentSelectionCoords) {
      const coords = this.currentSelectionCoords;
      for (let row = coords.startRow; row <= coords.endRow; row++) {
        selectionRows.add(row);
      }
    }

    // Always mark dirty selection rows for redraw (to clear old overlay)
    if (this.selectionManager) {
      const dirtyRows = this.selectionManager.getDirtySelectionRows();
      if (dirtyRows.size > 0) {
        for (const row of dirtyRows) {
          selectionRows.add(row);
        }
        // Clear the dirty rows tracking after marking for redraw
        this.selectionManager.clearDirtySelectionRows();
      }
    }

    // Track rows with hyperlinks that need redraw when hover changes
    const hyperlinkRows = new Set<number>();
    const hyperlinkChanged = this.hoveredHyperlinkId !== this.previousHoveredHyperlinkId;
    const linkRangeChanged = !sameLinkRange(this.hoveredLinkRange, this.previousHoveredLinkRange);

    if (hyperlinkChanged) {
      // Find rows containing the old or new hovered hyperlink
      // Must check the correct buffer based on viewportY (scrollback vs screen)
      for (let y = 0; y < dims.rows; y++) {
        let line: GhosttyCell[] | null = null;

        // Same logic as rendering: fetch from scrollback or screen
        if (viewportY > 0) {
          if (y < viewportY && scrollbackProvider) {
            // This row is from scrollback
            // Floor viewportY for array access (handles fractional values during smooth scroll)
            const scrollbackOffset = scrollbackLength - Math.floor(viewportY) + y;
            line = scrollbackProvider.getScrollbackLine(scrollbackOffset);
          } else {
            // This row is from visible screen
            const screenRow = y - Math.floor(viewportY);
            line = this.fetchLine(buffer, screenRow);
          }
        } else {
          // At bottom - fetch from visible screen
          line = this.fetchLine(buffer, y);
        }

        if (line) {
          for (const cell of line) {
            if (
              cell.hyperlink_id === this.hoveredHyperlinkId ||
              cell.hyperlink_id === this.previousHoveredHyperlinkId
            ) {
              hyperlinkRows.add(y);
              break; // Found hyperlink in this row
            }
          }
        }
      }
      // Update previous state
      this.previousHoveredHyperlinkId = this.hoveredHyperlinkId;
    }

    // Track rows affected by link range changes (for regex URLs)
    if (linkRangeChanged) {
      // Add rows from old range
      if (this.previousHoveredLinkRange) {
        for (
          let y = this.previousHoveredLinkRange.startY;
          y <= this.previousHoveredLinkRange.endY;
          y++
        ) {
          hyperlinkRows.add(y);
        }
      }
      // Add rows from new range
      if (this.hoveredLinkRange) {
        for (let y = this.hoveredLinkRange.startY; y <= this.hoveredLinkRange.endY; y++) {
          hyperlinkRows.add(y);
        }
      }
      this.previousHoveredLinkRange = this.hoveredLinkRange;
    }

    // Track if anything was actually rendered
    let anyLinesRendered = false;

    // Determine which rows need rendering.
    // We also include adjacent rows (above and below) for each dirty row to handle
    // glyph overflow - tall glyphs like Devanagari vowel signs can extend into
    // adjacent rows' visual space.
    const rowsToRender = new Set<number>();
    // While scrolled back the visible rows do not map one-to-one onto the screen's dirty rows, so any screen change
    // repaints everything. Otherwise a still, scrolled-back view costs nothing per frame.
    if (viewportY > 0 && !forceAll) {
      if (this.currentSelectionCoords) forceAll = true;
      for (let y = 0; y < dims.rows; y++) {
        if (isRowDirty(y)) {
          forceAll = true;
          break;
        }
      }
    }
    for (let y = 0; y < dims.rows; y++) {
      const needsRender =
        forceAll ||
        (viewportY <= 0 && rowChanged(y)) ||
        cursorRows.has(y) ||
        selectionRows.has(y) ||
        hyperlinkRows.has(y);

      if (needsRender) {
        rowsToRender.add(y);
        // Include adjacent rows to handle glyph overflow
        if (y > 0) rowsToRender.add(y - 1);
        if (y < dims.rows - 1) rowsToRender.add(y + 1);
      }
    }

    // Render each line
    for (let y = 0; y < dims.rows; y++) {
      if (!rowsToRender.has(y)) {
        continue;
      }

      anyLinesRendered = true;

      // Fetch line from scrollback or visible screen
      let line: GhosttyCell[] | null = null;
      if (viewportY > 0) {
        // Scrolled up - need to fetch from scrollback + visible screen
        // When scrolled up N lines, we want to show:
        // - Scrollback lines (from the end) + visible screen lines

        // Check if this row should come from scrollback or visible screen
        if (y < viewportY && scrollbackProvider) {
          // This row is from scrollback (upper part of viewport)
          // Get from end of scrollback buffer
          // Floor viewportY for array access (handles fractional values during smooth scroll)
          const scrollbackOffset = scrollbackLength - Math.floor(viewportY) + y;
          line = scrollbackProvider.getScrollbackLine(scrollbackOffset);
        } else {
          // This row is from visible screen (lower part of viewport)
          const screenRow = viewportY > 0 ? y - Math.floor(viewportY) : y;
          line = this.fetchLine(buffer, screenRow);
        }
      } else {
        // At bottom - fetch from visible screen
        line = this.fetchLine(buffer, y);
      }

      if (line) {
        this.renderLine(line, y, dims.cols);
      }
      if (hashes) this.drawnRows[y] = hashes[y];
    }

    // Selection highlighting is now integrated into renderCellBackground/renderCellText
    // No separate overlay pass needed - this fixes z-order issues with complex glyphs

    // Link underlines are drawn during cell rendering (see renderCell)

    // Render cursor (only if we're at the bottom, not scrolled)
    if (viewportY === 0 && cursor.visible && this.cursorVisible) {
      this.renderCursor(cursor.x, cursor.y);
    }

    // Render scrollbar if scrolled or scrollback exists (with opacity for fade effect)
    if (scrollbackProvider && scrollbarOpacity > 0) {
      this.renderScrollbar(viewportY, scrollbackLength, dims.rows, scrollbarOpacity);
    }

    // Update last cursor position
    this.lastCursorPosition = { x: cursor.x, y: cursor.y };

    // ALWAYS clear dirty flags after rendering, regardless of forceAll.
    // This is critical - if we don't clear after a full redraw, the dirty
    // state persists and the next frame might not detect new changes properly.
    buffer.clearDirty();
  }

  /** Hash of everything in a screen row that affects its pixels. A collision only delays that row's repaint. */
  private rowHash(buffer: IRenderable, y: number): number | undefined {
    const line = this.fetchLine(buffer, y);
    if (!line) return undefined;
    // Two independent 32-bit chains over three words per cell: codepoint with flags and width (bits 0-20, 21-28,
    // 29-30), the foreground, and the background with the hyperlink id folded in.
    let a = 0x811c9dc5 | 0;
    let b = 0x01000193 | 0;
    let overflow = false;
    for (let x = 0; x < line.length; x++) {
      const cell = line[x];
      if (cell.codepoint > 0x7e || cell.grapheme_len > 0 || cell.width !== 1) overflow = true;
      const glyph = cell.codepoint ^ (cell.flags << 21) ^ (cell.width << 29);
      const fg = (cell.fg_r << 16) | (cell.fg_g << 8) | cell.fg_b;
      const bg = ((cell.bg_r << 16) | (cell.bg_g << 8) | cell.bg_b) ^ (cell.hyperlink_id << 24) ^ (cell.hyperlink_id >>> 8);
      a = Math.imul(Math.imul(Math.imul(a ^ glyph, 0x01000193) ^ fg, 0x01000193) ^ bg, 0x01000193);
      b = Math.imul(Math.imul(b ^ bg, 0x5bd1e995) ^ glyph, 0x5bd1e995);
      b = Math.imul(b ^ (b >>> 15) ^ fg, 0x5bd1e995);
      if (cell.grapheme_len > 0 && buffer.getGraphemeString) {
        const text = buffer.getGraphemeString(y, x);
        for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 0x01000193);
      }
    }
    a = Math.imul(a ^ line.length, 0x01000193);
    this.frameOverflow[y] = overflow;
    // 53 bits: a in the high part, the low 21 bits of b below it.
    return (a >>> 0) * 0x200000 + (b & 0x1fffff);
  }

  /**
   * How many rows the screen scrolled up since it was drawn: the shift that lines up the most new rows with drawn ones,
   * if it beats leaving the canvas where it is. 0 when a translucent background would blend the copy into the rows it
   * covers. Reuse already requires rows a whole number of device pixels tall, so the copy is never resampled.
   */
  private scrollShift(hashes: (number | undefined)[], drawn: (number | undefined)[]): number {
    const rows = hashes.length;
    if (rows < 2 || !isOpaqueColor(this.theme.background)) return 0;
    const matches = (k: number) => {
      let count = 0;
      for (let y = 0; y + k < rows; y++) if (hashes[y] !== undefined && hashes[y] === drawn[y + k]) count++;
      return count;
    };
    let best = 0;
    let bestCount = matches(0);
    for (let k = 1; k < rows && rows - k > bestCount; k++) {
      const count = matches(k);
      if (count > bestCount) {
        best = k;
        bestCount = count;
      }
    }
    return best;
  }

  /** Moves the pixels of rows k.. up to row 0, in device pixels so nothing is resampled. */
  private copyRowsUp(k: number, rows: number): void {
    const band = this.metrics.height * this.devicePixelRatio;
    const width = this.canvas.width;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.canvas, 0, k * band, width, (rows - k) * band, 0, 0, width, (rows - k) * band);
    this.ctx.restore();
  }

  private fetchLine(buffer: IRenderable, y: number): GhosttyCell[] | null {
    const fetched = this.frameLines[y];
    if (fetched !== undefined) return fetched;
    const line = buffer.getLineView ? buffer.getLineView(y) : buffer.getLine(y);
    if (y >= 0) this.frameLines[y] = line;
    return line;
  }

  private setFillRGB(r: number, g: number, b: number): void {
    const key = (r << 16) | (g << 8) | b;
    if (key === this.fillKey) return;
    this.fillKey = key;
    this.ctx.fillStyle = this.rgbToCSS(r, g, b);
  }

  /**
   * Render a single line using two-pass approach:
   * 1. First pass: Draw all cell backgrounds
   * 2. Second pass: Draw all cell text and decorations
   *
   * This two-pass approach is necessary for proper rendering of complex scripts
   * like Devanagari where diacritics (like vowel sign ि) can extend LEFT of the
   * base character into the previous cell's visual area. If we draw backgrounds
   * and text in a single pass (cell by cell), the background of cell N would
   * cover any left-extending portions of graphemes from cell N-1.
   */
  private renderLine(line: GhosttyCell[], y: number, cols: number): void {
    const lineY = y * this.metrics.height;

    // Clear line background with theme color.
    // We clear just the cell area - glyph overflow is handled by also
    // redrawing adjacent rows (see render() method).
    this.ctx.fillStyle = this.theme.background;
    this.fillKey = -1;
    this.ctx.fillRect(0, lineY, cols * this.metrics.width, this.metrics.height);

    // PASS 1: Draw all cell backgrounds first
    // This ensures all backgrounds are painted before any text, allowing text
    // to "bleed" across cell boundaries without being covered by adjacent backgrounds
    for (let x = 0; x < line.length; x++) {
      const cell = line[x];
      if (cell.width === 0) continue; // Skip spacer cells for wide characters
      this.renderCellBackground(cell, x, y);
    }

    // PASS 2: Draw all cell text and decorations
    // Now text can safely extend beyond cell boundaries (for complex scripts)
    for (let x = 0; x < line.length; x++) {
      const cell = line[x];
      if (cell.width === 0) continue; // Skip spacer cells for wide characters
      this.renderCellText(cell, x, y);
    }
  }

  /**
   * Render a cell's background only (Pass 1 of two-pass rendering)
   * Selection highlighting is integrated here to avoid z-order issues with
   * complex glyphs (like Devanagari) that extend outside their cell bounds.
   */
  private renderCellBackground(cell: GhosttyCell, x: number, y: number): void {
    const cellX = x * this.metrics.width;
    const cellY = y * this.metrics.height;
    const cellWidth = this.metrics.width * cell.width;

    // Check if this cell is selected
    const isSelected = this.isInSelection(x, y);

    if (isSelected) {
      // Draw selection background (solid color, not overlay)
      this.ctx.fillStyle = this.theme.selectionBackground;
      this.fillKey = -1;
      this.ctx.fillRect(cellX, cellY, cellWidth, this.metrics.height);
      return; // Selection background replaces cell background
    }

    // Extract background color and handle inverse
    let bg_r = cell.bg_r,
      bg_g = cell.bg_g,
      bg_b = cell.bg_b;

    if (cell.flags & CellFlags.INVERSE) {
      // When inverted, background becomes foreground
      bg_r = cell.fg_r;
      bg_g = cell.fg_g;
      bg_b = cell.fg_b;
    }

    // Only draw cell background if it's different from the default (black)
    // This lets the theme background (drawn earlier) show through for default cells
    const isDefaultBg = bg_r === 0 && bg_g === 0 && bg_b === 0;
    if (!isDefaultBg) {
      this.setFillRGB(bg_r, bg_g, bg_b);
      this.ctx.fillRect(cellX, cellY, cellWidth, this.metrics.height);
    }
  }

  /**
   * Render a cell's text and decorations (Pass 2 of two-pass rendering)
   * Selection foreground color is applied here to match the selection background.
   */
  private renderCellText(cell: GhosttyCell, x: number, y: number): void {
    const cellX = x * this.metrics.width;
    const cellY = y * this.metrics.height;
    const cellWidth = this.metrics.width * cell.width;

    // Skip rendering if invisible
    if (cell.flags & CellFlags.INVISIBLE) {
      return;
    }

    // Most cells on a typical screen are blank. With nothing to draw, skip the font, color and fillText work.
    if (
      (cell.codepoint === 0 || cell.codepoint === 32) &&
      cell.grapheme_len === 0 &&
      cell.hyperlink_id === 0 &&
      !this.hoveredLinkRange &&
      !(cell.flags & (CellFlags.UNDERLINE | CellFlags.STRIKETHROUGH))
    ) {
      return;
    }

    // Check if this cell is selected
    const isSelected = this.isInSelection(x, y);

    // Set text style (only when the style bits change; the string is re-parsed on every assignment)
    const styleBits = cell.flags & (CellFlags.ITALIC | CellFlags.BOLD);
    if (styleBits !== this.fontStyleBits) {
      this.fontStyleBits = styleBits;
      let fontStyle = '';
      if (cell.flags & CellFlags.ITALIC) fontStyle += 'italic ';
      if (cell.flags & CellFlags.BOLD) fontStyle += 'bold ';
      this.ctx.font = `${fontStyle}${this.fontSize}px ${this.fontFamily}`;
    }

    // Set text color - use selection foreground if selected
    if (isSelected) {
      this.ctx.fillStyle = this.theme.selectionForeground;
      this.fillKey = -1;
    } else {
      // Extract colors and handle inverse
      let fg_r = cell.fg_r,
        fg_g = cell.fg_g,
        fg_b = cell.fg_b;

      if (cell.flags & CellFlags.INVERSE) {
        // When inverted, foreground becomes background
        fg_r = cell.bg_r;
        fg_g = cell.bg_g;
        fg_b = cell.bg_b;
      }

      this.setFillRGB(fg_r, fg_g, fg_b);
    }

    // Apply faint effect
    if (cell.flags & CellFlags.FAINT) {
      this.ctx.globalAlpha = 0.5;
    }

    // Draw text
    const textX = cellX;
    const textY = cellY + this.metrics.baseline;

    // Get the character to render - use grapheme lookup for complex scripts
    let char: string;
    if (cell.grapheme_len > 0 && this.currentBuffer?.getGraphemeString) {
      // Cell has additional codepoints - get full grapheme cluster
      char = this.currentBuffer.getGraphemeString(y, x);
    } else {
      // Simple cell - single codepoint
      char = cellChar(cell.codepoint); // Space for an empty or invalid codepoint
    }
    this.ctx.fillText(char, textX, textY);

    // Reset alpha
    if (cell.flags & CellFlags.FAINT) {
      this.ctx.globalAlpha = 1.0;
    }

    // Draw underline
    if (cell.flags & CellFlags.UNDERLINE) {
      const underlineY = cellY + this.metrics.baseline + 2;
      this.ctx.strokeStyle = this.ctx.fillStyle;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(cellX, underlineY);
      this.ctx.lineTo(cellX + cellWidth, underlineY);
      this.ctx.stroke();
    }

    // Draw strikethrough
    if (cell.flags & CellFlags.STRIKETHROUGH) {
      const strikeY = cellY + this.metrics.height / 2;
      this.ctx.strokeStyle = this.ctx.fillStyle;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(cellX, strikeY);
      this.ctx.lineTo(cellX + cellWidth, strikeY);
      this.ctx.stroke();
    }

    // Draw hyperlink underline (for OSC8 hyperlinks)
    if (cell.hyperlink_id > 0) {
      const isHovered = cell.hyperlink_id === this.hoveredHyperlinkId;

      // Only show underline when hovered (cleaner look)
      if (isHovered) {
        const underlineY = cellY + this.metrics.baseline + 2;
        this.ctx.strokeStyle = '#4A90E2'; // Blue underline on hover
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(cellX, underlineY);
        this.ctx.lineTo(cellX + cellWidth, underlineY);
        this.ctx.stroke();
      }
    }

    // Draw regex link underline (for plain text URLs)
    if (this.hoveredLinkRange) {
      const range = this.hoveredLinkRange;
      // Check if this cell is within the hovered link range
      const isInRange =
        (y === range.startY && x >= range.startX && (y < range.endY || x <= range.endX)) ||
        (y > range.startY && y < range.endY) ||
        (y === range.endY && x <= range.endX && (y > range.startY || x >= range.startX));

      if (isInRange) {
        const underlineY = cellY + this.metrics.baseline + 2;
        this.ctx.strokeStyle = '#4A90E2'; // Blue underline on hover
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(cellX, underlineY);
        this.ctx.lineTo(cellX + cellWidth, underlineY);
        this.ctx.stroke();
      }
    }
  }

  /**
   * Render cursor
   */
  private renderCursor(x: number, y: number): void {
    const cursorX = x * this.metrics.width;
    const cursorY = y * this.metrics.height;

    this.ctx.fillStyle = this.theme.cursor;

    switch (this.cursorStyle) {
      case 'block':
        // Full cell block
        this.ctx.fillRect(cursorX, cursorY, this.metrics.width, this.metrics.height);
        break;

      case 'underline':
        // Underline at bottom of cell
        const underlineHeight = Math.max(2, Math.floor(this.metrics.height * 0.15));
        this.ctx.fillRect(
          cursorX,
          cursorY + this.metrics.height - underlineHeight,
          this.metrics.width,
          underlineHeight
        );
        break;

      case 'bar':
        // Vertical bar at left of cell
        const barWidth = Math.max(2, Math.floor(this.metrics.width * 0.15));
        this.ctx.fillRect(cursorX, cursorY, barWidth, this.metrics.height);
        break;
    }
  }

  // ==========================================================================
  // Cursor Blinking
  // ==========================================================================

  private startCursorBlink(): void {
    // xterm.js uses ~530ms blink interval
    this.cursorBlinkInterval = window.setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
      // Note: Render loop should redraw cursor line automatically
    }, 530);
  }

  private stopCursorBlink(): void {
    if (this.cursorBlinkInterval !== undefined) {
      clearInterval(this.cursorBlinkInterval);
      this.cursorBlinkInterval = undefined;
    }
    this.cursorVisible = true;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Update theme colors
   */
  public setTheme(theme: ITheme): void {
    this.theme = { ...DEFAULT_THEME, ...theme };
    this.drawnRows = [];

    // Rebuild palette
    this.palette = [
      this.theme.black,
      this.theme.red,
      this.theme.green,
      this.theme.yellow,
      this.theme.blue,
      this.theme.magenta,
      this.theme.cyan,
      this.theme.white,
      this.theme.brightBlack,
      this.theme.brightRed,
      this.theme.brightGreen,
      this.theme.brightYellow,
      this.theme.brightBlue,
      this.theme.brightMagenta,
      this.theme.brightCyan,
      this.theme.brightWhite,
    ];
  }

  /**
   * Update font size
   */
  public setFontSize(size: number): void {
    this.fontSize = size;
    this.drawnRows = [];
    this.metrics = this.measureFont();
  }

  /**
   * Update font family
   */
  public setFontFamily(family: string): void {
    this.fontFamily = family;
    this.drawnRows = [];
    this.metrics = this.measureFont();
  }

  /**
   * Update line height
   */
  public setLineHeight(lineHeight: number): void {
    this.lineHeight = lineHeight;
    this.drawnRows = [];
    this.metrics = this.measureFont();
  }

  /**
   * Update cursor style
   */
  public setCursorStyle(style: 'block' | 'underline' | 'bar'): void {
    this.cursorStyle = style;
  }

  /**
   * Enable/disable cursor blinking
   */
  public setCursorBlink(enabled: boolean): void {
    if (enabled && !this.cursorBlink) {
      this.cursorBlink = true;
      this.startCursorBlink();
    } else if (!enabled && this.cursorBlink) {
      this.cursorBlink = false;
      this.stopCursorBlink();
    }
  }

  /**
   * Get current font metrics
   */

  /**
   * Render scrollbar (Phase 2)
   * Shows scroll position and allows click/drag interaction
   * @param opacity Opacity level (0-1) for fade in/out effect
   */
  private renderScrollbar(
    viewportY: number,
    scrollbackLength: number,
    visibleRows: number,
    opacity: number = 1
  ): void {
    const ctx = this.ctx;
    const canvasHeight = this.canvas.height / this.devicePixelRatio;
    const canvasWidth = this.canvas.width / this.devicePixelRatio;

    // Scrollbar dimensions
    const scrollbarWidth = 8;
    const scrollbarX = canvasWidth - scrollbarWidth - 4;
    const scrollbarPadding = 4;
    const scrollbarTrackHeight = canvasHeight - scrollbarPadding * 2;

    // Always clear the scrollbar area first (fixes ghosting when fading out)
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(scrollbarX - 2, 0, scrollbarWidth + 6, canvasHeight);

    // Don't draw scrollbar if fully transparent or no scrollback
    if (opacity <= 0 || scrollbackLength === 0) return;

    // Calculate scrollbar thumb size and position
    const totalLines = scrollbackLength + visibleRows;
    const thumbHeight = Math.max(20, (visibleRows / totalLines) * scrollbarTrackHeight);

    // Position: 0 = at bottom, scrollbackLength = at top
    const scrollPosition = viewportY / scrollbackLength; // 0 to 1
    const thumbY = scrollbarPadding + (scrollbarTrackHeight - thumbHeight) * (1 - scrollPosition);

    // Draw scrollbar track (subtle background) with opacity
    ctx.fillStyle = `rgba(128, 128, 128, ${0.1 * opacity})`;
    ctx.fillRect(scrollbarX, scrollbarPadding, scrollbarWidth, scrollbarTrackHeight);

    // Draw scrollbar thumb with opacity
    const isScrolled = viewportY > 0;
    const baseOpacity = isScrolled ? 0.5 : 0.3;
    ctx.fillStyle = `rgba(128, 128, 128, ${baseOpacity * opacity})`;
    ctx.fillRect(scrollbarX, thumbY, scrollbarWidth, thumbHeight);
  }
  public getMetrics(): FontMetrics {
    return { ...this.metrics };
  }

  /**
   * Get canvas element (needed by SelectionManager)
   */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Set selection manager (for rendering selection)
   */
  public setSelectionManager(manager: SelectionManager): void {
    this.selectionManager = manager;
  }

  /**
   * Check if a cell at (x, y) is within the current selection.
   * Uses cached selection coordinates for performance.
   */
  private isInSelection(x: number, y: number): boolean {
    const sel = this.currentSelectionCoords;
    if (!sel) return false;

    const { startCol, startRow, endCol, endRow } = sel;

    // Single line selection
    if (startRow === endRow) {
      return y === startRow && x >= startCol && x <= endCol;
    }

    // Multi-line selection
    if (y === startRow) {
      // First line: from startCol to end of line
      return x >= startCol;
    } else if (y === endRow) {
      // Last line: from start of line to endCol
      return x <= endCol;
    } else if (y > startRow && y < endRow) {
      // Middle lines: entire line is selected
      return true;
    }

    return false;
  }

  /**
   * Set the currently hovered hyperlink ID for rendering underlines
   */
  public setHoveredHyperlinkId(hyperlinkId: number): void {
    this.hoveredHyperlinkId = hyperlinkId;
  }

  /**
   * Set the currently hovered link range for rendering underlines (for regex-detected URLs)
   * Pass null to clear the hover state
   */
  public setHoveredLinkRange(
    range: {
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    } | null
  ): void {
    this.hoveredLinkRange = range;
  }

  /**
   * Get character cell width (for coordinate conversion)
   */
  public get charWidth(): number {
    return this.metrics.width;
  }

  /**
   * Get character cell height (for coordinate conversion)
   */
  public get charHeight(): number {
    return this.metrics.height;
  }

  /**
   * Clear entire canvas
   */
  public clear(): void {
    this.drawnRows = [];
    this.ctx.fillStyle = this.theme.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.stopCursorBlink();
  }
}

/** True for colours a canvas copy can overwrite without blending: hex without alpha, or rgb(). */
function isOpaqueColor(color: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim()) || /^rgb\(/i.test(color.trim());
}

function sameLinkRange(
  a: { startX: number; startY: number; endX: number; endY: number } | null | undefined,
  b: { startX: number; startY: number; endX: number; endY: number } | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.startX === b.startX && a.startY === b.startY && a.endX === b.endX && a.endY === b.endY;
}
