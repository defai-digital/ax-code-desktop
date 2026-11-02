// The AX Code runtime contract for the directory header. fetch()/Headers only
// accept ByteString values, so a path with characters above U+00FF would throw
// before the request is sent, and Latin-1-only characters would arrive as
// mojibake. `%` is encoded too, because the receiving side decodes this header
// with decodeURIComponent and a literal `%` would otherwise corrupt the path.
export function encodeDirectoryHeader(directory: string): string {
  return /[^\x00-\x7F]|%/.test(directory) ? encodeURIComponent(directory) : directory
}
