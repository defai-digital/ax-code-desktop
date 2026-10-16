export type ImageNaturalSize = {
  url: string
  width: number
  height: number
}

/**
 * The measurement to lay this image out with, or null when it belongs to another one.
 *
 * The size is read from the `<img>`'s load event and kept with the URL it was read from, because
 * an image the browser already has cached fires `load` before React commits an effect that would
 * clear it: clearing on a URL change (or keeping a size without its URL) left the frame at the
 * whole viewport, with margins around the picture that swallowed the click that closes it.
 */
export const naturalSizeForUrl = (
  size: ImageNaturalSize | null,
  url: string | null | undefined,
): ImageNaturalSize | null => (size && url && size.url === url ? size : null)

/** Fit a measured image inside the frame, or fill the frame when it has not been measured yet. */
export const fitImageToFrame = (
  size: ImageNaturalSize | null,
  frame: { maxWidth: number; maxHeight: number },
): { width: number; height: number } => {
  const maxWidth = Math.max(1, frame.maxWidth)
  const maxHeight = Math.max(1, frame.maxHeight)
  if (!size || size.width <= 0 || size.height <= 0) {
    return { width: Math.round(maxWidth), height: Math.round(maxHeight) }
  }

  const scale = Math.min(maxWidth / size.width, maxHeight / size.height)
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}
