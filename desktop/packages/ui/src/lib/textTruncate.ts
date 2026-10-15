/**
 * Truncate to at most `max` UTF-16 code units (never longer than `max` by
 * `String.length`), appending `ellipsis` when anything was cut.
 * `String.prototype.slice` counts code units, so a cut that lands inside a
 * surrogate pair would keep only half of it and leave a lone surrogate: an emoji
 * at the cut renders as "\ud83d", and a title stored from it is corrupted. Move
 * the cut one unit left instead of splitting the pair.
 */
export const truncateToCodeUnits = (value: string, max: number, ellipsis = "…"): string => {
  if (value.length <= max) {
    return value
  }
  let end = Math.max(0, max - ellipsis.length)
  const boundary = value.charCodeAt(end - 1)
  if (boundary >= 0xd800 && boundary <= 0xdbff) {
    end -= 1
  }
  return `${value.slice(0, end)}${ellipsis}`
}
