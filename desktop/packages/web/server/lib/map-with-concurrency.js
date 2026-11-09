// Maps `items` through `fn` with at most `limit` calls in flight, keeping the input order in the result.
export const mapWithConcurrency = async (items, limit, fn) => {
  const list = Array.from(items ?? [])
  const results = new Array(list.length)
  const width = Math.max(1, Math.min(Number.isFinite(limit) ? Math.trunc(limit) : 1, list.length))
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const index = next
      next += 1
      results[index] = await fn(list[index], index)
    }
  }
  await Promise.all(Array.from({ length: list.length === 0 ? 0 : width }, worker))
  return results
}
