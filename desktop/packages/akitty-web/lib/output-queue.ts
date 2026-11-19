/** Bounded, cooperative output parsing. Completion means parsed, not painted. */
const encoder = new TextEncoder();
const clock = (): number => typeof performance === 'undefined' ? Date.now() : performance.now();
interface PendingWrite {
  bytes: Uint8Array;
  offset: number;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class OutputQueue {
  static readonly MAX_BYTES = 8 * 1024 * 1024;
  static readonly MAX_WRITES = 1024;
  static readonly CHUNK_BYTES = 8192;
  static readonly BUDGET_MS = 4;
  private writes: PendingWrite[] = [];
  private reserved = 0;
  private generation = 0;
  private scheduled = false;
  private running = false;
  private closed = false;
  private channel?: MessageChannel;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly consume: (bytes: Uint8Array) => void) {}
  get pending(): boolean { return this.writes.length !== 0; }

  enqueue(data: string | Uint8Array): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Terminal output queue is closed'));
    const available = OutputQueue.MAX_BYTES - this.reserved;
    if (data.length > available || this.writes.length >= OutputQueue.MAX_WRITES) {
      return Promise.reject(new RangeError('Terminal output queue is full; await earlier writes'));
    }
    // Buffer.slice() and some Uint8Array subclasses return shared views. Take
    // an owned copy so callers can reuse their storage as soon as we accept it.
    const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
    if (bytes.length > available) return Promise.reject(new RangeError('Terminal output queue is full; await earlier writes'));
    const completion = new Promise<void>((resolve, reject) => {
      this.writes.push({ bytes, offset: 0, resolve, reject });
      // Count the entire retained allocation until the write completes. Counting
      // only its unread tail would let new writes exceed the memory bound.
      this.reserved += bytes.length;
    });
    if (!this.running && !this.scheduled) this.schedule();
    return completion;
  }

  cancel(error: unknown): void {
    this.generation++;
    this.scheduled = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const writes = this.writes;
    this.writes = []; this.reserved = 0;
    for (const write of writes) write.reject(error);
  }

  close(): void {
    this.closed = true;
    this.cancel(new Error('Terminal has been disposed'));
    this.channel?.port1.close(); this.channel?.port2.close(); this.channel = undefined;
  }

  private schedule(): void {
    this.scheduled = true;
    const generation = this.generation;
    try {
      // MessageChannel yields a task without the nested-timer clamp. Platforms
      // without it keep the same ordering through a cancellable timer.
      if (typeof MessageChannel !== 'undefined') {
        if (!this.channel) {
          this.channel = new MessageChannel();
          this.channel.port1.onmessage = event => this.drain(event.data as number);
        }
        this.channel.port2.postMessage(generation);
      } else this.timer = setTimeout(() => this.drain(generation), 0);
    } catch (error) { this.cancel(error); }
  }

  private drain(generation: number): void {
    if (generation !== this.generation || this.closed) return;
    this.scheduled = false; this.timer = undefined; this.running = true;
    const deadline = clock() + OutputQueue.BUDGET_MS;
    try {
      while (this.writes.length) {
        const write = this.writes[0];
        const end = Math.min(write.bytes.length, write.offset + OutputQueue.CHUNK_BYTES);
        if (end > write.offset) this.consume(write.bytes.subarray(write.offset, end));
        // A callback can reset or dispose the terminal while consume runs.
        if (generation !== this.generation) return;
        write.offset = end;
        if (end === write.bytes.length) {
          this.writes.shift(); this.reserved -= write.bytes.length;
          write.resolve();
        }
        if (clock() >= deadline) break;
      }
    } catch (error) { this.cancel(error); }
    finally {
      this.running = false;
      if (!this.closed && this.writes.length && !this.scheduled) this.schedule();
    }
  }
}
