import type { IDisposable, IEvent } from './interfaces';

export class EventEmitter<T> {
  private listeners: Array<(arg: T) => void> = [];

  fire(arg: T): void {
    // Snapshot so a listener removing itself cannot shift iteration past its
    // successor, and listeners added during dispatch never see the current event.
    const listeners = this.listeners.slice();
    for (const listener of listeners) {
      listener(arg);
    }
  }

  event: IEvent<T> = (listener) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
          this.listeners.splice(index, 1);
        }
      },
    };
  };

  dispose(): void {
    this.listeners = [];
  }
}
