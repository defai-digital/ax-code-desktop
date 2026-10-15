/**
 * AX-specific glyphs for the icon sprite.
 *
 * Each glyph is drawn on Phosphor's 256-unit grid with Phosphor bold's stroke
 * width, so it sits next to the Phosphor set without looking pasted in. The
 * sprite must be path-only and filled: button CSS in index.css forces
 * `fill: currentColor` on paths and `fill: none` on rect/circle, so a stroked
 * SVG would render as a solid blob.
 *
 * Glyphs are therefore described as strokes (lines, polylines, rings, arcs)
 * and converted here into filled outlines. Every solid shape is emitted with
 * the same winding direction and every hole with the opposite one, so the
 * default nonzero fill rule unions overlapping strokes correctly.
 */

/** Phosphor bold stroke width on the 256 grid. */
export const STROKE = 24

const ARC_STEPS_PER_TURN = 36

const round = (value) => {
  const rounded = Math.round(value * 10) / 10
  return Object.is(rounded, -0) ? 0 : rounded
}

const signedArea = (points) => {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

/** Solid shapes are positive (clockwise on screen); holes are negative. */
const orient = (points, solid) => {
  const area = signedArea(points)
  return (area > 0) === solid ? points : [...points].reverse()
}

const arcPoints = (cx, cy, r, from, to) => {
  const sweep = to - from
  const steps = Math.max(2, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * ARC_STEPS_PER_TURN))
  const points = []
  for (let i = 0; i <= steps; i++) {
    const angle = from + (sweep * i) / steps
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
  }
  return points
}

const circlePoints = (cx, cy, r) => arcPoints(cx, cy, r, 0, 2 * Math.PI).slice(0, -1)

/** A straight stroke with round caps. */
export const line = (x1, y1, x2, y2, width = STROKE) => {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const r = width / 2
  const points = [
    ...arcPoints(x2, y2, r, angle - Math.PI / 2, angle + Math.PI / 2),
    ...arcPoints(x1, y1, r, angle + Math.PI / 2, angle + (3 * Math.PI) / 2),
  ]
  return [orient(points, true)]
}

/** Connected strokes with round joins. */
export const polyline = (points, width = STROKE) => {
  const shapes = []
  for (let i = 0; i < points.length - 1; i++) {
    shapes.push(...line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], width))
  }
  return shapes
}

/** A filled disc. */
export const dot = (cx, cy, r) => [orient(circlePoints(cx, cy, r), true)]

/** A stroked circle. */
export const ring = (cx, cy, r, width = STROKE) => [
  orient(circlePoints(cx, cy, r + width / 2), true),
  orient(circlePoints(cx, cy, r - width / 2), false),
]

/** A stroked circular arc with round caps; angles in degrees, 0 = east, 90 = south. */
export const arc = (cx, cy, r, fromDeg, toDeg, width = STROKE) => {
  const from = (fromDeg * Math.PI) / 180
  const to = (toDeg * Math.PI) / 180
  const half = width / 2
  const dir = Math.sign(to - from) || 1
  const outer = arcPoints(cx, cy, r + half, from, to)
  const inner = arcPoints(cx, cy, r - half, to, from)
  const endX = cx + r * Math.cos(to)
  const endY = cy + r * Math.sin(to)
  const startX = cx + r * Math.cos(from)
  const startY = cy + r * Math.sin(from)
  const endCap = arcPoints(endX, endY, half, to, to + dir * Math.PI)
  const startCap = arcPoints(startX, startY, half, from + dir * Math.PI, from + dir * 2 * Math.PI)
  return [orient([...outer, ...endCap, ...inner, ...startCap], true)]
}

/** A stroked rounded rectangle (x, y, w, h describe the stroke's centre line). */
export const roundedRect = (x, y, w, h, radius, width = STROKE) => {
  const outline = (inset, solid) => {
    const r = Math.max(0, radius - inset)
    const left = x + inset
    const top = y + inset
    const right = x + w - inset
    const bottom = y + h - inset
    const points = [
      ...arcPoints(right - r, top + r, r, -Math.PI / 2, 0),
      ...arcPoints(right - r, bottom - r, r, 0, Math.PI / 2),
      ...arcPoints(left + r, bottom - r, r, Math.PI / 2, Math.PI),
      ...arcPoints(left + r, top + r, r, Math.PI, (3 * Math.PI) / 2),
    ]
    return orient(points, solid)
  }
  return [outline(-width / 2, true), outline(width / 2, false)]
}

/** A filled polygon. */
export const polygon = (points) => [orient(points, true)]

const toPathData = (shapes) =>
  shapes
    .map((points) => {
      const [first, ...rest] = points
      return `M${round(first[0])},${round(first[1])}` + rest.map(([x, y]) => `L${round(x)},${round(y)}`).join("") + "Z"
    })
    .join("")

/** A shape is a list of [x, y] points; parts may nest lists of shapes at any depth. */
const isShape = (value) => Array.isArray(value) && Array.isArray(value[0]) && typeof value[0][0] === "number"
const collectShapes = (parts) => parts.flatMap((part) => (isShape(part) ? [part] : collectShapes(part)))

const glyph = (...parts) => toPathData(collectShapes(parts))

/** A filled diamond: the "agent" motif shared by the AX glyphs. */
const diamond = (cx, cy, half) =>
  polygon([
    [cx, cy - half],
    [cx + half, cy],
    [cx, cy + half],
    [cx - half, cy],
  ])

/** A chevron arrowhead whose tip is at (x, y), pointing along `angleDeg`. */
const arrowHead = (x, y, angleDeg, length = 44, spreadDeg = 42) => {
  const back = ((angleDeg + 180) * Math.PI) / 180
  const spread = (spreadDeg * Math.PI) / 180
  return polyline([
    [x + length * Math.cos(back - spread), y + length * Math.sin(back - spread)],
    [x, y],
    [x + length * Math.cos(back + spread), y + length * Math.sin(back + spread)],
  ])
}

/** An arc that ends in a clockwise arrowhead. Angles in degrees, 0 = east, 90 = south. */
const arrowArc = (cx, cy, r, fromDeg, toDeg) => {
  const end = (toDeg * Math.PI) / 180
  const tipX = cx + r * Math.cos(end)
  const tipY = cy + r * Math.sin(end)
  return [...arc(cx, cy, r, fromDeg, toDeg), ...arrowHead(tipX, tipY, toDeg + 90)]
}

// --- PR status: one family, so open / draft / closed differ only on the right branch ---
const prLeftBranch = () => [ring(64, 60, 24), line(64, 84, 64, 172), ring(64, 196, 24)]

/**
 * Glyph path data by name. Each value is the `d` attribute of one path on the
 * 256-unit grid. Names are referenced from icon-sprite-map.mjs as `{ custom }`.
 */
export const CUSTOM_GLYPHS = {
  // Agent: an angular figure. Diamond head over chevron shoulders.
  "ax-agent": glyph(
    diamond(128, 76, 40),
    polyline([
      [52, 212],
      [128, 136],
      [204, 212],
    ]),
  ),

  // Auto: the agent diamond inside a two-arrow loop, "runs on its own".
  "ax-auto": glyph(arrowArc(128, 128, 88, 200, 320), arrowArc(128, 128, 88, 20, 140), diamond(128, 128, 30)),

  // Browser tools (WebMCP): a window whose content is the agent diamond.
  "ax-browser": glyph(roundedRect(32, 44, 192, 168, 22), line(32, 94, 224, 94), diamond(128, 156, 30)),

  // The `</>` brand mark from the app icon.
  "ax-mark": glyph(
    polyline([
      [84, 64],
      [28, 128],
      [84, 192],
    ]),
    line(150, 40, 106, 216),
    polyline([
      [172, 64],
      [228, 128],
      [172, 192],
    ]),
  ),

  "pr-open": glyph(
    prLeftBranch(),
    ring(192, 196, 24),
    line(192, 172, 192, 108),
    arc(152, 108, 40, 0, -90),
    line(152, 68, 124, 68),
    polyline([
      [148, 44],
      [124, 68],
      [148, 92],
    ]),
  ),

  "pr-draft": glyph(prLeftBranch(), ring(192, 196, 24), dot(192, 128, 14), dot(192, 76, 14)),

  "pr-closed": glyph(
    prLeftBranch(),
    ring(192, 196, 24),
    line(192, 172, 192, 128),
    line(170, 46, 214, 90),
    line(214, 46, 170, 90),
  ),
}
