/** Fit a grid into its host's content box without resize feedback loops. */
import type { ITerminalAddon, ITerminalCore } from '../interfaces';
export interface ITerminalDimensions { cols: number; rows: number }
interface Host extends ITerminalCore {
  renderer?: { getMetrics(): { width: number; height: number } };
  resize?(cols: number, rows: number): void;
}

export class FitAddon implements ITerminalAddon {
  private host?: Host;
  private observer?: ResizeObserver;
  private debounce?: ReturnType<typeof setTimeout>;
  private settle?: ReturnType<typeof setTimeout>;
  private resizing = false;
  private pending = false;
  private epoch = 0;

  activate(terminal: ITerminalCore): void { this.dispose(); this.host = terminal as Host; }
  dispose(): void {
    this.epoch++;
    this.observer?.disconnect(); this.observer = undefined;
    clearTimeout(this.debounce); clearTimeout(this.settle);
    this.debounce = undefined; this.settle = undefined;
    this.resizing = false; this.pending = false; this.host = undefined;
  }
  proposeDimensions(): ITerminalDimensions | undefined {
    const host = this.host, element = host?.element, metrics = host?.renderer?.getMetrics();
    if (!element || !metrics || !Number.isFinite(metrics.width) || !Number.isFinite(metrics.height) || metrics.width <= 0 || metrics.height <= 0
      || !(element.clientWidth > 0) || !(element.clientHeight > 0)) return undefined;
    const style = window.getComputedStyle(element);
    const padding = (side: string): number => Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0;
    const width = element.clientWidth - padding('left') - padding('right') - 15;
    const height = element.clientHeight - padding('top') - padding('bottom');
    const cols = Math.max(2, Math.min(4096, Math.floor(width / metrics.width)));
    const rows = Math.max(1, Math.min(4096, Math.floor(height / metrics.height), Math.floor(1048576 / cols)));
    return { cols, rows };
  }
  fit(): void {
    if (this.resizing) { this.pending = true; return; }
    const size = this.proposeDimensions(), host = this.host;
    if (!host || !size || size.cols === host.cols && size.rows === host.rows) return;
    this.resizing = true;
    const epoch = this.epoch;
    try { host.resize?.(size.cols, size.rows); }
    finally {
      this.settle = setTimeout(() => {
        if (this.epoch !== epoch) return;
        this.settle = undefined; this.resizing = false;
        if (this.pending) { this.pending = false; this.fit(); }
      }, 50);
    }
  }
  observeResize(): void {
    const element = this.host?.element;
    if (!element || this.observer || typeof ResizeObserver === 'undefined') return;
    const epoch = this.epoch;
    this.observer = new ResizeObserver(entries => {
      if (epoch !== this.epoch || !entries.length) return;
      if (this.resizing) { this.pending = true; return; }
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => { if (epoch === this.epoch) this.fit(); }, 100);
    });
    this.observer.observe(element);
  }
}
