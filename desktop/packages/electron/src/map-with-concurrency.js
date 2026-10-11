"use strict"

// Maps `items` through async `fn` with at most `limit` calls in flight and
// returns results in input order. Rejects with the first error, like Promise.all.
const mapWithConcurrency = async (items, limit, fn) => {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  }
  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}

module.exports = { mapWithConcurrency }
