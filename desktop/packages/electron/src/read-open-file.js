"use strict"

// Reads at most `maxBytes` from an open file handle, stopping early at EOF. Bytes appended after the caller's
// size check are not read, which keeps the allocation within what that check approved.
const readOpenFileUpTo = async (handle, maxBytes) => {
  const buffer = Buffer.alloc(Math.max(0, Math.floor(maxBytes) || 0))
  let total = 0
  while (total < buffer.length) {
    const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total)
    if (!bytesRead) break
    total += bytesRead
  }
  return total === buffer.length ? buffer : buffer.subarray(0, total)
}

module.exports = { readOpenFileUpTo }
