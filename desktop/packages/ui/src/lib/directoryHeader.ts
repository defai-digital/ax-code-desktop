// The receiving side decodes directory headers with decodeURIComponent. Encode
// non-ASCII and control characters: valid POSIX names may contain newlines, but
// HTTP headers cannot. Literal `%` must also survive exactly one decode.
export function encodeDirectoryHeader(directory: string): string {
  return /[^\x20-\x7E]|%/.test(directory) ? encodeURIComponent(directory) : directory
}
