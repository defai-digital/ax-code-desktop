import type { Part } from "@defai-digital/ax-code-sdk/v2/client"

// Parts by message id, split into a fixed number of buckets so that publishing a
// streaming delta copies one small bucket instead of every message in the directory.
//
// A flat Record copied on every publication costs O(messages in the directory), which
// profiled at ~0.25 ms per publication for 2,000 messages and ~1.3 ms for 8,000, per
// streaming project. Here a publication copies the 256-entry bucket table plus the
// buckets it touches (tens of entries), independent of history length.
//
// Ownership follows the reducer's existing convention: `fork()` returns a mutable
// draft that shares every bucket with its source, the draft is mutated in place, and it
// is published and then treated as immutable. A draft copies a bucket the first time it
// writes to it, so the source (the previous state) is never touched.

const BUCKET_COUNT = 256

export type PartMapEntry = readonly [messageID: string, parts: Part[]]

// Message ids end in a random base62 suffix (minted client- and server-side), so the
// last characters distribute evenly. Ids without one (fixtures) still work; they only
// share buckets, which costs speed and never correctness.
function bucketOf(messageID: string): number {
  const length = messageID.length
  if (length === 0) return 0
  let hash = messageID.charCodeAt(length - 1)
  if (length > 1) hash = hash * 31 + messageID.charCodeAt(length - 2)
  if (length > 2) hash = hash * 31 + messageID.charCodeAt(length - 3)
  return hash & (BUCKET_COUNT - 1)
}

export class PartMap implements Iterable<PartMapEntry> {
  private buckets: Array<Map<string, Part[]> | undefined>
  // Buckets this instance may mutate; null once published (read-only).
  private owned: Uint8Array | null
  private count: number

  private constructor(buckets: Array<Map<string, Part[]> | undefined>, count: number, draft: boolean) {
    this.buckets = buckets
    this.count = count
    this.owned = draft ? new Uint8Array(BUCKET_COUNT) : null
  }

  /** Shared empty map. Fork it to build one. */
  static readonly EMPTY: PartMap = new PartMap(new Array(BUCKET_COUNT).fill(undefined), 0, false)

  static from(source: Iterable<PartMapEntry> | Record<string, Part[]> | undefined): PartMap {
    if (!source) return PartMap.EMPTY
    const entries = Symbol.iterator in source ? (source as Iterable<PartMapEntry>) : Object.entries(source)
    const draft = PartMap.EMPTY.fork()
    for (const [messageID, parts] of entries) draft.set(messageID, parts)
    return draft.seal()
  }

  get size(): number {
    return this.count
  }

  get(messageID: string): Part[] | undefined {
    return this.buckets[bucketOf(messageID)]?.get(messageID)
  }

  has(messageID: string): boolean {
    return this.buckets[bucketOf(messageID)]?.has(messageID) ?? false
  }

  *keys(): IterableIterator<string> {
    for (const bucket of this.buckets) {
      if (bucket) yield* bucket.keys()
    }
  }

  *entries(): IterableIterator<PartMapEntry> {
    for (const bucket of this.buckets) {
      if (bucket) yield* bucket.entries()
    }
  }

  [Symbol.iterator](): IterableIterator<PartMapEntry> {
    return this.entries()
  }

  /** Plain object copy for debugging, serialization and tests. O(n). */
  toRecord(): Record<string, Part[]> {
    return Object.fromEntries(this.entries())
  }

  /** A mutable draft sharing every bucket with this map. O(buckets). */
  fork(): PartMap {
    return new PartMap(this.buckets.slice(), this.count, true)
  }

  /** Mark a draft as published: any further write throws instead of corrupting readers. */
  seal(): PartMap {
    this.owned = null
    return this
  }

  /** A published copy with these messages set. Returns this map when nothing is given. */
  withEntries(entries: Iterable<PartMapEntry>): PartMap {
    const draft = this.fork()
    let changed = false
    for (const [messageID, parts] of entries) {
      draft.set(messageID, parts)
      changed = true
    }
    return changed ? draft.seal() : this
  }

  /** A published copy without these messages. Returns this map when none are present. */
  without(messageIDs: Iterable<string>): PartMap {
    const draft = this.fork()
    let changed = false
    for (const messageID of messageIDs) {
      if (draft.delete(messageID)) changed = true
    }
    return changed ? draft.seal() : this
  }

  set(messageID: string, parts: Part[]): this {
    const owned = this.requireDraft()
    const index = bucketOf(messageID)
    const bucket = this.writableBucket(index, owned)
    if (!bucket.has(messageID)) this.count += 1
    bucket.set(messageID, parts)
    return this
  }

  delete(messageID: string): boolean {
    const owned = this.requireDraft()
    const index = bucketOf(messageID)
    if (!this.buckets[index]?.has(messageID)) return false
    const bucket = this.writableBucket(index, owned)
    bucket.delete(messageID)
    this.count -= 1
    if (bucket.size === 0) this.buckets[index] = undefined
    return true
  }

  private requireDraft(): Uint8Array {
    if (!this.owned) throw new Error("PartMap is published and read-only; fork() it to change it")
    return this.owned
  }

  private writableBucket(index: number, owned: Uint8Array): Map<string, Part[]> {
    const existing = this.buckets[index]
    if (existing && owned[index]) return existing
    const copy = new Map(existing)
    this.buckets[index] = copy
    owned[index] = 1
    return copy
  }
}
