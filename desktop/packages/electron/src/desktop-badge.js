"use strict"

const { crc32, deflateSync } = require("node:zlib")

const DIGITS = [
  "111101101101111",
  "010110010010111",
  "111001111100111",
  "111001111001111",
  "101101111001001",
  "111100111001111",
  "111100111101111",
  "111001001001001",
  "111101111101111",
  "111101111001111",
]

function pngChunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(payload))
  return Buffer.concat([length, payload, checksum])
}

function createBadgePng(count) {
  const size = 32
  // Each RGBA row starts with PNG's unfiltered scanline marker.
  const pixels = Buffer.alloc(size * (1 + size * 4))
  const paint = (x, y, rgba) => pixels.set(rgba, y * (1 + size * 4) + 1 + x * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - 15.5) ** 2 + (y - 15.5) ** 2 <= 15 ** 2) paint(x, y, [210, 32, 48, 255])
    }
  }
  const label = count > 99 ? "99+" : String(count)
  const scale = label.length > 2 ? 2 : 3
  const left = Math.floor((size - (label.length * 4 - 1) * scale) / 2)
  const top = Math.floor((size - 5 * scale) / 2)
  for (const [index, digit] of [...label].entries()) {
    const glyph = digit === "+" ? "000010111010000" : DIGITS[Number(digit)]
    for (let bit = 0; bit < glyph.length; bit++) {
      if (glyph[bit] !== "1") continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          paint(
            left + index * 4 * scale + (bit % 3) * scale + dx,
            top + Math.floor(bit / 3) * scale + dy,
            [255, 255, 255, 255],
          )
        }
      }
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6 // 8-bit RGBA
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

function setDesktopBadgeCount({ platform, app, window, nativeImage, count }) {
  const value = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  if (platform !== "win32") return app.setBadgeCount(value)
  if (!window || window.isDestroyed()) return false
  if (value === 0) window.setOverlayIcon(null, "")
  else window.setOverlayIcon(nativeImage.createFromBuffer(createBadgePng(value)), `${value} pending items`)
  return true
}

module.exports = { createBadgePng, setDesktopBadgeCount }
