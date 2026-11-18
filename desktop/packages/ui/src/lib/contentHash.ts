/** Non-cryptographic 53-bit hash over UTF-16 code units; signatures never retain file text. */
export function contentHash53(input: string): string {
  let first = 0xdeadbeef
  let second = 0x41c6ce57
  for (let index = 0; index < input.length; index += 1) {
    const unit = input.charCodeAt(index)
    first = Math.imul(first ^ unit, 2654435761)
    second = Math.imul(second ^ unit, 1597334677)
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909)
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909)
  return (4294967296 * (second & 0x1fffff) + (first >>> 0)).toString(16)
}
