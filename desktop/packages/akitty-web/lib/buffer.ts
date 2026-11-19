/** Read-only terminal buffers, expressed in absolute retained-row coordinates. */
import { EventEmitter } from './event-emitter';
import { isRenderableCodepoint } from './codepoint';
import { CellFlags } from './types';
import type { TerminalCell } from './types';
import type { IBuffer, IBufferCell, IBufferLine, IBufferNamespace } from './interfaces';
import type { Terminal } from './terminal';

type Graphemes = (column: number) => number[] | null;
const vacant = (): TerminalCell => ({ codepoint: 0, width: 1, flags: 0, fg_r: 204, fg_g: 204, fg_b: 204,
  bg_r: 0, bg_g: 0, bg_b: 0, hyperlink_id: 0, grapheme_len: 0 });
const scalar = (value: number): string => isRenderableCodepoint(value) ? String.fromCodePoint(value) : '\ufffd';
function characters(cell: TerminalCell, column: number, lookup?: Graphemes): string {
  if (!cell.codepoint || !cell.width) return '';
  const cluster = cell.grapheme_len ? lookup?.(column) : undefined;
  return cluster && cluster.length > 1 ? cluster.map(scalar).join('') : scalar(cell.codepoint);
}

export class BufferNamespace implements IBufferNamespace {
  readonly normal: Buffer;
  readonly alternate: Buffer;
  private readonly changes = new EventEmitter<IBuffer>();
  readonly onBufferChange = this.changes.event;
  constructor(private readonly terminal: Terminal) {
    this.normal = new Buffer(terminal, 'normal'); this.alternate = new Buffer(terminal, 'alternate');
  }
  get active(): IBuffer { return this.terminal.wasmTerm?.isAlternateScreen() ? this.alternate : this.normal; }
  _fireBufferChange(buffer: IBuffer): void { this.changes.fire(buffer); }
  dispose(): void { this.changes.dispose(); }
}

export class Buffer implements IBuffer {
  private readonly nullCell = new BufferCell(vacant(), 0);
  constructor(private readonly terminal: Terminal, readonly type: 'normal' | 'alternate') {}
  private get alternate(): boolean { return this.type === 'alternate'; }
  get cursorX(): number { return this.terminal.wasmTerm?.getBufferField(this.alternate, 2) ?? 0; }
  get cursorY(): number { return this.terminal.wasmTerm?.getBufferField(this.alternate, 3) ?? 0; }
  get viewportY(): number { return this.terminal.buffer.active === this ? Math.max(0, Math.floor(this.terminal.getViewportY())) : 0; }
  get baseY(): number { return this.terminal.wasmTerm?.getBufferField(this.alternate, 6) ?? 0; }
  get length(): number { return this.terminal.wasmTerm ? this.baseY + this.terminal.wasmTerm.rows : 0; }
  getNullCell(): IBufferCell { return this.nullCell; }
  getLine(row: number): IBufferLine | undefined {
    const engine = this.terminal.wasmTerm;
    if (!engine || !Number.isInteger(row) || row < 0) return undefined;
    const history = engine.getBufferField(this.alternate, 6);
    if (row >= history + engine.rows) return undefined;
    const relativeRow = row - history;
    const cells = engine.getBufferLine(this.alternate, relativeRow);
    if (!cells) return undefined;
    const wrapped = engine.isBufferRowWrapped(this.alternate, relativeRow);
    const lookup: Graphemes = column => engine.getBufferGrapheme(this.alternate, relativeRow, column);
    return new BufferLine(cells, wrapped, engine.cols, lookup);
  }
}

export class BufferLine implements IBufferLine {
  private readonly clusters = new Map<number, number[]>();
  constructor(private readonly cells: TerminalCell[], readonly isWrapped: boolean, readonly length: number, lookup?: Graphemes) {
    // The row and its graphemes form one read result, even after subsequent output.
    if (lookup) cells.forEach((cell, column) => {
      if (cell.grapheme_len) { const cluster = lookup(column); if (cluster) this.clusters.set(column, cluster); }
    });
  }
  private readonly lookup: Graphemes = column => this.clusters.get(column) ?? null;
  getCell(column: number): IBufferCell | undefined {
    if (!Number.isInteger(column) || column < 0 || column >= this.length) return undefined;
    return new BufferCell(this.cells[column] ?? vacant(), column, this.lookup);
  }
  translateToString(trimRight = false, startColumn = 0, endColumn = this.length): string {
    const start = Math.max(0, Math.min(this.length, Math.floor(startColumn)));
    const end = Math.max(start, Math.min(this.length, Math.floor(endColumn)));
    let output = '';
    for (let column = start; column < end; column++) {
      const cell = this.cells[column];
      if (cell?.width === 0) continue;
      output += !cell?.codepoint ? ' ' : characters(cell, column, this.lookup);
    }
    return trimRight ? output.trimEnd() : output;
  }
}

export class BufferCell implements IBufferCell {
  constructor(private readonly cell: TerminalCell, private readonly column: number, private readonly lookup?: Graphemes) {}
  getChars(): string { return characters(this.cell, this.column, this.lookup); }
  getCode(): number { return this.cell.codepoint; }
  getCodepoint(): number { return this.getCode(); }
  getWidth(): number { return this.cell.width; }
  getFgColorMode(): number { return -1; }
  getBgColorMode(): number { return -1; }
  getFgColor(): number { return this.cell.fg_r * 65536 + this.cell.fg_g * 256 + this.cell.fg_b; }
  getBgColor(): number { return this.cell.bg_r * 65536 + this.cell.bg_g * 256 + this.cell.bg_b; }
  getHyperlinkId(): number { return this.cell.hyperlink_id; }
  private flag(flag: CellFlags): number { return Number((this.cell.flags & flag) !== 0); }
  isBold(): number { return this.flag(CellFlags.BOLD); }
  isItalic(): number { return this.flag(CellFlags.ITALIC); }
  isUnderline(): number { return this.flag(CellFlags.UNDERLINE); }
  isStrikethrough(): number { return this.flag(CellFlags.STRIKETHROUGH); }
  isBlink(): number { return this.flag(CellFlags.BLINK); }
  isInverse(): number { return this.flag(CellFlags.INVERSE); }
  isInvisible(): number { return this.flag(CellFlags.INVISIBLE); }
  isFaint(): number { return this.flag(CellFlags.FAINT); }
  isDim(): boolean { return !!this.isFaint(); }
}
