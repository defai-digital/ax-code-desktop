/** Selection state in retained-buffer coordinates; viewport coordinates are derived. */
import { cellChar } from './codepoint';
import { EventEmitter } from './event-emitter';
import type { AkittyTerminal } from './engine';
import type { CanvasRenderer } from './renderer';
import type { Terminal } from './terminal';
interface Point { col: number; absoluteRow: number; rowId?: bigint; revision?: number }
export interface SelectionCoordinates { startCol: number; startRow: number; endCol: number; endRow: number }
const compare = (a: Point, b: Point): number => a.absoluteRow - b.absoluteRow || a.col - b.col;

export class SelectionManager {
  private selectionStart: Point | null = null;
  private selectionEnd: Point | null = null;
  private isSelecting = false;
  // API and word selections may span one cell; a mouse-down anchor alone is empty.
  private explicitSelection = false;
  private mouseDownTarget: EventTarget | null = null;
  private readonly dirtySelectionRows = new Set<number>();
  private readonly changes = new EventEmitter<void>();
  readonly onSelectionChange = this.changes.event;
  private readonly listeners: Array<[EventTarget, string, EventListener]> = [];
  private scrolling?: ReturnType<typeof setInterval>;
  private scrollDirection = 0;
  private menuTimer?: ReturnType<typeof setTimeout>;
  private closeMenu?: () => void;
  private closed = false;

  constructor(private readonly terminal: Terminal, private readonly renderer: CanvasRenderer,
    private wasmTerm: AkittyTerminal, private readonly textarea: HTMLTextAreaElement)
  {
    const canvas = renderer.getCanvas();
    this.listen(canvas, 'mousedown', event => {
      const mouse = event as MouseEvent;
      if (mouse.button !== 0) return;
      this.focus(); this.clearSelection();
      const point = this.point(mouse.offsetX, mouse.offsetY);
      this.selectionStart = point; this.selectionEnd = point; this.isSelecting = true;
    });
    this.listen(canvas, 'mousemove', event => {
      if (!this.isSelecting) return;
      const mouse = event as MouseEvent;
      this.move(this.point(mouse.offsetX, mouse.offsetY));
      this.autoScroll(mouse.offsetY < 30 ? -1 : mouse.offsetY > canvas.clientHeight - 30 ? 1 : 0);
    });
    this.listen(canvas, 'mouseleave', event => {
      if (!this.isSelecting) return;
      const mouse = event as MouseEvent, bounds = canvas.getBoundingClientRect();
      this.autoScroll(mouse.clientY < bounds.top ? -1 : mouse.clientY > bounds.bottom ? 1 : 0);
    });
    this.listen(canvas, 'mouseenter', () => this.autoScroll(0));
    this.listen(canvas, 'dblclick', event => this.word(event as MouseEvent));
    this.listen(canvas, 'contextmenu', event => this.contextMenu(event as MouseEvent));
    this.listen(document, 'mousedown', event => { this.mouseDownTarget = event.target; });
    this.listen(document, 'mousemove', event => {
      if (!this.isSelecting) return;
      const mouse = event as MouseEvent, bounds = canvas.getBoundingClientRect();
      if (mouse.clientX >= bounds.left && mouse.clientX <= bounds.right && mouse.clientY >= bounds.top && mouse.clientY <= bounds.bottom) return;
      const direction = mouse.clientY < bounds.top ? -1 : mouse.clientY > bounds.bottom ? 1 : 0;
      this.autoScroll(direction);
      if (!direction) this.move(this.point(mouse.clientX - bounds.left, mouse.clientY - bounds.top));
    });
    this.listen(document, 'mouseup', () => {
      if (!this.isSelecting) return;
      this.isSelecting = false; this.autoScroll(0);
      const selection = this.getSelection();
      if (selection) { void this.copy(selection); this.changes.fire(); }
    });
    this.listen(document, 'click', event => {
      if (!this.isSelecting && !canvas.contains(this.mouseDownTarget as Node | null) && !canvas.contains(event.target as Node | null)) this.clearSelection();
    });
  }
  private listen(target: EventTarget, type: string, callback: EventListener): void {
    const listener: EventListener = event => { if (!this.closed) callback(event); };
    target.addEventListener(type, listener); this.listeners.push([target, type, listener]);
  }
  private viewport(): number {
    return Math.max(0, Math.floor(typeof this.terminal.getViewportY === 'function' ? this.terminal.getViewportY() : this.terminal.viewportY || 0));
  }
  private absolute(row: number): number { return this.wasmTerm.getScrollbackLength() + row - this.viewport(); }
  private point(x: number, y: number): Point {
    const size = this.wasmTerm.getDimensions(), metrics = this.renderer.getMetrics();
    return this.anchor({ col: Math.max(0, Math.min(size.cols - 1, Math.floor(x / metrics.width))),
      absoluteRow: this.absolute(Math.max(0, Math.min(size.rows - 1, Math.floor(y / metrics.height)))) });
  }
  private anchor(point: Point): Point {
    return { ...point, rowId: this.wasmTerm.getRowId(point.absoluteRow - this.wasmTerm.getScrollbackLength()),
      revision: this.wasmTerm.getRevision() };
  }
  private resolve(point: Point): boolean {
    if (point.rowId === undefined) return true;
    const revision = this.wasmTerm.getRevision();
    if (point.revision === revision) return true;
    const row = this.wasmTerm.findRow(point.rowId);
    if (row === undefined) return false;
    point.absoluteRow = row; point.revision = revision;
    return true;
  }
  private range(): [Point, Point] | null {
    if (!this.selectionStart || !this.selectionEnd) return null;
    if (!this.resolve(this.selectionStart) || !this.resolve(this.selectionEnd)) return null;
    if (!this.explicitSelection && compare(this.selectionStart, this.selectionEnd) === 0) return null;
    return compare(this.selectionStart, this.selectionEnd) <= 0 ? [this.selectionStart, this.selectionEnd] : [this.selectionEnd, this.selectionStart];
  }
  getSelectionCoords(): SelectionCoordinates | null {
    const range = this.range(); if (!range) return null;
    const [first, last] = range, size = this.wasmTerm.getDimensions(), base = this.absolute(0);
    if (last.absoluteRow < base || first.absoluteRow >= base + size.rows) return null;
    const history = this.wasmTerm.getScrollbackLength();
    const cells = (row: number) => row < history ? this.wasmTerm.getScrollbackLine(row) : this.wasmTerm.getLineView(row - history);
    const startCol = Math.max(0, first.col - Number(cells(first.absoluteRow)?.[first.col]?.width === 0));
    const endCol = Math.min(size.cols - 1, last.col + Number(cells(last.absoluteRow)?.[last.col]?.width === 2));
    return { startCol: first.absoluteRow < base ? 0 : startCol, startRow: Math.max(0, first.absoluteRow - base),
      endCol: last.absoluteRow >= base + size.rows ? size.cols - 1 : endCol, endRow: Math.min(size.rows - 1, last.absoluteRow - base) };
  }
  getSelectionPosition(): { start: { x: number; y: number }; end: { x: number; y: number } } | undefined {
    const coords = this.getSelectionCoords();
    return coords ? { start: { x: coords.startCol, y: coords.startRow }, end: { x: coords.endCol, y: coords.endRow } } : undefined;
  }
  getSelection(): string {
    const range = this.range(); if (!range) return '';
    const [start, end] = range, history = this.wasmTerm.getScrollbackLength();
    let text = '';
    for (let row = Math.max(0, start.absoluteRow); row <= Math.min(end.absoluteRow, history + this.wasmTerm.rows - 1); row++) {
      const cells = row < history ? this.wasmTerm.getScrollbackLine(row) : this.wasmTerm.getLine(row - history);
      if (!cells) continue;
      const first = row === start.absoluteRow ? start.col : 0, last = row === end.absoluteRow ? end.col : cells.length - 1;
      const wrapped = row + 1 < history ? this.wasmTerm.isScrollbackRowWrapped(row + 1) : this.wasmTerm.isRowWrapped(row + 1 - history);
      let contentEnd = Math.min(last + 1, cells.length - Number(this.wasmTerm.hasWrapPadding(row - history)));
      if (!wrapped && row === end.absoluteRow && last < cells.length - 1) {
        while (contentEnd > first && cells[contentEnd - 1]?.codepoint === 0 && cells[contentEnd - 1]?.width !== 0) contentEnd--;
      }
      let value = '';
      for (let column = Math.max(0, first - Number(cells[first]?.width === 0)); column <= last && column < contentEnd; column++) {
        const cell = cells[column];
        if (cell?.width === 0) continue;
        if (cell?.grapheme_len) value += row < history ? this.wasmTerm.getScrollbackGraphemeString(row, column) : this.wasmTerm.getGraphemeString(row - history, column);
        else value += cellChar(cell?.codepoint);
      }
      if (!wrapped && (last === cells.length - 1 || row !== end.absoluteRow)) value = value.replace(/ +$/, '');
      text += value;
      if (row !== end.absoluteRow && !wrapped) text += '\n';
    }
    return text;
  }
  hasSelection(): boolean { return this.range() !== null; }
  private damage(): void {
    const coords = this.getSelectionCoords();
    if (coords) for (let row = coords.startRow; row <= coords.endRow; row++) this.dirtySelectionRows.add(row);
  }
  private move(end: Point): void { this.damage(); this.selectionEnd = end; this.damage(); }
  private selectRange(start: Point, end: Point): void {
    this.damage(); this.selectionStart = this.anchor(start); this.selectionEnd = this.anchor(end); this.explicitSelection = true; this.damage(); this.changes.fire();
  }
  clearSelection(): void {
    const had = this.range() !== null;
    this.damage(); this.selectionStart = null; this.selectionEnd = null; this.explicitSelection = false; this.isSelecting = false; this.autoScroll(0);
    // Every path that removes a visible selection (API, typing, resize, reset) reports it.
    if (had && !this.closed) this.changes.fire();
  }
  deselect(): void { this.clearSelection(); }
  selectAll(): void { this.selectLines(0, this.wasmTerm.rows - 1); }
  select(column: number, row: number, length: number): void {
    if (![column, row, length].every(Number.isFinite)) throw new RangeError('Selection coordinates and length must be finite');
    if (Math.floor(length) <= 0) { this.clearSelection(); return; }
    const { cols, rows } = this.wasmTerm.getDimensions();
    row = Math.max(0, Math.min(rows - 1, Math.floor(row))); column = Math.max(0, Math.min(cols - 1, Math.floor(column)));
    const extent = Math.min(row * cols + column + Math.max(1, Math.floor(length)) - 1, rows * cols - 1);
    this.selectRange({ col: column, absoluteRow: this.absolute(row) },
      { col: extent % cols, absoluteRow: this.absolute(Math.floor(extent / cols)) });
  }
  selectLines(first: number, last: number): void {
    if (![first, last].every(Number.isFinite)) throw new RangeError('Selection rows must be finite');
    const { cols, rows } = this.wasmTerm.getDimensions();
    const start = Math.max(0, Math.min(rows - 1, Math.floor(Math.min(first, last))));
    const end = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(first, last))));
    this.selectRange({ col: 0, absoluteRow: this.absolute(start) }, { col: cols - 1, absoluteRow: this.absolute(end) });
  }
  setTerminal(engine: AkittyTerminal): void { this.wasmTerm = engine; this.mouseDownTarget = null; this.clearSelection(); }
  focus(): void { this.renderer.getCanvas().parentElement?.focus(); }
  getDirtySelectionRows(): Set<number> { return this.dirtySelectionRows; }
  clearDirtySelectionRows(): void { this.dirtySelectionRows.clear(); }
  private autoScroll(direction: number): void {
    if (direction === this.scrollDirection && this.scrolling !== undefined) return;
    clearInterval(this.scrolling); this.scrolling = undefined; this.scrollDirection = direction;
    if (!direction || !this.isSelecting || this.closed) return;
    this.scrolling = setInterval(() => {
      if (!this.isSelecting || this.closed) { this.autoScroll(0); return; }
      const viewport = this.viewport();
      // A clamped scroll must not replace the user's drag endpoint.
      this.damage(); this.terminal.scrollLines(direction * 2);
      if (this.viewport() === viewport) return;
      const row = direction < 0 ? 0 : this.wasmTerm.rows - 1;
      this.selectionEnd = this.anchor({ col: direction < 0 ? 0 : this.wasmTerm.cols - 1, absoluteRow: this.absolute(row) }); this.damage();
    }, 50);
  }
  private word(event: MouseEvent): void {
    const at = this.point(event.offsetX, event.offsetY), history = this.wasmTerm.getScrollbackLength();
    const line = at.absoluteRow < history ? this.wasmTerm.getScrollbackLine(at.absoluteRow) : this.wasmTerm.getLine(at.absoluteRow - history);
    if (!line) return;
    const word = (column: number): boolean => {
      if (line[column]?.width === 0) column--;
      return /[\p{L}\p{N}_-]/u.test(cellChar(line[column]?.codepoint));
    };
    if (!word(at.col)) return;
    let first = at.col, last = at.col;
    while (first > 0 && word(first - 1)) first--;
    while (last + 1 < line.length && word(last + 1)) last++;
    this.selectRange({ col: first, absoluteRow: at.absoluteRow }, { col: last, absoluteRow: at.absoluteRow });
    void this.copy(this.getSelection());
  }
  private async copy(value: string): Promise<void> {
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; } } catch { /* Use the local selection fallback. */ }
    if (this.closed) return;
    const focus = document.activeElement as HTMLElement | null, styles = this.textarea.style.cssText;
    try {
      this.textarea.value = value; this.textarea.style.cssText += ';position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
      this.textarea.focus(); this.textarea.select(); document.execCommand('copy');
    } catch { /* Clipboard access can be unavailable in an embedding host. */ }
    finally { this.textarea.style.cssText = styles; this.textarea.value = ''; focus?.focus(); }
  }
  private contextMenu(event: MouseEvent): void {
    clearTimeout(this.menuTimer); this.closeMenu?.();
    const styles = this.textarea.style.cssText;
    this.textarea.style.cssText += `;position:fixed;left:${event.clientX}px;top:${event.clientY}px;width:1px;height:1px;z-index:1000;opacity:0;pointer-events:auto`;
    this.textarea.value = this.hasSelection() ? this.getSelection() : '';
    this.textarea.focus(); this.textarea.select();
    const reset = (): void => {
      this.textarea.style.cssText = styles; this.textarea.value = '';
      document.removeEventListener('click', reset); document.removeEventListener('contextmenu', reset); this.textarea.removeEventListener('blur', reset);
      if (this.closeMenu === reset) this.closeMenu = undefined;
    };
    this.closeMenu = reset;
    this.menuTimer = setTimeout(() => {
      this.menuTimer = undefined;
      if (this.closed) return;
      document.addEventListener('click', reset, { once: true }); document.addEventListener('contextmenu', reset, { once: true }); this.textarea.addEventListener('blur', reset, { once: true });
    }, 10);
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.clearSelection(); this.mouseDownTarget = null;
    clearTimeout(this.menuTimer); this.menuTimer = undefined; this.closeMenu?.();
    for (const [target, type, callback] of this.listeners) target.removeEventListener(type, callback);
    this.listeners.length = 0; this.changes.dispose();
  }
}
