/** Approximate retained JSON-like payload bytes without allocating a serialized copy. Not process RSS. */
export function retainedPayloadSize(value: unknown): number {
  const pending: unknown[] = [value]
  const seen = new WeakSet<object>()
  let bytes = 0
  while (pending.length > 0) {
    const item = pending.pop()
    if (typeof item === "string") bytes += item.length * 2
    else if (typeof item === "number") bytes += 8
    else if (typeof item === "boolean") bytes += 4
    else if (item && typeof item === "object" && !seen.has(item)) {
      seen.add(item)
      for (const [key, child] of Object.entries(item)) {
        bytes += key.length * 2
        pending.push(child)
      }
    }
  }
  return bytes
}
