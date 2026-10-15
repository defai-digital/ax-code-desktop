export interface Camera {
  x: number
  y: number
  scale: number
}

export const MIN_GRAPH_SCALE = 0.05
export const MAX_GRAPH_SCALE = 3

export function clampGraphScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(MAX_GRAPH_SCALE, Math.max(MIN_GRAPH_SCALE, scale))
}

/** Screen point = world * scale + camera offset. The world point under the anchor stays put. */
export function zoomAt(camera: Camera, anchorX: number, anchorY: number, nextScale: number): Camera {
  const scale = clampGraphScale(nextScale)
  const current = camera.scale || 1
  const worldX = (anchorX - camera.x) / current
  const worldY = (anchorY - camera.y) / current
  return {
    x: anchorX - worldX * scale,
    y: anchorY - worldY * scale,
    scale,
  }
}

export function panCamera(camera: Camera, dx: number, dy: number): Camera {
  return { x: camera.x + dx, y: camera.y + dy, scale: camera.scale }
}

export function fitCamera(
  points: readonly { x: number; y: number }[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 36,
): Camera {
  const width = Math.max(viewportWidth, 1)
  const height = Math.max(viewportHeight, 1)
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (finite.length === 0) return { x: width / 2, y: height / 2, scale: 1 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of finite) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  const contentWidth = Math.max(maxX - minX, 1)
  const contentHeight = Math.max(maxY - minY, 1)
  const pad = Math.max(0, padding)
  const availWidth = Math.max(width - pad * 2, 1)
  const availHeight = Math.max(height - pad * 2, 1)
  const scale = clampGraphScale(Math.min(availWidth / contentWidth, availHeight / contentHeight))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return {
    x: width / 2 - centerX * scale,
    y: height / 2 - centerY * scale,
    scale,
  }
}
