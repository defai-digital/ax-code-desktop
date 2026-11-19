/** Ordered subscriptions with independent lifetime and reentrant dispatch. */
import type { IEvent } from './interfaces';

export class EventEmitter<T> {
  private readonly subscriptions = new Map<symbol, (value: T) => void>();
  readonly event: IEvent<T> = listener => {
    const subscription = Symbol();
    this.subscriptions.set(subscription, listener);
    return { dispose: () => { this.subscriptions.delete(subscription); } };
  };
  fire(value: T, shouldContinue?: () => boolean): void {
    for (const listener of Array.from(this.subscriptions.values())) {
      if (shouldContinue && !shouldContinue()) return
      try { listener(value); }
      catch (error) {
        if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
        else queueMicrotask(() => { throw error; });
      }
    }
  }
  dispose(): void { this.subscriptions.clear(); }
}
